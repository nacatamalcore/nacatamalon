import { afterEach, describe, expect, it, spyOn } from 'bun:test';
import { parseSceneDoc, sceneFromDoc, serializeScene } from '../src/scene/document';
import { runHookUpdates } from '../src/game/loop/runHookUpdates';
import { parseMotionDoc, MOTION_FORMAT, MOTION_VERSION } from '../src/motion';
import { sampleTrack, newTrackCursor } from '../src/motion/sample_track';
import { previewMotion, endMotionPreview } from '../src/motion/preview_motion';
import { setAttachmentHandle } from '../src/audio/attachment_players';
import { replaceMotionDoc } from '../src/loaders/motion';
import { serializeMotionDoc } from '../src/motion/serialize_motion_doc';
import { useMotion } from '../src/hooks/motion';
import { createScene } from '../src/scene/create_scene';
import { getActiveBox } from '../src/store';
import { createTestGame, startTestScene } from './helpers/test_game';
import { newPostEffect } from '../src/post/new_post_effect';
import { createSprite } from '../src/gameobjects/sprite/create_sprite';
import type { TBox } from '../src/box';
import type { TMotionDoc, TMotionHandle } from '../src/motion';
import type { TSoundAttachment, TSoundHandle } from '../src/audio';

/**
 * A motion: values of a scene moved over time by keys, and what happens on the way. Read from its
 * file, sampled at a moment, played a frame at a time on a scene, written down with the scene, and
 * shown at a moment by an editor without being played.
 */

let warn: ReturnType<typeof spyOn> | null = null;
let fetchSpy: ReturnType<typeof spyOn> | null = null;

afterEach(() => {
    warn?.mockRestore();
    warn = null;
    fetchSpy?.mockRestore();
    fetchSpy = null;
});

const quiet = () => {
    warn = spyOn(console, 'warn').mockImplementation(() => {});
    return warn;
};

const motion = (rest: Record<string, unknown>): TMotionDoc =>
    parseMotionDoc({ format: MOTION_FORMAT, version: MOTION_VERSION, duration: 1, tracks: [], events: [], ...rest }, 'test.motion');

/**
 * A field with a crate and a camera, the crate at x 0.
 */
const FIELD = parseSceneDoc({
    format: 'nacatamalon-scene', version: 1, name: 'field', assets: [],
    root: {
        id: 'field-root', name: 'Field', transform: null,
        components: [{ type: 'camera2d', id: 'cam', transform: { x: 0, y: 0, rotation: 0 }, zoom: 1 }],
        children: [{
            id: 'crate', name: 'Crate', transform: { x: 0, y: 0 },
            components: [{ type: 'sprite', id: 'crate-art', texture: null, tint: { r: 1, g: 1, b: 1, a: 1 }, width: 8, height: 8, transform: { x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1 } }],
            children: [],
        }],
    },
}, 'scenes/field.scene');

const SLIDE = (): TMotionDoc => motion({
    duration: 1,
    tracks: [{ box: 'crate', name: 'Crate', path: 'x', keys: [{ t: 0, v: 0 }, { t: 1, v: 100 }] }],
});

/**
 * The field playing a motion from code on its root, with a hand-cranked clock.
 */
const playing = (doc: TMotionDoc, options: Parameters<typeof useMotion>[1] = {}) => {
    const { store } = createTestGame();
    let handle!: TMotionHandle;
    const build = sceneFromDoc(FIELD, 'field');
    const root = startTestScene(store, 'field', () => {
        const scene = build();
        handle = useMotion(doc, options);
        return scene;
    });
    const crate = root.children.find((child) => child.name === 'Crate')!;
    return { store, root, crate, handle, tick: (seconds: number) => runHookUpdates(root, seconds) };
};

