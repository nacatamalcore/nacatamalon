import { afterEach, describe, expect, it, mock, spyOn } from 'bun:test';
import { createScene } from '../src/scene/create_scene';
import { createSprite } from '../src/gameobjects/sprite/create_sprite';
import { createSpriteAtlas } from '../src/atlas/create_sprite_atlas';
import { createParticles, particleCount, particleStateOf } from '../src/gameobjects/particles';
import { destroy } from '../src/destroy/destroy';
import { runHookUpdates } from '../src/game/loop/runHookUpdates';
import { createFrameContext } from '../src/game/loop/create_frame_context';
import { fillFrameContext } from '../src/game/loop/fill_frame_context';
import { useSpriteAnimation } from '../src/hooks/animation/use_sprite_animation';
import { useLoadAtlas } from '../src/hooks/loaders/use_load_atlas';
import { useLoadTexture } from '../src/hooks/loaders/use_load_texture';
import { runLength, runPlace } from '../src/hooks/animation/run_place';
import { particleRunOf, runWindowAt, waitsForSheet } from '../src/gameobjects/particles/particle_run';
import { simulateParticles } from '../src/gameobjects/particles/simulate_particles';
import { createParticleState } from '../src/gameobjects/particles/particle_pool';
import { fileFromEffect } from '../src/loaders/particles/file_from_effect';
import { loadParticles, particlesAtlas, particlesTexture } from '../src/loaders/particles/load_particles';
import { newParticlesFile } from '../src/loaders/particles/new_particles_file';
import { parseParticlesDoc } from '../src/loaders/particles/parse_particles_doc';
import { serializeParticlesDoc } from '../src/loaders/particles/serialize_particles_doc';
import { newAtlas } from '../src/loaders/atlas/new_atlas';
import { noteSheetUser, sheetUsersOf } from '../src/loaders/sheet_users';
import { applyParticlesDoc } from '../src/gameobjects/particles/tools/apply_particles_doc';
import { PARTICLE_FLOATS, PARTICLE_OFFSET } from '../src/render/shared/particle_instance';
import { PARTICLES_SHADER } from '../src/render/webgpu/particles/particles_shader';
import { PARTICLES_3D_SHADER } from '../src/render/webgpu/particles/particles_3d_shader';
import { PARTICLES_3D_VERTEX_SHADER, PARTICLES_FRAGMENT_SHADER, PARTICLES_VERTEX_SHADER } from '../src/render/webgl2/particles/particles_shader';
import { createGameHandle } from '../src/game/handle';
import { createTestGame, startTestScene } from './helpers/test_game';
import { noTint, somewhere } from './helpers/particles';
import type { TAnimationClip, TSpriteAnimationOptions } from '../src/hooks/animation/types/t_sprite_animation';
import type { TLoadedAtlas } from '../src/loaders/atlas/types/t_loaded_atlas';
import type { TParticlesEffect2d, TParticlesDoc2d, TParticlesFile } from '../src/loaders/particles';
import type { TParticles } from '../src/gameobjects/particles';
import type { TSprite } from '../src/gameobjects/sprite/types/t_sprite';
import type { TBox } from '../src/box';
import type { TTexture } from '../src/loaders';
import type { TRuntimeStore } from '../src/store';

/**
 * Particles that take their picture from a sheet: one frame, or a run every particle plays from its
 * birth, over its life or at its own pace, walked the way a sprite walks it.
 */

(globalThis as { requestAnimationFrame?: (cb: FrameRequestCallback) => number }).requestAnimationFrame = () => 0;

afterEach(() => { mock.restore(); });

const picture = (key = 'sheet'): TTexture => ({
    type: 'texture', key, src: `/${key}.png`, status: 'ready', width: 64, height: 16,
    gpu: { resourceType: 'texture' },
}) as unknown as TTexture;

/** Four frames in a row, 16 by 16. */
const sheet = () => createSpriteAtlas({ texture: picture(), columns: 4 });

/** A sheet as a finished `useLoadAtlas` leaves it: two rows of four, two named, two runs. */
const loadedSheet = (src = '/fx/sheet.atlas'): TLoadedAtlas => {
    const atlas = newAtlas(src, src);
    atlas.texture = picture(`${src}:texture`);
    atlas.columns = 4;
    atlas.rows = 2;
    atlas.frames = 8;
    atlas.names = { spark: 5, smoke: 6 };
    atlas.sequences = { burn: { frames: [4, 5, 6, 7], fps: 10 }, puff: { frames: [0, 1, 2], loop: false } };
    atlas.status = 'ready';
    return atlas;
};

