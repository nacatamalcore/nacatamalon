import { afterEach, describe, expect, it, spyOn } from 'bun:test';
import { createScene } from '../src/scene/create_scene';
import { createSprite } from '../src/gameobjects/sprite/create_sprite';
import { createMesh } from '../src/gameobjects/mesh';
import { createPixelTexture } from '../src/gameobjects/pixel_texture';
import { createGeometry } from '../src/geometry';
import { createPixels } from '../src/pixels';
import { useLoadTexture } from '../src/hooks/loaders/use_load_texture';
import { useCubeGeometry } from '../src/hooks/geometry/use_cube_geometry';
import { newTexture, uploadTexture } from '../src/loaders';
import { newAudio } from '../src/loaders/audio/new_audio';
import { loadLut, newLut } from '../src/loaders/lut';
import { loadPalette, newPalette } from '../src/loaders/palette';
import { loadShader, newShader } from '../src/loaders/shader';
import { DOCUMENTS } from '../src/CONST';
import { newParticlesFile } from '../src/loaders/particles/new_particles_file';
import { createParticles } from '../src/gameobjects/particles';
import { destroy } from '../src/destroy/destroy';
import { applyParticlesDoc } from '../src/gameobjects/particles/tools/apply_particles_doc';
import { childFileFor } from '../src/loaders/particles/load_particles';
import { markAskedByGame } from '../src/loaders/asked_by_game';
import { dropIdleEffectUser, noteEffectUser } from '../src/loaders/particles/effect_users';
import type { TParticlesFile } from '../src/loaders/particles/types/t_particles_file';
import { createGameHandle } from '../src/game/handle';
import { createTestGame, startTestScene } from './helpers/test_game';
import type { TLoadStatus, TTexture } from '../src/loaders';
import type { TGeometry } from '../src/geometry';
import type { TRuntimeStore } from '../src/store';

/**
 * Something the game lets go of: nothing is let go on its own, and `releaseAsset` takes it off the
 * card and out of the game, ending its record `'released'` so nothing still holding it is drawn.
 */

(globalThis as { requestAnimationFrame?: (cb: FrameRequestCallback) => number }).requestAnimationFrame = () => 0;

/**
 * A texture as a finished load leaves it, without fetching or decoding anything.
 */
const loaded = (store: TRuntimeStore, key: string): TTexture => {
    const texture = newTexture(`/${key}.png`, key);
    texture.width = 16;
    texture.height = 16;
    texture.gpu = store.get('screen').renderer.createTexture({ width: 16, height: 16, close: () => {} } as ImageBitmap);
    texture.status = 'ready';
    store.get('assets').textures.set(key, texture);
    return texture;
};