describe('reading a .motion file', () => {
    it('refuses a file that does not say it is a motion', () => {
        expect(() => parseMotionDoc({ format: 'nacatamalon-scene', duration: 1 }, 'x.motion')).toThrow('motion "x.motion"');
    });

    it('refuses a track with no keys and a duration that is not above 0', () => {
        expect(() => motion({ tracks: [{ box: 'a', path: 'x', keys: [] }] })).toThrow('at least one key');
        expect(() => motion({ duration: 0 })).toThrow('"duration"');
    });

    it('puts the keys and the events in order of time', () => {
        const read = motion({
            tracks: [{ box: 'a', path: 'x', keys: [{ t: 1, v: 10 }, { t: 0, v: 0 }] }],
            events: [{ t: 0.5, kind: 'mark', name: 'late' }, { t: 0.1, kind: 'mark', name: 'early' }],
        });
        expect(read.tracks[0]!.keys.map((key) => key.t)).toEqual([0, 1]);
        expect(read.events.map((event) => event.t)).toEqual([0.1, 0.5]);
    });

    it('moves along a straight line where the file names a curve that does not exist, and says so', () => {
        const said = quiet();
        const read = motion({ tracks: [{ box: 'a', path: 'x', keys: [{ t: 0, v: 0 }, { t: 1, v: 1, ease: 'easeSideways' }] }] });
        expect(read.tracks[0]!.keys[1]!.ease).toBeUndefined();
        expect(String(said.mock.calls[0]![0])).toContain('easeSideways');
    });

    it('is written back as text that reads back the same, a key a line', () => {
        const read = motion({
            duration: 6, loop: true,
            tracks: [{ box: 'cam', name: 'Camera', component: 'c1', path: 'zoom', keys: [{ t: 0, v: 3 }, { t: 4, v: 1, ease: 'easeInOutSine' }] }],
            events: [{ t: 6, kind: 'scene', scene: 'Title', transition: { type: 'fade', ms: 400 } }],
        });
        const text = serializeMotionDoc(read);
        expect(parseMotionDoc(JSON.parse(text), 'again')).toEqual(read);
        expect(text).toContain('\n            {"t":4,"v":1,"ease":"easeInOutSine"}\n');
        expect(serializeMotionDoc(motion({}))).toContain('"tracks": [],');
    });

    it('reads a transition in seconds, and an old one that said its milliseconds', () => {
        const read = motion({
            events: [
                { t: 0, kind: 'scene', scene: 'A', transition: { type: 'fade', duration: 0.4 } },
                { t: 0, kind: 'scene', scene: 'B', transition: { type: 'iris', ms: 400 } },
            ],
        });
        expect(read.events.map((e) => (e as { transition?: unknown }).transition)).toEqual([
            { type: 'fade', duration: 0.4 },
            { type: 'iris', duration: 0.4 },
        ]);
        // Written back in seconds: the old field does not come back.
        expect(serializeMotionDoc(read)).not.toContain('"ms"');
    });

    it('refuses an event of a kind it does not know', () => {
        expect(() => motion({ events: [{ t: 0, kind: 'explode' }] })).toThrow('"kind"');
    });
});

describe('a track at a moment', () => {
    const track = motion({
        tracks: [{ box: 'a', path: 'x', keys: [{ t: 1, v: 10 }, { t: 3, v: 30 }, { t: 4, v: 0, ease: 'easeInQuad' }] }],
    }).tracks[0]!;

    it('holds the first key before it and the last after it', () => {
        expect(sampleTrack(track, 0, newTrackCursor())).toBe(10);
        expect(sampleTrack(track, 9, newTrackCursor())).toBe(0);
    });

    it('moves between two keys along the curve of the later one', () => {
        expect(sampleTrack(track, 2, newTrackCursor())).toBe(20);
        // Half way along easeInQuad is a quarter of the way.
        expect(sampleTrack(track, 3.5, newTrackCursor())).toBeCloseTo(30 - 30 * 0.25, 10);
    });

    it('finds the right keys going back in time from where it was', () => {
        const cursor = newTrackCursor();
        expect(sampleTrack(track, 3.5, cursor)).toBeCloseTo(22.5, 10);
        expect(sampleTrack(track, 1.5, cursor)).toBe(15);
    });

    it('holds a yes/no until the next key', () => {
        const seen = motion({ tracks: [{ box: 'a', path: 'visible', keys: [{ t: 0, v: false }, { t: 1, v: true }] }] }).tracks[0]!;
        expect(sampleTrack(seen, 0.99, newTrackCursor())).toBe(false);
        expect(sampleTrack(seen, 1, newTrackCursor())).toBe(true);
    });
});