const fileOf = (fields: Record<string, unknown>, atlas: TParticlesFile['atlas'], clip: TAnimationClip | null = null): TParticlesFile => {
    const file = newParticlesFile('/fx/burst.particles', '/fx/burst.particles');
    file.doc = parseParticlesDoc({ kind: 'particles-2d', ...fields }, file.src);
    file.atlas = atlas;
    file.clip = clip;
    file.status = 'ready';
    return file;
};

/** The frame a particle of `life` seconds shows at `age`, as its column in a row of four. */
const frameAt = (file: TParticlesFile, age: number, life: number, columns = 4, rows = 1): number => {
    const run = particleRunOf(file)!;
    const at = runWindowAt(run, age, life);
    return Math.round(run.windows[at]! * columns) + Math.round(run.windows[at + 1]! * rows) * columns;
};

const quiet = () => spyOn(console, 'warn').mockImplementation(() => {});

// ---------------------------------------------------------------- the walk

describe('a run walked by its age', () => {
    it('counts every time it goes again as a repeat, the way back of a yoyo included', () => {
        const walk = (repeats: number) => Array.from({ length: runLength(4, true, repeats) }, (_, k) => runPlace(4, true, repeats, k));

        expect(walk(0)).toEqual([0, 1, 2, 3]);
        expect(walk(1)).toEqual([0, 1, 2, 3, 2, 1, 0]);
        expect(walk(2)).toEqual([0, 1, 2, 3, 2, 1, 0, 1, 2, 3]);
        // Past the end it rests where the last time through ended.
        expect([runPlace(4, true, 1, 50), runPlace(4, true, 2, 50), runPlace(4, false, 1, 50)]).toEqual([0, 3, 3]);
        expect(runPlace(4, false, Infinity, 9)).toBe(1);
        expect(runPlace(1, true, 3, 7)).toBe(0);
    });

    const sprite = (options: TSpriteAnimationOptions) => {
        const { store } = createTestGame();
        const atlas = createSpriteAtlas({ texture: picture(), columns: 8 });
        let shown!: TSprite;
        const root: TBox = startTestScene(store, 'Level', () => {
            shown = createSprite({ atlas, transform: { x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1 } });
            useSpriteAnimation(shown, options);
            return createScene();
        });
        return { frame: () => Math.round((shown.uvOffset?.x ?? 0) * 8), tick: () => runHookUpdates(root, 0.1) };
    };

    it('shows what useSpriteAnimation shows, picture for picture, for every way a run can go', () => {
        const clips: TAnimationClip[] = [
            { frames: [2, 3, 4, 5], fps: 10 },
            { frames: [2, 3, 4, 5], fps: 10, loop: false },
            { frames: [2, 3, 4, 5], fps: 10, repeat: 2 },
            { frames: [2, 3, 4, 5], fps: 10, yoyo: true },
            { frames: [2, 3, 4, 5], fps: 10, yoyo: true, repeat: 1 },
            { frames: [2, 3, 4, 5], fps: 10, yoyo: true, repeat: 2 },
            { frames: [6, 1, 6, 0], fps: 10, yoyo: true, repeat: 3 },
            { frames: [7], fps: 10, yoyo: true, repeat: 4 },
        ];
        for (const clip of clips) {
            const { frame, tick } = sprite({ clips: { run: clip }, play: 'run' });
            const repeats = clip.repeat ?? ((clip.loop ?? true) ? Infinity : 0);
            const yoyo = (clip.yoyo ?? false) && clip.frames.length > 1;
            for (let k = 0; k < 30; k++) {
                expect([k, frame()]).toEqual([k, clip.frames[runPlace(clip.frames.length, yoyo, repeats, k)]!]);
                tick();
            }
        }
    });
});

// ---------------------------------------------------------------- the pace