describe('releaseAsset', () => {
    it('takes a loaded texture off the card and out of the game', () => {
        const { store, renderer } = createTestGame();
        const hero = loaded(store, 'hero');
        const gpu = hero.gpu;

        expect(createGameHandle(store).releaseAsset(hero)).toBe(true);

        expect(store.get('assets').textures.has('hero')).toBe(false);
        expect(renderer.destroyedTextures).toEqual([gpu!]);
        expect(hero.gpu).toBeNull();
        expect(hero.status).toBe('released');
    });

    it('answers false when there is nothing to let go of, so releasing twice is not a mistake', () => {
        const { store } = createTestGame();
        const hero = loaded(store, 'hero');
        const game = createGameHandle(store);

        expect(game.releaseAsset('hero')).toBe(true);
        expect(game.releaseAsset('hero')).toBe(false);
        expect(game.releaseAsset(hero)).toBe(false);
        expect(game.releaseAsset('nobody')).toBe(false);
    });

    it('given a key, lets go of everything kept under it, whatever it is', () => {
        const { store, renderer } = createTestGame();
        const picture = loaded(store, 'hero');
        const sound = newAudio('/hero.wav', 'hero');
        sound.status = 'ready';
        sound.buffer = {} as AudioBuffer;
        store.get('assets').sounds.set('hero', sound);
        const palette = newPalette('/hero.palette', 'hero');
        palette.status = 'ready';
        palette.gpu = renderer.createDataTexture(new Uint8Array(4), 1, 1);
        store.get('assets').palettes.set('hero', palette);
        const coin = loaded(store, 'coin');

        expect(createGameHandle(store).releaseAsset('hero')).toBe(true);

        expect([picture.status, sound.status, palette.status]).toEqual(['released', 'released', 'released']);
        expect(sound.buffer).toBeNull();
        expect(palette.gpu).toBeNull();
        expect(store.get('assets').sounds.has('hero')).toBe(false);
        expect(store.get('assets').palettes.has('hero')).toBe(false);
        expect(coin.status).toBe('ready');
    });

    it('given the asset, lets go of that one only', () => {
        const { store } = createTestGame();
        const picture = loaded(store, 'hero');
        const sound = newAudio('/hero.wav', 'hero');
        sound.status = 'ready';
        store.get('assets').sounds.set('hero', sound);

        createGameHandle(store).releaseAsset(sound);

        // Read wider than the `'ready'` written above, which is all the compiler would let it be.
        expect(sound.status as TLoadStatus).toBe('released');
        expect(picture.status).toBe('ready');
        expect(store.get('assets').textures.get('hero')).toBe(picture);
    });

    it('loads afresh when the same key is asked for again', async () => {
        const warn = spyOn(console, 'warn').mockImplementation(() => {});
        const { store } = createTestGame();
        const hero = loaded(store, 'hero');
        createGameHandle(store).releaseAsset('hero');

        let again!: TTexture;
        startTestScene(store, 'Level', () => {
            again = useLoadTexture({ src: '/hero.png', key: 'hero' });
            return createScene();
        });

        expect(again).not.toBe(hero);
        expect(again.status).toBe('loading');
        expect(store.get('assets').textures.get('hero')).toBe(again);

        // With no server the fetch fails. Released before it does, the failure is nobody's news.
        createGameHandle(store).releaseAsset(again);
        await new Promise((resolve) => setTimeout(resolve, 10));
        const said = warn.mock.calls.filter((call) => String(call[0]).includes('could not be loaded'));
        warn.mockRestore();
        expect(said).toHaveLength(0);
        expect(again.status).toBe('released');
    });

    describe('a load of an effect\'s file that arrives after it was released', () => {
        const answered = globalThis.fetch;
        afterEach(() => { globalThis.fetch = answered; });

        const answers = (response: () => Response) => {
            globalThis.fetch = (async () => response()) as unknown as typeof fetch;
        };

        it('stays released: a shader', async () => {
            const { store } = createTestGame();
            const shader = newShader('/fx.wgsl', 'fx');
            store.get('assets').shaders.set('fx', shader);
            answers(() => new Response('fn effect(color: vec4<f32>, uv: vec2<f32>) -> vec4<f32> { return color; }'));
            const loading = loadShader(store, shader);
            createGameHandle(store).releaseAsset(shader);
            await loading;

            expect(shader.status).toBe('released');
            expect(shader.fragment).toBeNull();
        });

        it('stays released: a palette, with nothing on the card', async () => {
            const { store, renderer } = createTestGame();
            const palette = newPalette('/colors.palette', 'colors');
            store.get('assets').palettes.set('colors', palette);
            answers(() => new Response(JSON.stringify({ format: DOCUMENTS.PALETTE.FORMAT, name: 'Colors', colors: ['#000000', '#ffffff'] })));
            const made = spyOn(renderer, 'createDataTexture');
            const loading = loadPalette(store, palette);
            createGameHandle(store).releaseAsset(palette);
            await loading;

            expect(palette.status).toBe('released');
            expect(palette.gpu).toBeNull();
            expect(made).not.toHaveBeenCalled();
        });

        it('stays released: a colour table, with nothing on the card', async () => {
            const { store, renderer } = createTestGame();
            const lut = newLut('/grade.cube', 'grade');
            store.get('assets').luts.set('grade', lut);
            answers(() => new Response('LUT_3D_SIZE 2\n0 0 0\n1 0 0\n0 1 0\n1 1 0\n0 0 1\n1 0 1\n0 1 1\n1 1 1\n'));
            const made = spyOn(renderer, 'createDataTexture');
            const loading = loadLut(store, lut);
            createGameHandle(store).releaseAsset(lut);
            await loading;

            expect(lut.status).toBe('released');
            expect(lut.gpu).toBeNull();
            expect(made).not.toHaveBeenCalled();
        });

        it('says nothing when it then could not be fetched', async () => {
            const { store } = createTestGame();
            const palette = newPalette('/gone.palette', 'gone');
            store.get('assets').palettes.set('gone', palette);
            answers(() => new Response('', { status: 404 }));
            const warn = spyOn(console, 'warn');
            const loading = loadPalette(store, palette);
            createGameHandle(store).releaseAsset(palette);
            await loading;
            const said = warn.mock.calls.length;
            warn.mockRestore();

            expect(palette.status).toBe('released');
            expect(said).toBe(0);
        });
    });

    it('throws away a load that arrives after it was released', async () => {
        const { store, renderer } = createTestGame();
        const hero = newTexture('/hero.png', 'hero');
        store.get('assets').textures.set('hero', hero);
        createGameHandle(store).releaseAsset(hero);

        let closed = false;
        const bitmap = { width: 16, height: 16, close: () => { closed = true; } };
        // Not in the test runtime: a stand-in that hands back the picture at once.
        const decode = globalThis as { createImageBitmap?: unknown };
        const before = decode.createImageBitmap;
        decode.createImageBitmap = async () => bitmap;
        const created = spyOn(renderer, 'createTexture');
        try {
            await uploadTexture(store, hero, new Blob());
        } finally {
            decode.createImageBitmap = before;
        }

        expect(closed).toBe(true);
        expect(created).not.toHaveBeenCalled();
        expect(hero.status).toBe('released');
        expect(hero.gpu).toBeNull();
    });

    it('says how many drawings still show it', () => {
        const warn = spyOn(console, 'warn').mockImplementation(() => {});
        const { store } = createTestGame();
        const hero = loaded(store, 'hero');
        startTestScene(store, 'Level', () => {
            createSprite({ texture: hero });
            createSprite({ texture: hero });
            return createScene();
        });

        createGameHandle(store).releaseAsset(hero);
        const said = warn.mock.calls.map((call) => String(call[0])).filter((line) => line.includes('releaseAsset'));
        warn.mockRestore();

        expect(said).toHaveLength(1);
        expect(said[0]).toContain("[NacatamalOn] releaseAsset: 'hero' is still shown by 2 drawing(s)");
    });

    it('gives a shared shape\'s buffers back to the card', () => {
        const warn = spyOn(console, 'warn').mockImplementation(() => {});
        const { store, renderer } = createTestGame();
        let cube!: TGeometry;
        startTestScene(store, 'Level', () => {
            cube = useCubeGeometry();
            createMesh({ geometry: cube });
            return createScene();
        });
        expect(renderer.buffers.some((buffer) => buffer.alive)).toBe(true);

        createGameHandle(store).releaseAsset(cube);
        const said = warn.mock.calls.filter((call) => String(call[0]).includes('still shown by 1 drawing(s)'));
        warn.mockRestore();

        expect(renderer.buffers.every((buffer) => !buffer.alive)).toBe(true);
        expect(cube.vertexBuffer).toBeNull();
        expect(cube.status).toBe('released');
        expect(said).toHaveLength(1);
    });

    it('refuses what belongs to something in the game, and then lets go of nothing', () => {
        const { store } = createTestGame();
        const sound = newAudio('/floor.wav', 'floor');
        sound.status = 'ready';
        store.get('assets').sounds.set('floor', sound);
        let shape!: TGeometry;
        startTestScene(store, 'Level', () => {
            createPixelTexture(createPixels(4, 4), { key: 'floor' });
            shape = createGeometry({ positions: [0, 0, 0, 1, 0, 0, 0, 1, 0] });
            return createScene();
        });
        const game = createGameHandle(store);

        expect(() => game.releaseAsset('floor')).toThrow("releaseAsset: the texture 'floor' was made in the game");
        expect(store.get('assets').textures.has('floor')).toBe(true);
        expect(sound.status).toBe('ready');
        expect(() => game.releaseAsset(shape)).toThrow('was made with createGeometry');
    });

    /**
     * Three effect files in the game's cache, already landed, the first two named as setting off the
     * third by the loader's own door.
     */
    const twoSettingOffOne = () => {
        const { store } = createTestGame();
        const [a, b, shared] = ['a', 'b', 'shared'].map((name) => {
            const file = newParticlesFile(`/fx/${name}.particles`, `/fx/${name}.particles`);
            file.status = 'ready';
            store.get('assets').particles.set(file.key, file);
            return file;
        }) as [TParticlesFile, TParticlesFile, TParticlesFile];
        a.children = [childFileFor(store, a, 'shared.particles')];
        b.children = [childFileFor(store, b, 'shared.particles')];
        return { store, a, b, shared };
    };

    it('leaves an effect another effect still sets off, and the last of them to go takes it', () => {
        const { store, a, b, shared } = twoSettingOffOne();
        const game = createGameHandle(store);

        game.releaseAsset(a);
        expect([a.status, shared.status]).toEqual(['released', 'ready']);
        expect(b.children[0]).toBe(shared);

        game.releaseAsset(b);
        expect([b.status, shared.status]).toEqual(['released', 'released']);
    });

    /**
     * An effect written in code that sets off the same file as `a` and `b`, as `fileFromEffect` has it.
     */
    const writtenSettingOff = (store: ReturnType<typeof createTestGame>['store']): TParticlesFile => {
        const written = newParticlesFile('inline', 'inline');
        written.children = [childFileFor(store, written, '/fx/shared.particles', true)];
        written.status = 'ready';
        return written;
    };

    it('leaves an effect one written in code sets off while it is drawn, and it goes when that one stops', () => {
        const { store, a, b, shared } = twoSettingOffOne();
        const written = writtenSettingOff(store);
        written.bound = [{}] as never[];
        const game = createGameHandle(store);

        game.releaseAsset(a);
        game.releaseAsset(b);
        expect(shared.status).toBe('ready');

        // Its last emitter goes, as `unbindParticles` has it: nothing else would finish letting go.
        written.bound = [];
        dropIdleEffectUser(shared, written);
        expect(shared.status).toBe('released');
    });

    it('does not count one written in code that nothing draws, and counts it again once something does', () => {
        const { store, a, b, shared } = twoSettingOffOne();
        const written = writtenSettingOff(store);
        dropIdleEffectUser(shared, written);
        const game = createGameHandle(store);

        game.releaseAsset(a);
        expect(shared.status).toBe('ready');

        // Drawn again, as `bindParticles` has it: it wants what it sets off once more.
        written.bound = [{}] as never[];
        noteEffectUser(shared, written);
        game.releaseAsset(b);
        expect(shared.status).toBe('ready');
    });

    it('leaves an effect the game drew by its key, even with that emitter gone, until it lets go of it', () => {
        const { store, a, b, shared } = twoSettingOffOne();
        let emitter!: ReturnType<typeof createParticles>;
        startTestScene(store, 'S', () => {
            emitter = createParticles({ effect: '/fx/shared.particles' });
            return createScene();
        });
        destroy(emitter);
        const game = createGameHandle(store);

        game.releaseAsset(a);
        game.releaseAsset(b);
        expect(shared.status).toBe('ready');
        expect(game.releaseAsset(shared)).toBe(true);
        expect(shared.status).toBe('released');
    });

    it('finishes letting a child go when the effect it waited on is edited not to set it off', () => {
        const { store, a, b, shared } = twoSettingOffOne();
        let emitter!: ReturnType<typeof createParticles>;
        startTestScene(store, 'S', () => {
            emitter = createParticles({ effect: { kind: 'particles-2d', children: [{ on: 'death', src: '/fx/shared.particles' }] } as never });
            return createScene();
        });
        const game = createGameHandle(store);
        game.releaseAsset(a);
        game.releaseAsset(b);
        expect(shared.status).toBe('ready');

        applyParticlesDoc(emitter, { ...emitter.file.doc!, children: [] });
        expect(shared.status).toBe('released');
    });

    it('can let an effect go again after a release that threw halfway', () => {
        const { store, a, shared } = twoSettingOffOne();
        const picture = loaded(store, 'spark');
        shared.texture = picture;
        const game = createGameHandle(store);
        game.releaseAsset(store.get('assets').particles.get('/fx/b.particles')!);
        const destroy = spyOn(store.get('screen').renderer, 'destroyTexture').mockImplementationOnce(() => { throw new Error('the card'); });

        expect(() => game.releaseAsset(a)).toThrow('the card');
        destroy.mockRestore();

        expect(game.releaseAsset(a)).toBe(true);
        expect(a.status).toBe('released');
    });

    it('leaves an effect the game asked for itself, when one that sets it off goes', () => {
        const { store, a, b, shared } = twoSettingOffOne();
        markAskedByGame(shared);
        const game = createGameHandle(store);

        game.releaseAsset(a);
        game.releaseAsset(b);
        expect(shared.status).toBe('ready');
        expect(game.releaseAsset(shared)).toBe(true);
        expect(shared.status).toBe('released');
    });

    it('ends, should effects ever lead back to one another', () => {
        const { store, a, b } = twoSettingOffOne();
        // By hand: the loader refuses a ring.
        a.children = [b];
        b.children = [a];

        createGameHandle(store).releaseAsset(a);
        expect([a.status, b.status]).toEqual(['released', 'released']);
    });

    it('takes a picture a particle file and its child both wear, when the file goes', () => {
        const { store } = createTestGame();
        const spark = loaded(store, 'spark');
        const parent = newParticlesFile('/fx/burst.particles', 'burst');
        const child = newParticlesFile('/fx/trail.particles', 'trail');
        for (const file of [parent, child]) {
            file.texture = spark;
            file.status = 'ready';
            store.get('assets').particles.set(file.key, file);
        }
        parent.children = [child];

        createGameHandle(store).releaseAsset(parent);

        expect([parent.status, child.status]).toEqual(['released', 'released']);
        expect(spark.status).toBe('released');
        expect(spark.gpu).toBeNull();
    });
});