describe('useMotion', () => {
    it('moves a box a frame at a time, from the start on the first frame', () => {
        const { crate, handle, tick } = playing(SLIDE());
        handle.play();
        tick(1 / 60);
        expect(crate.transform!.x).toBe(0);
        tick(0.5);
        expect(crate.transform!.x).toBeCloseTo(50, 10);
    });

    it('starts by itself with autoplay, and stays where it is while paused', async () => {
        const { crate, handle, tick } = playing(SLIDE(), { autoplay: true });
        await Promise.resolve();
        await Promise.resolve();
        tick(0);
        tick(0.25);
        handle.pause();
        tick(0.5);
        expect(crate.transform!.x).toBeCloseTo(25, 10);
        handle.resume();
        tick(0.25);
        expect(crate.transform!.x).toBeCloseTo(50, 10);
    });

    it('lands on its last key at the end, says so once, and stops', () => {
        const { crate, handle, tick } = playing(SLIDE());
        let ends = 0;
        handle.onEnd(() => { ends += 1; });
        handle.play();
        tick(0);
        tick(5);
        tick(1);
        expect(crate.transform!.x).toBe(100);
        expect(ends).toBe(1);
        expect(handle.playing).toBe(false);
    });

    it('plays its marks once each when played past, the one at the start too, even in one long frame', () => {
        const doc = { ...SLIDE(), events: motion({ events: [{ t: 0, kind: 'mark', name: 'go' }, { t: 0.5, kind: 'mark', name: 'half' }] }).events };
        const { handle, tick } = playing(doc);
        const heard: string[] = [];
        handle.on('go', () => heard.push('go'));
        handle.on('half', () => heard.push('half'));
        handle.play();
        tick(0);
        tick(2);
        tick(1);
        expect(heard).toEqual(['go', 'half']);
    });

    it('goes round again when it loops, with its marks', () => {
        const doc = { ...SLIDE(), loop: true, events: motion({ events: [{ t: 0.5, kind: 'mark', name: 'half' }] }).events };
        const { crate, handle, tick } = playing(doc);
        let halves = 0;
        handle.on('half', () => { halves += 1; });
        handle.play();
        tick(0);
        tick(0.75);
        tick(0.25);
        expect(halves).toBe(1);
        tick(0.6);
        expect(halves).toBe(2);
        expect(crate.transform!.x).toBeCloseTo(60, 10);
        expect(handle.playing).toBe(true);
    });

    it('moves a camera kept by the scene, found by its component id', () => {
        const { root, handle, tick } = playing(motion({ tracks: [{ box: 'field-root', component: 'cam', path: 'zoom', keys: [{ t: 0, v: 3 }, { t: 1, v: 1 }] }] }));
        handle.play();
        tick(0);
        expect(root.camera2d!.zoom).toBe(3);
        tick(0.5);
        expect(root.camera2d!.zoom).toBeCloseTo(2, 10);
    });

    it('moves a picture\'s tint', () => {
        const { crate, handle, tick } = playing(motion({ tracks: [{ box: 'crate', component: 'crate-art', path: 'tint.a', keys: [{ t: 0, v: 0 }, { t: 1, v: 1 }] }] }));
        handle.play();
        tick(0);
        tick(0.25);
        expect((crate.drawables[0] as { tint: { a: number } }).tint.a).toBeCloseTo(0.25, 10);
    });

    it('says once which track moves nothing and why, and plays the rest', () => {
        const said = quiet();
        const doc = motion({
            tracks: [
                { box: 'ghost', name: 'Ghost', path: 'x', keys: [{ t: 0, v: 1 }] },
                { box: 'crate', path: 'texture', keys: [{ t: 0, v: 1 }] },
                { box: 'crate', path: 'x', keys: [{ t: 0, v: 7 }] },
            ],
        });
        const { crate, handle, tick } = playing(doc);
        handle.play();
        tick(0);
        tick(0.1);
        expect(crate.transform!.x).toBe(7);
        const lines = (said.mock.calls as unknown[][]).map((call) => String(call[0]));
        expect(lines.filter((line) => line.includes('Ghost'))).toHaveLength(1);
        expect(lines.some((line) => line.includes('"texture"'))).toBe(true);
    });

    it('finds a box by name when no box has its id', () => {
        const { crate, handle, tick } = playing(motion({ tracks: [{ box: 'another-copy', name: 'Crate', path: 'y', keys: [{ t: 0, v: 9 }] }] }));
        handle.play();
        tick(0);
        expect(crate.transform!.y).toBe(9);
    });

    it('plays a sound a box carries', () => {
        const { store } = createTestGame();
        let played = 0;
        const doc = motion({ events: [{ t: 0.2, kind: 'sound', box: 'crowd', component: 'roar' }] });
        let handle!: TMotionHandle;
        const root = startTestScene(store, 'stands', () => {
            const self = getActiveBox() as TBox;
            self.id = 'crowd';
            const sound = { type: 'sound', id: 'roar' } as unknown as TSoundAttachment;
            self.sounds.push(sound);
            setAttachmentHandle(sound, { play: () => { played += 1; } } as unknown as TSoundHandle);
            handle = useMotion(doc);
            return createScene();
        });
        handle.play();
        runHookUpdates(root, 0);
        runHookUpdates(root, 0.1);
        expect(played).toBe(0);
        runHookUpdates(root, 0.2);
        expect(played).toBe(1);
    });
});