describe('a run over a particle\'s life', () => {
    it('starts on its first frame at birth and ends on its last as the particle dies', () => {
        const file = fileOf({}, sheet(), { frames: [0, 1, 2, 3] });

        expect([0, 0.24, 0.25, 0.5, 0.75, 0.99, 1].map((age) => frameAt(file, age, 1))).toEqual([0, 0, 1, 2, 3, 3, 3]);
    });

    it('goes as fast as the life is short: half the life, twice the pace', () => {
        const file = fileOf({}, sheet(), { frames: [0, 1, 2, 3] });

        expect([frameAt(file, 0.25, 1), frameAt(file, 0.25, 0.5)]).toEqual([1, 2]);
    });

    it('fits the whole of a yoyo with its repeats into the life, counted as a sprite counts them', () => {
        const file = fileOf({}, sheet(), { frames: [0, 1, 2, 3], yoyo: true, repeat: 1 });

        expect(Array.from({ length: 7 }, (_, k) => frameAt(file, (k + 0.5) / 7, 1))).toEqual([0, 1, 2, 3, 2, 1, 0]);
    });

    it('plays a run that loops for ever once, since a life always ends', () => {
        const file = fileOf({}, sheet(), { frames: [0, 1, 2, 3], repeat: -1 });

        expect([0.1, 0.9].map((age) => frameAt(file, age, 1))).toEqual([0, 3]);
    });
});

describe('a run at its own pace', () => {
    it('moves on fps times a second from birth and rests on its last frame if it ends first', () => {
        const file = fileOf({ animPace: 'clip' }, sheet(), { frames: [0, 1, 2, 3], fps: 10, loop: false });

        expect([0, 0.05, 0.15, 0.35, 2].map((age) => frameAt(file, age, 5))).toEqual([0, 0, 1, 3, 3]);
    });

    it('goes round for as long as the particle lives when it loops', () => {
        const file = fileOf({ animPace: 'clip' }, sheet(), { frames: [0, 1, 2, 3], fps: 10 });

        expect([0.45, 0.85].map((age) => frameAt(file, age, 5))).toEqual([0, 0]);
        expect(frameAt(file, 0.55, 5)).toBe(1);
    });

    it('counts a part of a repeat as a whole one, as a sprite does', () => {
        const file = fileOf({ animPace: 'clip' }, sheet(), { frames: [0, 1, 2], fps: 10, repeat: 2.2 });

        // Three times through and then a fourth: the sprite goes again while any repeat is left.
        expect([frameAt(file, 1.05, 5), frameAt(file, 5, 5)]).toEqual([1, 2]);
    });

    it('is written back only when it is not the default', () => {
        const paced = (pace?: string) => JSON.parse(serializeParticlesDoc(parseParticlesDoc({ kind: 'particles-2d', animPace: pace }, '/a.particles'))).animPace;

        expect([paced('clip'), paced('life'), paced(undefined), paced('fast')]).toEqual(['clip', undefined, undefined, undefined]);
    });
});

// ---------------------------------------------------------------- which frame

