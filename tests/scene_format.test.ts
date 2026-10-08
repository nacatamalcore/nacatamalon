import { afterEach, describe, expect, it, spyOn } from 'bun:test';
import { parseSceneDoc, SCENE_FORMAT, UNSUPPORTED_COMPONENTS } from '../src/scene/document';

/**
 * Reading a scene document, which has to work on anything.
 *
 * A scene is written by tools **and edited by hand**, so the reader's whole contract is that it
 * never throws: a field that is missing, of the wrong shape or plain nonsense falls back and the
 * level still opens. A reader that threw would mean one typo costs you the level, and it would cost
 * it at the worst possible moment, which is while somebody is editing.
 *
 * The other half of the contract is that **nothing is deleted on the way in**. A component this
 * version has never heard of, a field some tool left behind: both survive, because throwing them
 * away would quietly rewrite somebody's file the first time it was opened and saved here.
 */

let warn: ReturnType<typeof spyOn> | null = null;

const silence = () => {
    warn = spyOn(console, 'warn').mockImplementation(() => {});
    return warn;
};

afterEach(() => {
    warn?.mockRestore();
    warn = null;
});

/**
 * The smallest document that is a document, with whatever is being tested laid over it.
 */
const doc = (over: Record<string, unknown> = {}) => ({
    format: SCENE_FORMAT,
    version: 1,
    name: 'Level',
    assets: [],
    root: { id: 'root', name: 'Level', transform: null, components: [], children: [] },
    ...over,
});

const said = (): string => (warn?.mock.calls ?? []).map((call: unknown[]) => String(call[0])).join('\n');

describe('a document the reader cannot use', () => {
    it('never throws, whatever it is handed', () => {
        silence();
        for (const nonsense of [undefined, null, 42, 'a string', [], true, { }, { format: SCENE_FORMAT }]) {
            expect(() => parseSceneDoc(nonsense, '/scenes/x.scene')).not.toThrow();
        }
    });

    it('refuses a file that is not a scene of this engine, and says which file', () => {
        silence();
        const read = parseSceneDoc({ format: 'someone-elses-format', name: 'X' }, '/scenes/other.scene');

        expect(read.name).toBe('');
        expect(read.root.children).toHaveLength(0);
        expect(said()).toContain('/scenes/other.scene');
        expect(said()).toContain('someone-elses-format');
    });

    it('reads one from a newer version anyway, and says so', () => {
        silence();
        const read = parseSceneDoc(doc({ version: 99 }), '/scenes/future.scene');

        // Most of a newer document is still readable, and what is not is kept rather than lost.
        expect(read.name).toBe('Level');
        expect(said()).toContain('newer version (99)');
    });

    it('points out a scene with no name, because nothing could start it', () => {
        silence();
        const read = parseSceneDoc(doc({ name: 42 }), '/scenes/nameless.scene');

        expect(read.name).toBe('');
        expect(said()).toContain('no name');
    });
});

describe('what the reader keeps', () => {
    it('keeps a component it has never heard of, beside its box', () => {
        silence();
        const mystery = { type: 'physics2d', id: 'body', shape: 'circle', radius: 8 };
        const read = parseSceneDoc(doc({
            root: { id: 'root', name: 'Level', transform: null, components: [mystery], children: [] },
        }), '/scenes/x.scene');

        // Not drawn, not pretended to be understood, and not lost.
        expect(read.root.components).toHaveLength(0);
        expect(read.root.extra?.[UNSUPPORTED_COMPONENTS]).toEqual([mystery]);
        expect(said()).toContain('physics2d');
    });

    it('keeps a field on a box that belongs to somebody else', () => {
        silence();
        const read = parseSceneDoc(doc({
            root: { id: 'root', name: 'Level', transform: null, components: [], children: [], prefab: 'Car', note: { by: 'an importer' } },
        }), '/scenes/x.scene');

        // A link back to a reusable box, and a note a tool left. The engine acts on neither and
        // deletes neither: losing them is how a draft of this format broke prefabs.
        expect(read.root.extra?.prefab).toBe('Car');
        expect(read.root.extra?.note).toEqual({ by: 'an importer' });
    });

    it('says once how many it could not use, not once per component', () => {
        const spy = silence();
        parseSceneDoc(doc({
            root: {
                id: 'root', name: 'Level', transform: null, children: [],
                components: [{ type: 'physics2d' }, { type: 'physics2d' }, { type: 'script' }],
            },
        }), '/scenes/x.scene');

        const complaints = spy.mock.calls.filter((call: unknown[]) => String(call[0]).includes('does not know'));
        expect(complaints).toHaveLength(1);
        expect(String(complaints[0][0])).toContain('3 component(s)');
    });
});