describe('a motion in a scene document', () => {
    const MOTION_JSON = { format: MOTION_FORMAT, version: 1, duration: 1, tracks: [{ box: 'crate', path: 'x', keys: [{ t: 0, v: 0 }, { t: 1, v: 100 }] }], events: [] };
    const withMotion = (autoplay: boolean) => parseSceneDoc({
        ...FIELD,
        assets: [{ type: 'motion', key: 'intro', src: '/motions/intro.motion' }],
        root: { ...FIELD.root, components: [...FIELD.root.components, { type: 'motion', id: 'intro-player', motion: 'intro', autoplay }] },
    }, 'scenes/field.scene');

    const serve = () => {
        fetchSpy = spyOn(globalThis, 'fetch').mockImplementation((async () => ({ ok: true, json: async () => MOTION_JSON })) as unknown as typeof fetch);
    };
    const settle = async () => {
        for (let i = 0; i < 6; i += 1) await Promise.resolve();
    };

    it('plays by itself and is written back down as it was', async () => {
        serve();
        const { store } = createTestGame();
        const root = startTestScene(store, 'field', sceneFromDoc(withMotion(true), 'field'));
        await settle();
        runHookUpdates(root, 0);
        runHookUpdates(root, 0.5);
        expect(root.children[0]!.transform!.x).toBeCloseTo(50, 10);

        const written = serializeScene(root);
        expect(written.assets).toContainEqual({ type: 'motion', key: 'intro', src: '/motions/intro.motion' });
        expect(written.root.components).toContainEqual({ type: 'motion', id: 'intro-player', motion: 'intro', autoplay: true });
    });

    it('takes a file saved again while it plays, from the same moment', async () => {
        serve();
        const { store } = createTestGame();
        const root = startTestScene(store, 'field', sceneFromDoc(withMotion(true), 'field'));
        await settle();
        runHookUpdates(root, 0);
        runHookUpdates(root, 0.5);
        const changed = parseMotionDoc({ ...MOTION_JSON, tracks: [{ box: 'crate', path: 'x', keys: [{ t: 0, v: 0 }, { t: 1, v: 10 }] }] }, 'intro');
        expect(replaceMotionDoc(store, 'motions/intro.motion', changed)).toBe(1);
        runHookUpdates(root, 0.25);
        expect(root.children[0]!.transform!.x).toBeCloseTo(7.5, 10);
    });

    it('stays still in a scene being shown rather than played', async () => {
        serve();
        const { store } = createTestGame();
        const root = startTestScene(store, 'field', sceneFromDoc(withMotion(true), 'field', { scripts: 'attach' }));
        await settle();
        runHookUpdates(root, 0);
        runHookUpdates(root, 0.5);
        expect(root.children[0]!.transform!.x).toBe(0);
    });
});