describe('which frame of the sheet', () => {
    it('takes a frame by its place, or by its name in a packed sheet', () => {
        expect(frameAt(fileOf({ frame: 3 }, loadedSheet()), 0, 1, 4, 2)).toBe(3);
        expect(frameAt(fileOf({ frame: 'smoke' }, loadedSheet()), 0, 1, 4, 2)).toBe(6);
    });

    it('plays a run the sheet names, and frame wins when both are given', () => {
        expect(frameAt(fileOf({ anim: 'burn' }, loadedSheet()), 0.5, 1, 4, 2)).toBe(6);
        expect(frameAt(fileOf({ anim: 'burn', frame: 1 }, loadedSheet()), 0.5, 1, 4, 2)).toBe(1);
    });

    it('takes the first frame with neither', () => {
        expect(frameAt(fileOf({}, loadedSheet()), 0.5, 1, 4, 2)).toBe(0);
    });

    it('says once that a frame or a run is not on the sheet, and draws the first frame', () => {
        const warn = quiet();
        const missing = fileOf({ frame: 'fire' }, loadedSheet());
        const far = fileOf({ frame: 12 }, loadedSheet());
        const nameless = fileOf({ anim: 'melt' }, loadedSheet());
        for (let i = 0; i < 3; i++) {
            expect([frameAt(missing, 0, 1, 4, 2), frameAt(far, 0, 1, 4, 2), frameAt(nameless, 0, 1, 4, 2)]).toEqual([0, 0, 0]);
        }
        const said = warn.mock.calls.map((call) => String(call[0]));
        expect(said).toHaveLength(3);
        expect(said[0]).toContain('asks for frame "fire", and its sheet has frames 0 to 7, named spark, smoke');
        expect(said[1]).toContain('asks for frame 12');
        expect(said[2]).toContain("plays the run 'melt', which its sheet does not have (it has burn, puff)");
    });

    it('leaves out of a run the frames the sheet does not have, said once', () => {
        const warn = quiet();
        const file = fileOf({}, sheet(), { frames: [0, 9, 1] });

        expect([0.1, 0.9].map((age) => frameAt(file, age, 1))).toEqual([0, 1]);
        expect(particleRunOf(file)!.count).toBe(2);
        expect(warn.mock.calls).toHaveLength(1);
    });

    it('does not take a name every object has for a frame or a run', () => {
        const warn = quiet();
        for (const name of ['constructor', 'toString', '__proto__', 'hasOwnProperty']) {
            expect(frameAt(fileOf({ frame: name }, loadedSheet()), 0, 1, 4, 2)).toBe(0);
            expect(frameAt(fileOf({ anim: name }, loadedSheet()), 0, 1, 4, 2)).toBe(0);
        }
        expect(warn.mock.calls).toHaveLength(8);
    });

    it('works its frames out again when a new document is laid on, as an editor does', () => {
        const file = fileOf({ frame: 1 }, sheet());
        expect(frameAt(file, 0, 1)).toBe(1);

        file.doc = parseParticlesDoc({ kind: 'particles-2d', frame: 3 }, file.src);
        expect(frameAt(file, 0, 1)).toBe(3);

        file.doc = parseParticlesDoc({ kind: 'particles-2d', animPace: 'clip' }, file.src);
        file.clip = { frames: [0, 1, 2, 3], fps: 10 };
        expect([particleRunOf(file)!.pace, frameAt(file, 0.15, 5)]).toEqual(['clip', 1]);
    });

    it('waits for a sheet still on its way, and works it out once it lands', () => {
        const atlas = loadedSheet();
        atlas.status = 'loading';
        atlas.frames = 0;
        const file = fileOf({ frame: 'spark' }, atlas);

        expect([particleRunOf(file), waitsForSheet(file)]).toEqual([null, true]);
        atlas.status = 'ready';
        atlas.frames = 8;
        expect(waitsForSheet(file)).toBe(false);
        expect(frameAt(file, 0, 1, 4, 2)).toBe(5);
    });

    it('stays waiting for a sheet that failed', () => {
        const atlas = loadedSheet();
        atlas.status = 'error';

        expect(waitsForSheet(fileOf({}, atlas))).toBe(true);
    });
});

// ---------------------------------------------------------------- to the card

describe('what the card reads', () => {
    const born = (file: TParticlesFile | null, fields: Record<string, unknown> = {}) => {
        const doc = parseParticlesDoc({
            kind: 'particles-2d', max: 4, life: 1, speed: 0, emission: { rate: 0, burst: 1, loop: false }, ...fields,
        }, '/fx/burst.particles') as TParticlesDoc2d;
        const state = createParticleState(doc, 1, file);
        return { doc, state, run: (seconds: number) => simulateParticles(state, doc, seconds, somewhere(), true, noTint, 0) };
    };
    const windowOf = (instances: Float32Array, n: number): number[] =>
        Array.from(instances.subarray(n * PARTICLE_FLOATS + PARTICLE_OFFSET.window, n * PARTICLE_FLOATS + PARTICLE_OFFSET.window + 4));

    it('is sixteen numbers a particle, the window of its picture in the last four', () => {
        expect([PARTICLE_FLOATS, PARTICLE_OFFSET.window]).toEqual([16, 12]);
        const file = fileOf({ max: 4, life: 1, speed: 0, emission: { rate: 0, burst: 1, loop: false } }, sheet(), { frames: [0, 1, 2, 3] });
        const { state, run } = born(file);
        run(0.01);
        expect(windowOf(state.instances, 0)).toEqual([0, 0, 0.25, 1]);
        for (let i = 0; i < 30; i++) run(1 / 60);
        expect(windowOf(state.instances, 0)).toEqual([0.5, 0, 0.25, 1]);
    });

    it('is the whole picture for particles without a sheet', () => {
        const { state, run } = born(null);
        run(0.01);

        expect(windowOf(state.instances, 0)).toEqual([0, 0, 1, 1]);
    });

    it('gives every copy of a tail the frame its particle shows now', () => {
        const fields = { trail: { length: 3, width: 1, fade: false }, speed: 60 };
        const file = fileOf({ max: 4, life: 1, emission: { rate: 0, burst: 1, loop: false }, ...fields }, sheet(), { frames: [0, 1, 2, 3] });
        const { state, run } = born(file, fields);
        for (let i = 0; i < 40; i++) run(1 / 60);

        expect(state.instanceCount).toBeGreaterThan(1);
        const windows = Array.from({ length: state.instanceCount }, (_, n) => windowOf(state.instances, n));
        expect(new Set(windows.map((w) => w.join()))).toEqual(new Set(['0.5,0,0.25,1']));
    });

    it('is read inside the window, half a texel in, by all four shaders', () => {
        for (const shader of [PARTICLES_SHADER, PARTICLES_3D_SHADER]) {
            expect(shader).toContain('window: vec4f');
            expect(shader).toContain('insideWindow(in.uv, in.window)');
            expect(shader).toContain('0.5 / vec2f(textureDimensions(particleTexture, 0))');
        }
        for (const shader of [PARTICLES_VERTEX_SHADER, PARTICLES_3D_VERTEX_SHADER]) {
            expect(shader).toContain('in vec4 uvWindow;');
            expect(shader).toContain('flat out vec4 vWindow;');
        }
        expect(PARTICLES_FRAGMENT_SHADER).toContain('insideWindow(vUv, vWindow)');
    });
});

