import { describe, expect, it, spyOn } from 'bun:test';
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
import { newPalette } from '../src/loaders/palette/new_palette';
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
});