describe('a motion shown at a moment by an editor', () => {
    it('puts the scene at that moment without playing, and puts it back after', () => {
        const { store } = createTestGame();
        const root = startTestScene(store, 'field', sceneFromDoc(FIELD, 'field', { scripts: 'attach' }));
        const crate = root.children[0]!;
        const doc = motion({
            tracks: [
                { box: 'crate', path: 'x', keys: [{ t: 0, v: 0 }, { t: 1, v: 100 }] },
                { box: 'field-root', component: 'cam', path: 'zoom', keys: [{ t: 0, v: 3 }, { t: 1, v: 1 }] },
                { box: 'nobody', path: 'x', keys: [{ t: 0, v: 0 }] },
            ],
            events: [{ t: 0.1, kind: 'mark', name: 'never' }],
        });

        const first = previewMotion(store, doc, 0.25);
        expect(first.moved).toBe(2);
        expect(first.problems).toHaveLength(1);
        expect(crate.transform!.x).toBe(25);
        previewMotion(store, doc, 0.75);
        expect(crate.transform!.x).toBe(75);
        expect(root.camera2d!.zoom).toBeCloseTo(1.5, 10);

        expect(endMotionPreview(store)).toBe(2);
        expect(crate.transform!.x).toBe(0);
        expect(root.camera2d!.zoom).toBe(1);
        expect(endMotionPreview(store)).toBe(0);
    });

    it('moves a screen effect by its name, and a picture\'s knob that only its material had', () => {
        const { store } = createTestGame();
        const vignette = newPostEffect({ name: 'vignette', uniforms: { strength: 0.2 } }, null, 'project');
        store.get('post').effects.push(vignette);
        const root = startTestScene(store, 'Level', () => {
            const art = createSprite({ width: 8, height: 8 });
            art.id = 'art';
            // A material that has the knob; the picture has no value of its own for it yet.
            art.material = { uniforms: { amount: 0.5 } } as never;
            return createScene();
        });
        root.id = 'level';
        const picture = root.drawables[0] as unknown as { uniforms?: Record<string, number> };
        const doc = motion({
            tracks: [
                { post: 'vignette', path: 'uniforms.strength', keys: [{ t: 0, v: 0 }, { t: 1, v: 1 }] },
                { box: 'level', component: 'art', path: 'uniforms.amount', keys: [{ t: 0, v: 0 }, { t: 1, v: 1 }] },
                { post: 'nowhere', path: 'enabled', keys: [{ t: 0, v: true }] },
            ],
        });

        const shown = previewMotion(store, doc, 0.25);
        expect(shown.moved).toBe(2);
        expect(shown.problems).toEqual(['track 3 (screen effect nowhere enabled): the game has no screen effect called "nowhere"']);
        expect(vignette.uniforms.strength).toBe(0.25);
        expect(picture.uniforms?.amount).toBe(0.25);

        endMotionPreview(store);
        expect(vignette.uniforms.strength).toBe(0.2);
        // Written down and read again, a screen effect's track keeps naming it.
        expect(parseMotionDoc(JSON.parse(serializeMotionDoc(doc)), 'again.motion').tracks[0]).toMatchObject({ box: '', post: 'vignette', path: 'uniforms.strength' });
    });
});