// ---------------------------------------------------------------- in a game

const running = (body: () => void) => {
    const { store } = createTestGame();
    const root = startTestScene(store, 'Level', () => {
        body();
        return createScene();
    });
    const ctx = createFrameContext();
    const frame = () => {
        fillFrameContext(store, ctx, 1 / 60);
        const pass = ctx.passes[ctx.passes.length - 1]!;
        return (pass.drawables ?? []).find((item) => item.type === 'particles') as unknown as { count: number; texture: unknown };
    };
    return { store, root, frame };
};

const BURST: TParticlesEffect2d = { kind: 'particles-2d', max: 8, life: 5, emission: { rate: 0, burst: 4, loop: false } };

describe('an effect on a sheet, in a game', () => {
    it('draws with its sheet\'s picture, and a run written in code', () => {
        const atlas = sheet();
        let emitter!: TParticles;
        const { frame } = running(() => {
            emitter = createParticles({ effect: { ...BURST, texture: picture('other'), atlas, anim: { frames: [3, 2] } } });
        });

        const drawn = frame();
        expect([drawn.count, drawn.texture === atlas.texture]).toEqual([4, true]);
        expect(emitter.file.clip).toEqual({ frames: [3, 2] });
    });

    it('simulates while its sheet is on its way and draws once it lands', () => {
        const atlas = loadedSheet();
        atlas.status = 'loading';
        atlas.frames = 0;
        let emitter!: TParticles;
        const { frame } = running(() => {
            emitter = createParticles({ effect: { ...BURST, atlas } });
        });

        expect(frame().count).toBe(0);
        expect(particleCount(emitter)).toBe(4);
        atlas.status = 'ready';
        atlas.frames = 8;
        expect(frame().count).toBe(4);
    });

    it('reads a sheet named by path next to the file, from the cache the game loads sheets into', async () => {
        const warn = quiet();
        const { store } = createTestGame();
        const shared = loadedSheet('/fx/sheet.atlas');
        store.get('assets').atlases.set(shared.key, shared);
        const original = globalThis.fetch;
        globalThis.fetch = (async () => new Response(JSON.stringify({ format: 1, kind: 'particles-2d', atlas: 'sheet.atlas', texture: 'p.png', anim: 'burn' }))) as unknown as typeof fetch;
        try {
            const file = newParticlesFile('/fx/burst.particles', '/fx/burst.particles');
            await loadParticles(store, file);

            expect(file.atlas).toBe(shared);
            // The sheet wins, so the picture is not fetched for nothing.
            expect(file.texture).toBeNull();
            expect(store.get('assets').textures.size).toBe(0);
            expect(warn.mock.calls.filter((call) => String(call[0]).includes('does not draw'))).toHaveLength(0);
        } finally {
            globalThis.fetch = original;
        }
    });
});

// ---------------------------------------------------------------- letting go

