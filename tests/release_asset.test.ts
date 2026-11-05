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
import { newFont } from '../src/loaders/font/new_font';
import { loadLut, newLut } from '../src/loaders/lut';
import { loadPalette, newPalette } from '../src/loaders/palette';
import { loadShader, newShader } from '../src/loaders/shader';
import { DOCUMENTS } from '../src/CONST';
import { newParticlesFile } from '../src/loaders/particles/new_particles_file';
import { createParticles } from '../src/gameobjects/particles';
import { destroy } from '../src/destroy/destroy';
import { flushDestroyed } from '../src/destroy/flush_destroyed';
import { applyParticlesDoc } from '../src/gameobjects/particles/tools/apply_particles_doc';
import { childFileFor, loadParticles, particlesAtlas } from '../src/loaders/particles/load_particles';
import { newAtlas } from '../src/loaders/atlas/new_atlas';
import { uploadGeometry } from '../src/geometry/upload_geometry';
import { installPostChain } from '../src/post/install_post_chain';
import { newGltfModel } from '../src/loaders/gltf/new_gltf_model';
import { GAME, dropIdle, hold, holdersOf } from '../src/loaders/asset_holds';
import type { TParticlesFile } from '../src/loaders/particles/types/t_particles_file';
import { createGameHandle } from '../src/game/handle';
import { editorHandleOf, openHost } from '../src/game/handle/editor_handle_of';
import type { TGameInstance } from '../src/game/types/t_game_instance';
import { createTestGame, startTestScene } from './helpers/test_game';
import { effectDoc } from './helpers/particles';
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
        dropIdle(written);
        expect(shared.status).toBe('released');
    });

    it('does not count one written in code that nothing draws, and counts it again once something does', () => {
        const { store, a, b, shared } = twoSettingOffOne();
        const written = writtenSettingOff(store);
        dropIdle(written);
        const game = createGameHandle(store);

        game.releaseAsset(a);
        expect(shared.status).toBe('ready');

        // Drawn again, as `bindParticles` has it: it wants what it sets off once more.
        written.bound = [{}] as never[];
        hold(shared, written);
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

    /**
     * An effect written in code drawn by one emitter, setting off `shared` alone.
     */
    const drawnSettingOff = (store: ReturnType<typeof createTestGame>['store']) => {
        let emitter!: ReturnType<typeof createParticles>;
        startTestScene(store, 'S', () => {
            emitter = createParticles({ effect: { kind: 'particles-2d', children: [{ on: 'death', src: '/fx/shared.particles' }] } as never });
            return createScene();
        });
        return emitter;
    };

    it('lets go of an effect an edit no longer sets off, when nothing else wants it', () => {
        const { store } = createTestGame();
        const [rocket, sparks] = ['rocket', 'sparks'].map((name) => {
            const file = newParticlesFile(`/fx/${name}.particles`, `/fx/${name}.particles`);
            file.doc = effectDoc(name === 'rocket' ? { children: [{ on: 'death', src: 'sparks.particles' }] } : {});
            file.status = 'ready';
            store.get('assets').particles.set(file.key, file);
            return file;
        }) as [TParticlesFile, TParticlesFile];
        rocket.children = [childFileFor(store, rocket, 'sparks.particles')];
        let emitter!: ReturnType<typeof createParticles>;
        startTestScene(store, 'S', () => {
            emitter = createParticles({ effect: rocket });
            return createScene();
        });

        applyParticlesDoc(emitter, { ...rocket.doc!, children: [] });
        expect(sparks.status).toBe('released');
        expect(rocket.status).toBe('ready');
    });

    it('keeps an effect an edit no longer sets off, while another still sets it off, and that one takes it', () => {
        const { store, a, b, shared } = twoSettingOffOne();
        const emitter = drawnSettingOff(store);
        const game = createGameHandle(store);
        game.releaseAsset(a);

        applyParticlesDoc(emitter, { ...emitter.file.doc!, children: [] });
        expect(shared.status).toBe('ready');
        game.releaseAsset(b);
        expect(shared.status).toBe('released');
    });

    it('keeps an effect an edit no longer sets off, when the game asked for it itself', () => {
        const { store, a, b, shared } = twoSettingOffOne();
        hold(shared, GAME);
        const emitter = drawnSettingOff(store);
        const game = createGameHandle(store);
        game.releaseAsset(a);
        game.releaseAsset(b);

        applyParticlesDoc(emitter, { ...emitter.file.doc!, children: [] });
        expect(shared.status).toBe('ready');
    });

    it('leaves a picture made in the game that an effect it lets go of wore', () => {
        const { store } = createTestGame();
        let made!: TTexture;
        startTestScene(store, 'S', () => {
            made = createPixelTexture(createPixels(4, 4));
            return createScene();
        });
        const file = newParticlesFile('/fx/glow.particles', '/fx/glow.particles');
        file.texture = made;
        // As the loader does: a file holds the picture it names.
        hold(made, file);
        file.status = 'ready';
        store.get('assets').particles.set(file.key, file);

        createGameHandle(store).releaseAsset(file);
        expect(file.status as string).toBe('released');
        expect(made.status).not.toBe('released');
        expect(made.gpu).not.toBeNull();
    });

    it('takes the picture a font draws its letters into, with the font', () => {
        const { store, renderer } = createTestGame();
        const font = newFont('/fonts/a.ttf', '/fonts/a.ttf', 48);
        font.status = 'ready';
        font.texture.gpu = renderer.createTexture({ width: 16, height: 16, close: () => {} } as ImageBitmap);
        font.texture.status = 'ready';
        store.get('assets').fonts.set(font.key, font);
        const gpu = font.texture.gpu;

        createGameHandle(store).releaseAsset(font);
        expect(renderer.destroyedTextures).toContain(gpu!);
        expect(font.texture.status as string).toBe('released');
    });

    it('can let an effect go again after a release that threw halfway', () => {
        const { store, a, shared } = twoSettingOffOne();
        const picture = loaded(store, 'spark');
        shared.texture = picture;
        // As the loader does: a file holds the picture it names.
        hold(picture, shared);
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
        hold(shared, GAME);
        const game = createGameHandle(store);

        game.releaseAsset(a);
        game.releaseAsset(b);
        expect(shared.status).toBe('ready');
        expect(game.releaseAsset(shared)).toBe(true);
        expect(shared.status).toBe('released');
    });

    it('leaves an effect let go of while others set it off, and the last of them takes it', () => {
        const { store, a, b, shared } = twoSettingOffOne();
        const game = createGameHandle(store);

        expect(game.releaseAsset(shared)).toBe(true);
        expect(shared.status).toBe('ready');
        expect(a.children[0]).toBe(shared);

        game.releaseAsset(a);
        expect(shared.status).toBe('ready');
        game.releaseAsset(b);
        expect(shared.status).toBe('released');
    });

    it('waits the same when the effect is let go of by its key', () => {
        const { store, a, b, shared } = twoSettingOffOne();
        const game = createGameHandle(store);

        game.releaseAsset('/fx/shared.particles');
        expect(shared.status).toBe('ready');
        game.releaseAsset(a);
        game.releaseAsset(b);
        expect(shared.status).toBe('released');
    });

    it('takes an effect the game asked for and let go of with the last one setting it off', () => {
        const { store, a, b, shared } = twoSettingOffOne();
        hold(shared, GAME);
        const game = createGameHandle(store);

        game.releaseAsset(shared);
        game.releaseAsset(a);
        game.releaseAsset(b);
        expect(shared.status).toBe('released');
    });

    it('keeps an effect the game asks for again while it waited on the ones setting it off', () => {
        const { store, a, b, shared } = twoSettingOffOne();
        const game = createGameHandle(store);

        game.releaseAsset(shared);
        hold(shared, GAME);
        game.releaseAsset(a);
        game.releaseAsset(b);
        expect(shared.status).toBe('ready');
    });

    it('takes an effect let go of while one written in code sets it off, when that one stops being drawn', () => {
        const { store, a, b, shared } = twoSettingOffOne();
        const written = writtenSettingOff(store);
        written.bound = [{}] as never[];
        const game = createGameHandle(store);

        game.releaseAsset(a);
        game.releaseAsset(b);
        game.releaseAsset(shared);
        expect(shared.status).toBe('ready');

        written.bound = [];
        dropIdle(written);
        expect(shared.status).toBe('released');
    });

    it('takes an effect let go of while a real emitter sets it off, once that emitter is destroyed', () => {
        const { store, a, b, shared } = twoSettingOffOne();
        let emitter!: ReturnType<typeof createParticles>;
        startTestScene(store, 'S', () => {
            emitter = createParticles({ effect: { kind: 'particles-2d', children: [{ on: 'death', src: '/fx/shared.particles' }] } as never });
            return createScene();
        });
        const game = createGameHandle(store);
        game.releaseAsset(a);
        game.releaseAsset(b);
        game.releaseAsset(shared);
        expect(shared.status).toBe('ready');

        destroy(emitter);
        flushDestroyed(store);
        expect(shared.status).toBe('released');
    });

    it('takes an effect let go of while set off, once an edit stops setting it off', () => {
        const { store, a, b, shared } = twoSettingOffOne();
        let emitter!: ReturnType<typeof createParticles>;
        startTestScene(store, 'S', () => {
            emitter = createParticles({ effect: { kind: 'particles-2d', children: [{ on: 'death', src: '/fx/shared.particles' }] } as never });
            return createScene();
        });
        const game = createGameHandle(store);
        game.releaseAsset(a);
        game.releaseAsset(b);
        game.releaseAsset(shared);
        expect(shared.status).toBe('ready');

        applyParticlesDoc(emitter, { ...emitter.file.doc!, children: [] });
        expect(shared.status).toBe('released');
    });

    it('lets a chain go from its end, each link waiting on the one above', () => {
        const { store } = createTestGame();
        const [a, b, c] = ['a', 'b', 'c'].map((name) => {
            const file = newParticlesFile(`/fx/${name}.particles`, `/fx/${name}.particles`);
            file.status = 'ready';
            store.get('assets').particles.set(file.key, file);
            return file;
        }) as [TParticlesFile, TParticlesFile, TParticlesFile];
        a.children = [childFileFor(store, a, 'b.particles'), childFileFor(store, a, 'c.particles')];
        b.children = [childFileFor(store, b, 'c.particles')];
        const game = createGameHandle(store);

        game.releaseAsset(c);
        game.releaseAsset(b);
        expect([b.status, c.status]).toEqual(['ready', 'ready']);
        game.releaseAsset(a);
        expect([a.status, b.status, c.status]).toEqual(['released', 'released', 'released']);
        expect(store.get('assets').particles.size).toBe(0);
    });

    it('waits, a picture the game lets go of while an effect file wears it, for that file', () => {
        const { store } = createTestGame();
        const spark = loaded(store, 'spark');
        const file = newParticlesFile('/fx/sparks.particles', '/fx/sparks.particles');
        file.texture = spark;
        // As the loader does: a file holds the picture it names.
        hold(spark, file);
        file.status = 'ready';
        store.get('assets').particles.set(file.key, file);
        const game = createGameHandle(store);

        expect(game.releaseAsset(spark)).toBe(true);
        expect(spark.status).toBe('ready');
        expect(spark.gpu).not.toBeNull();

        game.releaseAsset(file);
        expect(spark.status).toBe('released');
    });

    it('waits, a picture the game lets go of while a model wears it, for that model', () => {
        const { store } = createTestGame();
        const skin = loaded(store, 'skin');
        const model = { type: 'gltf', key: '/robot.glb', src: '/robot.glb', status: 'ready', parts: [] } as never;
        store.get('assets').gltf.set('/robot.glb', model);
        hold(skin, model);
        const game = createGameHandle(store);

        game.releaseAsset(skin);
        expect(skin.status).toBe('ready');

        game.releaseAsset(model);
        expect(skin.status).toBe('released');
    });

    it('waits, an effect and its picture let go of under one key, for what sets the effect off', () => {
        const { store, a, b, shared } = twoSettingOffOne();
        const spark = loaded(store, 'spark');
        shared.texture = spark;
        // As the loader does: a file holds the picture it names.
        hold(spark, shared);
        store.get('assets').particles.set('spark', shared);
        const game = createGameHandle(store);

        game.releaseAsset('spark');
        expect([shared.status, spark.status]).toEqual(['ready', 'ready']);

        game.releaseAsset(a);
        game.releaseAsset(b);
        expect([shared.status, spark.status]).toEqual(['released', 'released']);
    });

    it('waits, a picture the game lets go of while an effect written in code is drawn with it, until it stops', () => {
        const { store } = createTestGame();
        const spark = loaded(store, 'spark');
        let emitter!: ReturnType<typeof createParticles>;
        startTestScene(store, 'S', () => {
            emitter = createParticles({ effect: { kind: 'particles-2d', texture: spark } as never });
            return createScene();
        });
        createGameHandle(store).releaseAsset(spark);
        expect(spark.status).toBe('ready');

        destroy(emitter);
        flushDestroyed(store);
        expect(spark.status).toBe('released');
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
            // As the loader does: a file holds the picture it names.
            hold(spark, file);
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

describe('evictAsset', () => {
    /**
     * The editor's handle on a game, which forgets what changed on disk.
     */
    const editorOn = async (store: TRuntimeStore) => {
        const instance: TGameInstance = { destroy: () => {}, on: () => () => {} };
        openHost(instance).resolve(store);
        return editorHandleOf(instance);
    };

    /**
     * Two effect files in the game's cache, the first two setting off the third.
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

    it('no longer counts what it forgot as setting off what it did', async () => {
        const { store, a, b, shared } = twoSettingOffOne();
        const editor = await editorOn(store);

        expect(editor.evictAsset('/fx/a.particles')).toBe(true);
        editor.releaseAsset(b);
        expect([a.status, shared.status]).toEqual(['ready', 'released']);
    });

    it('lets go now of what the game let go of while what it forgot held it', async () => {
        const { store, b, shared } = twoSettingOffOne();
        const editor = await editorOn(store);
        editor.releaseAsset(shared);
        editor.releaseAsset(b);
        expect(shared.status).toBe('ready');

        editor.evictAsset('/fx/a.particles');
        expect(shared.status).toBe('released');
    });

    it('lets go now of a picture the game let go of while an effect it forgot wore it', async () => {
        const { store, a } = twoSettingOffOne();
        const spark = loaded(store, 'spark');
        a.texture = spark;
        // As the loader does: a file holds the picture it names.
        hold(spark, a);
        const editor = await editorOn(store);
        editor.releaseAsset(spark);
        expect(spark.status).toBe('ready');

        editor.evictAsset('/fx/a.particles');
        expect(spark.status).toBe('released');
    });

    it('stops one still on its way, so it takes nothing once it lands', async () => {
        const asked: string[] = [];
        const fetching = spyOn(globalThis, 'fetch').mockImplementation((async (input: string) => {
            asked.push(String(input));
            return { ok: true, json: async () => ({ kind: 'particles-2d', children: [{ on: 'death', src: 'sparks.particles' }] }) };
        }) as never);
        try {
            const { store } = createTestGame();
            const editor = await editorOn(store);
            const rocket = newParticlesFile('/fx/rocket.particles', '/fx/rocket.particles');
            store.get('assets').particles.set(rocket.key, rocket);
            const loading = loadParticles(store, rocket);

            editor.evictAsset('/fx/rocket.particles');
            await loading;
            expect(rocket.status).toBe('released');
            expect(rocket.children).toEqual([]);
            expect(asked).toEqual(['/fx/rocket.particles']);
        } finally {
            fetching.mockRestore();
        }
    });

    it('takes out the effects setting off one still on its way too, so both are loaded afresh', async () => {
        let open!: () => void;
        const held = new Promise<void>((done) => { open = done; });
        const fetching = spyOn(globalThis, 'fetch').mockImplementation((async (input: string) => {
            const url = String(input);
            if (url === '/fx/sparks.particles') await held;
            const body = url === '/fx/rocket.particles' ? { kind: 'particles-2d', children: [{ on: 'death', src: 'sparks.particles' }] } : { kind: 'particles-2d' };
            return { ok: true, json: async () => body };
        }) as never);
        try {
            const { store } = createTestGame();
            const editor = await editorOn(store);
            const rocket = newParticlesFile('/fx/rocket.particles', '/fx/rocket.particles');
            store.get('assets').particles.set(rocket.key, rocket);
            await loadParticles(store, rocket);
            const sparks = rocket.children[0]!;
            expect(sparks.status).toBe('loading');

            editor.evictAsset('/fx/sparks.particles');
            open();
            await new Promise((done) => setTimeout(done, 10));
            // Neither is found any more: the rocket would have gone on setting off the old sparks.
            expect([...store.get('assets').particles.values()]).toEqual([]);
            expect(holdersOf(sparks)).toEqual([]);
        } finally {
            fetching.mockRestore();
        }
    });

    it('keeps one an effect written in code still sets off, and takes it off what it uses once that one stops', async () => {
        const { store } = createTestGame();
        const [s, g] = ['s', 'g'].map((name) => {
            const file = newParticlesFile(`/fx/${name}.particles`, `/fx/${name}.particles`);
            file.status = 'ready';
            store.get('assets').particles.set(file.key, file);
            return file;
        }) as [TParticlesFile, TParticlesFile];
        s.children = [childFileFor(store, s, 'g.particles')];
        let emitter!: ReturnType<typeof createParticles>;
        startTestScene(store, 'S', () => {
            emitter = createParticles({ effect: { kind: 'particles-2d', children: [{ on: 'death', src: '/fx/s.particles' }] } as never });
            return createScene();
        });
        const editor = await editorOn(store);

        editor.evictAsset('/fx/s.particles');
        editor.releaseAsset(g);
        // The effect in code still sets s off, and s sets off g.
        expect(g.status).toBe('ready');
        destroy(emitter, { immediate: true });
        expect(g.status).toBe('released');
    });

    /**
     * Effect files in the game's cache, already landed, each setting off the next.
     */
    const chainOf = (store: TRuntimeStore, names: string[]): TParticlesFile[] => {
        const files = names.map((name) => {
            const file = newParticlesFile(`/fx/${name}.particles`, `/fx/${name}.particles`);
            file.status = 'ready';
            store.get('assets').particles.set(file.key, file);
            return file;
        });
        files.forEach((file, i) => {
            const next = files[i + 1];
            if (next !== undefined) {
                file.doc = effectDoc({ children: [{ on: 'death', src: `${names[i + 1]}.particles` }] });
                file.children = [childFileFor(store, file, `${names[i + 1]}.particles`)];
            } else {
                file.doc = effectDoc({});
            }
        });
        return files;
    };

    it('takes out with it the effects that set it off, all the way up, so none goes on with the old one', async () => {
        const { store } = createTestGame();
        chainOf(store, ['rocket', 'sparks', 'embers']);
        const editor = await editorOn(store);

        editor.evictAsset('/fx/embers.particles');
        expect([...store.get('assets').particles.keys()]).toEqual([]);
    });

    it('takes out with a sheet the effects that take their frames from it', async () => {
        const fetching = spyOn(globalThis, 'fetch').mockImplementation((async () => new Promise(() => {})) as never);
        try {
            const { store } = createTestGame();
            const [rocket] = chainOf(store, ['rocket']);
            rocket!.atlas = particlesAtlas(store, rocket!.src, 'sheet.atlas', rocket!);
            const editor = await editorOn(store);

            editor.evictAsset('/fx/sheet.atlas');
            expect(store.get('assets').particles.size).toBe(0);
        } finally {
            fetching.mockRestore();
        }
    });

    it('takes out a sheet whose own picture changed, with what is on it', async () => {
        const { store } = createTestGame();
        const atlas = newAtlas('/tiles.atlas', '/tiles.atlas');
        atlas.texture.src = '/tiles.png';
        atlas.status = 'ready';
        store.get('assets').atlases.set(atlas.key, atlas);
        const editor = await editorOn(store);

        expect(editor.evictAsset('/tiles.png')).toBe(true);
        expect(store.get('assets').atlases.size).toBe(0);
    });

    it('takes out with a picture a model still on its way that already took it', async () => {
        const { store } = createTestGame();
        const wood = loaded(store, 'wood');
        const model = newGltfModel('/ship.glb', '/ship.glb');
        store.get('assets').gltf.set(model.key, model);
        // As its loader does, before its pieces are out.
        hold(wood, model);
        const editor = await editorOn(store);

        editor.evictAsset('wood');
        expect(store.get('assets').gltf.size).toBe(0);
    });

    it('lets go of what it took out once the scene is built again, shapes and pictures and all', async () => {
        const { store } = createTestGame();
        const wood = loaded(store, 'wood');
        const model = newGltfModel('/ship.glb', '/ship.glb');
        const shape = uploadGeometry(store, '/ship.glb#0', { vertices: new Float32Array(24), indices: new Uint16Array([0, 1, 2]) });
        store.get('assets').geometries.set(shape.key, shape);
        model.parts = [{ geometry: shape, texture: wood, emissiveTexture: null, occlusion: null } as never];
        model.status = 'ready';
        store.get('assets').gltf.set(model.key, model);
        hold(wood, model);
        const editor = await editorOn(store);
        editor.evictAsset('wood');

        expect(editor.releaseForgotten()).toBe(2);
        expect([model.status, shape.status, wood.status]).toEqual(['released', 'released', 'released']);
        expect(store.get('assets').geometries.size).toBe(0);
    });

    it('keeps what an emitter still draws when its file is taken out, until that emitter goes', async () => {
        const { store } = createTestGame();
        const [rocket, sparks] = chainOf(store, ['rocket', 'sparks']);
        let emitter!: ReturnType<typeof createParticles>;
        startTestScene(store, 'S', () => {
            emitter = createParticles({ effect: rocket! });
            return createScene();
        });
        const editor = await editorOn(store);
        editor.evictAsset('/fx/rocket.particles');

        editor.releaseAsset(sparks!);
        expect(sparks!.status).toBe('ready');
        expect(editor.releaseForgotten()).toBe(0);
        destroy(emitter, { immediate: true });
        expect(sparks!.status).toBe('released');
        expect(editor.releaseForgotten()).toBe(1);
    });

    it('lets go of a picture the game let go of, when an effect written in code asks again while still drawn', async () => {
        const fetching = spyOn(globalThis, 'fetch').mockImplementation((async () => ({ ok: false, status: 404 })) as never);
        const quiet = spyOn(console, 'warn').mockImplementation(() => {});
        try {
            const { store } = createTestGame();
            const spark = loaded(store, 'spark');
            const effect = { kind: 'particles-2d', texture: '/spark.png' } as never;
            let first!: ReturnType<typeof createParticles>;
            startTestScene(store, 'S', () => {
                first = createParticles({ effect });
                return createScene();
            });
            const editor = await editorOn(store);
            editor.releaseAsset(spark);
            editor.evictAsset('spark');
            let again!: ReturnType<typeof createParticles>;
            startTestScene(store, 'T', () => {
                again = createParticles({ effect });
                return createScene();
            });
            expect(again.file.texture).not.toBe(spark);

            destroy(first, { immediate: true });
            destroy(again, { immediate: true });
            expect(spark.status).toBe('released');
        } finally {
            fetching.mockRestore();
            quiet.mockRestore();
        }
    });

    it('has an effect written in code ask again for what was taken out, and let go of the old one', async () => {
        const fetching = spyOn(globalThis, 'fetch').mockImplementation((async () => ({ ok: true, json: async () => ({ kind: 'particles-2d' }) })) as never);
        try {
            const { store } = createTestGame();
            const [old] = chainOf(store, ['sparks']);
            const effect = { kind: 'particles-2d', children: [{ on: 'death', src: '/fx/sparks.particles' }] } as never;
            let first!: ReturnType<typeof createParticles>;
            startTestScene(store, 'S', () => {
                first = createParticles({ effect });
                return createScene();
            });
            expect(first.file.children[0]).toBe(old!);
            const editor = await editorOn(store);

            editor.evictAsset('/fx/sparks.particles');
            // Used again while the first emitter still draws it.
            let again!: ReturnType<typeof createParticles>;
            startTestScene(store, 'T', () => {
                again = createParticles({ effect });
                return createScene();
            });
            expect(again.file.children[0]).not.toBe(old!);
            expect(holdersOf(old!)).toEqual([]);
            destroy(first, { immediate: true });
        } finally {
            fetching.mockRestore();
        }
    });

    it('holds what a file taken out sets off only while an emitter still draws it', async () => {
        const { store } = createTestGame();
        const [rocket, sparks] = chainOf(store, ['rocket', 'sparks']);
        const editor = await editorOn(store);
        editor.evictAsset('/fx/rocket.particles');
        // An emitter given the old record by hand, as a script that kept it would.
        let emitter!: ReturnType<typeof createParticles>;
        startTestScene(store, 'S', () => {
            emitter = createParticles({ effect: rocket! });
            return createScene();
        });

        editor.releaseAsset(sparks!);
        expect(sparks!.status).toBe('ready');
        destroy(emitter, { immediate: true });
        expect(sparks!.status).toBe('released');
    });

    it('leaves a table of colours the project\'s screen effects still use, which outlive the scene', async () => {
        const fetching = spyOn(globalThis, 'fetch').mockImplementation((() => new Promise(() => {})) as never);
        try {
            const { store } = createTestGame();
            installPostChain(store, [{ builtin: 'lutGrade', lut: 'luts/warm.png' } as never]);
            const effect = store.get('post').effects[0]!;
            const lut = effect.lut!;
            lut.status = 'ready';
            lut.gpu = { resourceType: 'texture' } as never;
            const editor = await editorOn(store);

            expect(editor.evictAsset('luts/warm.png')).toBe(true);
            editor.releaseForgotten();
            expect(effect.lut).toBe(lut);
            expect(lut.gpu).not.toBeNull();
        } finally {
            fetching.mockRestore();
        }
    });

    it('leaves a picture a screen effect reads as its mask, which outlives the scene', async () => {
        const { store } = createTestGame();
        const shape = loaded(store, 'shape');
        store.get('post').effects.push({ mask: shape, palette: null, lut: null } as never);
        const editor = await editorOn(store);

        editor.evictAsset('shape');
        editor.releaseForgotten();
        expect(shape.status).toBe('ready');
        expect(shape.gpu).not.toBeNull();
    });

    it('leaves what an effect taken out sets off for the copy loaded afresh, rather than letting it go', async () => {
        const { store } = createTestGame();
        const [, sparks] = chainOf(store, ['rocket', 'sparks']);
        const editor = await editorOn(store);

        editor.evictAsset('/fx/rocket.particles');
        editor.releaseForgotten();
        expect(sparks!.status).toBe('ready');
        expect(store.get('assets').particles.get('/fx/sparks.particles')).toBe(sparks!);
    });

    it('keeps the picture of a file taken out while an emitter still draws it, until it goes', async () => {
        const { store } = createTestGame();
        const spark = loaded(store, 'spark');
        const [file] = chainOf(store, ['glow']);
        file!.texture = spark;
        // As the loader does: a file holds the picture it names.
        hold(spark, file!);
        let emitter!: ReturnType<typeof createParticles>;
        startTestScene(store, 'S', () => {
            emitter = createParticles({ effect: file! });
            return createScene();
        });
        const editor = await editorOn(store);
        editor.evictAsset('/fx/glow.particles');

        editor.releaseAsset(spark);
        expect(spark.status).toBe('ready');
        destroy(emitter, { immediate: true });
        expect(spark.status).toBe('released');
    });

    it('lets go of a picture it took out only after the emitters still drawn with it', async () => {
        const { store } = createTestGame();
        const spark = loaded(store, 'spark');
        const [file] = chainOf(store, ['glow']);
        file!.texture = spark;
        // As the loader does: a file holds the picture it names.
        hold(spark, file!);
        let emitter!: ReturnType<typeof createParticles>;
        startTestScene(store, 'S', () => {
            emitter = createParticles({ effect: file! });
            return createScene();
        });
        const editor = await editorOn(store);
        editor.evictAsset('spark');

        editor.releaseForgotten();
        expect(spark.status).toBe('ready');
        destroy(emitter, { immediate: true });
        expect(spark.status).toBe('released');
    });

    it('lets go of a sheet it took out only after the emitters still drawn on it', async () => {
        const fetching = spyOn(globalThis, 'fetch').mockImplementation((() => new Promise(() => {})) as never);
        try {
            const { store } = createTestGame();
            const [file] = chainOf(store, ['glow']);
            const sheet = particlesAtlas(store, file!.src, 'sheet.atlas', file!);
            file!.atlas = sheet;
            sheet.status = 'ready';
            let emitter!: ReturnType<typeof createParticles>;
            startTestScene(store, 'S', () => {
                emitter = createParticles({ effect: file! });
                return createScene();
            });
            const editor = await editorOn(store);
            editor.evictAsset('/fx/sheet.atlas');

            editor.releaseForgotten();
            expect(sheet.status).toBe('ready');
            destroy(emitter, { immediate: true });
            expect(sheet.status as string).toBe('released');
        } finally {
            fetching.mockRestore();
        }
    });

    it('keeps the picture of one an effect written in code still sets off, until it stops', async () => {
        const { store } = createTestGame();
        const spark = loaded(store, 'spark');
        const [sparks] = chainOf(store, ['sparks']);
        sparks!.texture = spark;
        // As the loader does: a file holds the picture it names.
        hold(spark, sparks!);
        let emitter!: ReturnType<typeof createParticles>;
        startTestScene(store, 'S', () => {
            emitter = createParticles({ effect: { kind: 'particles-2d', children: [{ on: 'death', src: '/fx/sparks.particles' }] } as never });
            return createScene();
        });
        const editor = await editorOn(store);
        editor.evictAsset('spark');

        editor.releaseForgotten();
        expect(spark.status).toBe('ready');
        destroy(emitter, { immediate: true });
        expect(spark.status as string).toBe('released');
    });

    it('forgets it under every name it was kept under', async () => {
        const { store, a } = twoSettingOffOne();
        store.get('assets').particles.set('rocket', a);
        const editor = await editorOn(store);

        editor.evictAsset('/fx/a.particles');
        expect([...store.get('assets').particles.values()]).not.toContain(a);
    });
});