describe('a motion written before knobs were renamed', () => {
    const track = (rest: Record<string, unknown>) => ({ keys: [{ t: 0, v: 0 }], ...rest });

    it('reads a file of version 1 with the names the knobs have now, and says so once', () => {
        const said = quiet();
        const doc = motion({
            version: 1,
            tracks: [
                track({ post: 'dither', path: 'uniforms.strength' }),
                track({ box: 'level', component: 'robot', path: 'uniforms.rim2Strength' }),
                track({ box: 'level', component: 'robot', path: 'uniforms.mangaDotsSize' }),
                track({ box: 'level', component: 'robot', path: 'uniforms.mangaDotsSpacing' }),
                track({ box: 'level', path: 'x' }),
            ],
        });
        expect(doc.tracks.map((one) => one.path)).toEqual([
            'uniforms.amount', 'uniforms.rim2Amount', 'uniforms.mangaDotsFill', 'uniforms.mangaDotsSize', 'x',
        ]);
        expect(doc.version).toBe(MOTION_VERSION);
        expect(said).toHaveBeenCalledTimes(1);
        expect(String(said.mock.calls[0]![0])).toContain("'uniforms.strength' as 'uniforms.amount'");
    });

    it('leaves a file of version 2 as it is: its mangaDotsSize is the spacing', () => {
        const said = quiet();
        const doc = motion({ version: 2, tracks: [track({ box: 'level', component: 'robot', path: 'uniforms.mangaDotsSize' })] });
        expect(doc.tracks[0]!.path).toBe('uniforms.mangaDotsSize');
        expect(said).not.toHaveBeenCalled();
    });

    it('reads halftone\'s angle of a file of version 2 as its rotation, from degrees to radians', () => {
        quiet();
        const doc = motion({ version: 2, tracks: [{ ...track({ post: 'halftone', path: 'uniforms.angle' }), keys: [{ t: 0, v: 0 }, { t: 1, v: 90 }] }] });
        expect(doc.tracks[0]!.path).toBe('uniforms.rotation');
        expect(doc.tracks[0]!.keys.map((key) => key.v)).toEqual([0, Math.PI / 2]);
    });

    it('reads the angle of a halftone a project named itself, in a file of version 2, in radians', () => {
        quiet();
        // The file cannot tell from 'comic' that it is a halftone; only halftone ever had an angle.
        const doc = motion({ version: 2, tracks: [{ ...track({ post: 'comic', path: 'uniforms.angle' }), keys: [{ t: 0, v: 0 }, { t: 1, v: 90 }] }] });
        expect(doc.tracks[0]!.path).toBe('uniforms.rotation');
        expect(doc.tracks[0]!.keys.map((key) => key.v)).toEqual([0, Math.PI / 2]);
        expect(doc.version).toBe(MOTION_VERSION);
    });

    it('finds an engine effect\'s renamed knob on an effect a project named itself', () => {
        const { store } = createTestGame();
        const grainy = newPostEffect({ name: 'grainy', uniforms: { levels: 8, amount: 1 } }, null, 'project');
        store.get('post').effects.push(grainy);
        startTestScene(store, 'Level', () => createScene());
        const doc = motion({ version: 2, tracks: [{ post: 'grainy', path: 'uniforms.strength', keys: [{ t: 0, v: 0 }, { t: 1, v: 1 }] }] });

        expect(previewMotion(store, doc, 0.5).moved).toBe(1);
        expect(grainy.uniforms.amount).toBe(0.5);
        endMotionPreview(store);
    });

    it('finds an engine effect a project left unnamed by the key it had before', () => {
        const { store } = createTestGame();
        const matched = newPostEffect({ name: 'paletteMatch', uniforms: { dither: 0 } }, null, 'project');
        store.get('post').effects.push(matched);
        startTestScene(store, 'Level', () => createScene());
        const doc = motion({ tracks: [{ post: 'palette', path: 'uniforms.dither', keys: [{ t: 0, v: 0 }, { t: 1, v: 1 }] }] });

        expect(previewMotion(store, doc, 0.5).moved).toBe(1);
        expect(matched.uniforms.dither).toBe(0.5);
        endMotionPreview(store);
    });
});