describe('letting go of an effect on a sheet', () => {
    /** An effect from a file on `/fx/sheet.atlas`, as the loader leaves it. */
    const effectOn = (store: TRuntimeStore, src: string): TParticlesFile => {
        const file = newParticlesFile(src, src);
        file.atlas = particlesAtlas(store, src, 'sheet.atlas', file);
        file.status = 'ready';
        store.get('assets').particles.set(src, file);
        return file;
    };
    const sheetOf = (file: TParticlesFile) => file.atlas as TLoadedAtlas;

    it('lets its sheet go with it when nothing else uses it, picture and all', () => {
        const { store } = createTestGame();
        quiet();
        const file = effectOn(store, '/fx/burst.particles');
        const atlas = sheetOf(file);

        createGameHandle(store).releaseAsset(file);

        expect([file.status, atlas.status, atlas.texture.status]).toEqual(['released', 'released', 'released']);
        expect(store.get('assets').atlases.size).toBe(0);
    });

    it('keeps a sheet the game asked for itself, for its sprites', () => {
        const { store } = createTestGame();
        quiet();
        let asked!: TLoadedAtlas;
        startTestScene(store, 'Level', () => {
            asked = useLoadAtlas({ src: '/fx/sheet.atlas' });
            return createScene();
        });
        const file = effectOn(store, '/fx/burst.particles');
        expect(file.atlas).toBe(asked);

        createGameHandle(store).releaseAsset(file);

        expect(asked.status).not.toBe('released');
        expect(store.get('assets').atlases.get(asked.key)).toBe(asked);
    });

    it('keeps a sheet another effect or a map still uses, and the last effect to go takes it', () => {
        const { store } = createTestGame();
        quiet();
        const first = effectOn(store, '/fx/a.particles');
        const second = effectOn(store, '/fx/b.particles');
        const atlas = sheetOf(first);
        expect(sheetOf(second)).toBe(atlas);
        const map = { type: 'tilemap-asset', key: '/map.tilemap', src: '/map.tilemap', status: 'loading', atlas: null } as never;
        store.get('assets').tilemaps.set('/map.tilemap', map);
        // As the map's loader notes it, before it waits for the sheet to land.
        noteSheetUser(atlas, map);

        createGameHandle(store).releaseAsset(first);
        expect(atlas.status).not.toBe('released');
        createGameHandle(store).releaseAsset(second);
        // Still wanted by the map, which is only given its sheet once the sheet has landed.
        expect(atlas.status).not.toBe('released');
    });

    it('keeps a sheet an effect written in code uses while it is drawn', () => {
        quiet();
        const effect: TParticlesEffect2d = { ...BURST, atlas: '/fx/sheet.atlas' };
        const { store } = running(() => {
            createParticles({ effect });
        });
        const file = effectOn(store, '/fx/a.particles');
        expect(fileFromEffect(store, effect).atlas).toBe(file.atlas);

        createGameHandle(store).releaseAsset(file);

        expect(sheetOf(file).status).not.toBe('released');
    });

    it('stops holding a sheet once the last emitter of an effect written in code has gone', () => {
        quiet();
        const effect: TParticlesEffect2d = { ...BURST, atlas: '/fx/sheet.atlas' };
        const emitters: TParticles[] = [];
        const { store } = running(() => {
            emitters.push(createParticles({ effect }), createParticles({ effect }));
        });
        const inCode = fileFromEffect(store, effect);
        const file = effectOn(store, '/fx/a.particles');
        const atlas = sheetOf(file);

        destroy(emitters[0]!, { immediate: true });
        expect(sheetUsersOf(atlas)).toContain(inCode);
        destroy(emitters[1]!, { immediate: true });
        // Nothing draws it, so it no longer holds the sheet, nor is it held for it.
        expect(sheetUsersOf(atlas)).not.toContain(inCode);
        expect(atlas.status).not.toBe('released');

        createGameHandle(store).releaseAsset(file);

        expect(atlas.status).toBe('released');
        expect(sheetUsersOf(atlas)).toHaveLength(0);
    });

    it('takes an effect written in code on again when it is used again, asking afresh for a sheet let go of meanwhile', () => {
        quiet();
        const effect: TParticlesEffect2d = { ...BURST, atlas: '/fx/sheet.atlas' };
        let first!: TParticles;
        const { store } = running(() => {
            first = createParticles({ effect });
        });
        const inCode = fileFromEffect(store, effect);
        const old = sheetOf(inCode);
        destroy(first, { immediate: true });
        createGameHandle(store).releaseAsset(old);
        expect(old.status).toBe('released');

        let again!: TParticles;
        startTestScene(store, 'Again', () => {
            again = createParticles({ effect });
            return createScene();
        });

        expect(again.file).toBe(inCode);
        const fresh = sheetOf(inCode);
        expect(fresh).not.toBe(old);
        expect(fresh.status).not.toBe('released');
        expect(store.get('assets').atlases.get(fresh.key)).toBe(fresh);
        expect(sheetUsersOf(fresh)).toContain(inCode);
    });

    it('lets a sheet a file and its child share go once, with both', () => {
        const { store } = createTestGame();
        quiet();
        const parent = effectOn(store, '/fx/a.particles');
        const child = effectOn(store, '/fx/b.particles');
        parent.children = [child];

        createGameHandle(store).releaseAsset(parent);

        expect([parent.status, child.status, sheetOf(parent).status]).toEqual(['released', 'released', 'released']);
    });

    it('fetches nothing for a file let go of while it was on its way', async () => {
        const { store } = createTestGame();
        const file = newParticlesFile('/fx/late.particles', '/fx/late.particles');
        store.get('assets').particles.set(file.key, file);
        const original = globalThis.fetch;
        let release!: () => void;
        const arrived = new Promise<void>((resolve) => { release = resolve; });
        globalThis.fetch = (async () => {
            await arrived;
            return new Response(JSON.stringify({ format: 1, kind: 'particles-2d', atlas: 'sheet.atlas' }));
        }) as unknown as typeof fetch;
        try {
            const loading = loadParticles(store, file);
            createGameHandle(store).releaseAsset(file);
            release();
            await loading;
        } finally {
            globalThis.fetch = original;
        }

        expect([file.status, file.atlas, store.get('assets').atlases.size]).toEqual(['released', null, 0]);
    });

    it('leaves alone a sheet cut in code, which is not the cache\'s', () => {
        const { store } = createTestGame();
        const cut = sheet();
        const file = newParticlesFile('/fx/a.particles', '/fx/a.particles');
        file.atlas = cut;
        file.status = 'ready';
        store.get('assets').particles.set(file.key, file);

        createGameHandle(store).releaseAsset(file);

        expect(cut.texture.status).toBe('ready');
    });

    it('keeps a picture the game loaded itself, which a sprite still shows', () => {
        const { store } = createTestGame();
        quiet();
        let own!: TTexture;
        startTestScene(store, 'Level', () => {
            own = useLoadTexture({ src: '/fx/spark.png' });
            return createScene();
        });
        const file = newParticlesFile('/fx/burst.particles', '/fx/burst.particles');
        file.texture = particlesTexture(store, file.src, 'spark.png');
        file.status = 'ready';
        store.get('assets').particles.set(file.key, file);
        expect(file.texture).toBe(own);

        createGameHandle(store).releaseAsset(file);

        expect(own.status).not.toBe('released');
    });
});