describe('what the reader fills in', () => {
    it('leaves a field at its default out, rather than writing the default down', () => {
        const read = parseSceneDoc(doc({
            root: {
                id: 'root', name: 'Level', transform: null, children: [],
                components: [{ type: 'sprite', id: 's', texture: 'hero' }],
            },
        }), '/scenes/x.scene');

        // A written-down default is a decision somebody did not make, and the next version that
        // changes that default would not be able to tell the two apart.
        expect(read.root).not.toHaveProperty('visible');
        expect(read.root).not.toHaveProperty('screenSpace');
        expect(read.root.components[0]).not.toHaveProperty('flipX');
        expect(read.root.components[0]).not.toHaveProperty('zIndex');
    });

    it('completes a transform somebody wrote half of, and keeps `null` meaning nowhere', () => {
        const read = parseSceneDoc(doc({
            root: {
                id: 'root', name: 'Level', transform: null, components: [],
                children: [
                    { id: 'a', name: 'A', transform: { x: 40 }, components: [], children: [] },
                    { id: 'b', name: 'B', components: [], children: [] },
                ],
            },
        }), '/scenes/x.scene');

        expect(read.root.children[0].transform).toEqual({
            x: 40, y: 0, z: 0, rotation: 0, rotationX: 0, rotationY: 0, scaleX: 1, scaleY: 1, scaleZ: 1,
        });
        // A box that only groups is not anywhere, and that should cost nothing.
        expect(read.root.transform).toBeNull();
        expect(read.root.children[1].transform).toBeNull();
    });

    it('drops a knob that is not a number or a short list of them', () => {
        const read = parseSceneDoc(doc({
            root: {
                id: 'root', name: 'Level', transform: null, children: [],
                components: [{ type: 'sprite', id: 's', texture: null, uniforms: { good: 2, pair: [1, 0], bad: 'text', big: [1, 2, 3, 4, 5] } }],
            },
        }), '/scenes/x.scene');

        // One that is neither would reach the place the card's block is packed, and land as a hole.
        expect((read.root.components[0] as { uniforms?: Record<string, unknown> }).uniforms).toEqual({ good: 2, pair: [1, 0] });
    });

    it('takes an asset s `src` from its key when only one was written', () => {
        const read = parseSceneDoc(doc({
            assets: [
                { type: 'texture', key: '/assets/hero.png' },
                { type: 'bitmapFont', key: 'pac', json: '/f.json', atlas: '/f.png' },
                { type: 'font', key: 'inter', src: '/fonts/inter.ttf', size: 48 },
                { type: 'font', key: '/fonts/plain.woff' },
                { type: 'geometry', key: 'cube:1:1:1', source: { kind: 'cube' } },
                { type: 'nonsense', key: 'x' },
            ],
        }), '/scenes/x.scene');

        silence();
        expect(read.assets).toHaveLength(5);
        expect(read.assets[0]).toEqual({ type: 'texture', key: '/assets/hero.png', src: '/assets/hero.png' });
        expect(read.assets[1]).toEqual({ type: 'bitmapFont', key: 'pac', json: '/f.json', atlas: '/f.png' });
        expect(read.assets[2]).toEqual({ type: 'font', key: 'inter', src: '/fonts/inter.ttf', size: 48 });
        expect(read.assets[3]).toEqual({ type: 'font', key: '/fonts/plain.woff', src: '/fonts/plain.woff' });
        // A recipe, not the corners: `{ kind: 'cube' }` is the cube `useCubeGeometry({})` makes.
        expect(read.assets[4]).toEqual({ type: 'geometry', key: 'cube:1:1:1', source: { kind: 'cube' } });
    });
});