describe('an emitter that goes', () => {
    it('is taken off its file, so the cache does not hold it for ever', () => {
        const effect = { ...BURST };
        let emitter!: TParticles;
        const { store } = running(() => {
            emitter = createParticles({ effect });
        });
        const file = fileFromEffect(store, effect);
        expect(file.bound).toContain(emitter);

        destroy(emitter, { immediate: true });

        expect(file.bound).not.toContain(emitter);
    });

    it('stays on its file when a new document makes its particles again', () => {
        const effect = { ...BURST };
        let emitter!: TParticles;
        const { store } = running(() => {
            emitter = createParticles({ effect });
        });
        const file = fileFromEffect(store, effect);

        applyParticlesDoc(emitter, parseParticlesDoc({ ...BURST, max: 9 }, file.src));

        expect(file.bound).toContain(emitter);
    });

    it('destroyed while its file is on its way, has no particles made for it when the file lands', async () => {
        const { store } = createTestGame();
        const file = newParticlesFile('/fx/late.particles', '/fx/late.particles');
        store.get('assets').particles.set(file.key, file);
        let emitter!: TParticles;
        startTestScene(store, 'Level', () => {
            emitter = createParticles({ effect: file });
            return createScene();
        });
        destroy(emitter, { immediate: true });
        const original = globalThis.fetch;
        globalThis.fetch = (async () => new Response(JSON.stringify({ format: 1, kind: 'particles-2d' }))) as unknown as typeof fetch;
        try {
            await loadParticles(store, file);
        } finally {
            globalThis.fetch = original;
        }

        expect(file.bound).toHaveLength(0);
        expect(particleStateOf(emitter)).toBeNull();
    });
});