describe('the eight components', () => {
    const one = (component: Record<string, unknown>) => parseSceneDoc(doc({
        root: { id: 'root', name: 'Level', transform: null, children: [], components: [component] },
    }), '/scenes/x.scene').root.components[0];

    it('each come back as themselves', () => {
        expect(one({ type: 'sprite', id: 's', texture: 'hero' }).type).toBe('sprite');
        expect(one({ type: 'text', id: 't', text: 'HI', font: 'pac' }).type).toBe('text');
        expect(one({ type: 'mesh', id: 'm', geometry: 'cube' }).type).toBe('mesh');
        expect(one({ type: 'tilemap', id: 'l', map: 'level' }).type).toBe('tilemap');
        expect(one({ type: 'particles', id: 'p', effect: 'fire' }).type).toBe('particles');
        expect(one({ type: 'particles3d', id: 'p', effect: 'fire', transform: { z: 2 } })).toMatchObject({ type: 'particles3d', transform: { z: 2 } });
        expect(one({ type: 'camera2d', id: 'c' }).type).toBe('camera2d');
        expect(one({ type: 'camera3d', id: 'c' }).type).toBe('camera3d');
        expect(one({ type: 'light', id: 'l', kind: 'point' }).type).toBe('light');
    });

    it('gives a light only the fields its kind has', () => {
        const ambient = one({ type: 'light', id: 'l', kind: 'ambient' });
        const spot = one({ type: 'light', id: 'l', kind: 'spot' });

        // An ambient light has no direction and no reach, so it carries neither.
        expect(ambient).not.toHaveProperty('range');
        expect(ambient).not.toHaveProperty('ambient');
        expect(spot).toHaveProperty('range');
        expect(spot).toHaveProperty('angle');
        expect(spot).toHaveProperty('penumbra');
    });

    it('leaves an emitter s live state out, and keeps only what was authored', () => {
        const emitter = one({ type: 'particles', id: 'p', effect: 'fire', autoplay: false, emitting: true, paused: true });

        // A scene saved while an explosion happened to be mid-burst must not come back
        // permanently mid-burst.
        expect(emitter).not.toHaveProperty('emitting');
        expect(emitter).not.toHaveProperty('paused');
        expect(emitter).toMatchObject({ autoplay: false });
    });

    it('gives a camera and a lamp their own placement, and an ambient lamp none', () => {
        const camera = one({ type: 'camera2d', id: 'c', transform: { x: 10, y: 20 }, zoom: 2 });
        const lamp = one({ type: 'light', id: 'l', kind: 'point', transform: { x: 10, rotationY: 0.5 } });
        const ambient = one({ type: 'light', id: 'l', kind: 'ambient', transform: { x: 10 } });

        // Both carry it, and for one reason: composition deliberately does not reach them. Nothing
        // moves a camera, because it is what everything else is measured against.
        expect(camera).toMatchObject({ transform: { x: 10, y: 20, rotation: 0 }, zoom: 2 });
        // And a lamp is moved by the tree but never turned by it, so which way it faces has to be
        // its own: a lantern held by someone who spins must not sweep the room.
        expect(lamp).toMatchObject({ transform: { x: 10, y: 0, z: 0, rotationX: 0, rotationY: 0.5 } });
        // An ambient light is the whole room at once: no place and no direction.
        expect(ambient).not.toHaveProperty('transform');
    });
});
