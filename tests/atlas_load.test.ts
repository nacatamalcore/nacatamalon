import { afterEach, describe, expect, it, spyOn } from 'bun:test';
import { useLoadAtlas } from '../src/hooks/loaders';
import { createScene } from '../src/scene/create_scene';
import { atlasFrame } from '../src/atlas/atlas_frame';
import { runHookUpdates } from '../src/game/loop/runHookUpdates';
import { parseSceneDoc, sceneFromDoc, serializeScene, SCENE_FORMAT } from '../src/scene/document';
import { whenLoaded } from '../src/loaders';
import { createTestGame, startTestScene } from './helpers/test_game';
import type { TLoadedAtlas } from '../src/loaders';
import type { TSprite } from '../src/gameobjects/sprite/types/t_sprite';
import type { TBox } from '../src/box';

/**
 * A sheet read from its file, and a sprite in a scene document playing one of its runs.
 *
 * The cut is the old engine's, number for number, because the files already exist: a sheet whose
 * size is not a whole number of cells, a packed sheet, a run naming its frames and a run that says
 * what comes after all have to mean what they meant there.
 */

let served: { restore: () => void } | null = null;
let warn: ReturnType<typeof spyOn> | null = null;
afterEach(() => {
    served?.restore();
    served = null;
    warn?.mockRestore();
    warn = null;
});

/**
 * Serves one `.atlas` and an image of the given size for it.
 */
const serve = (atlas: unknown, width: number, height: number): void => {
    Object.assign(globalThis, {
        createImageBitmap: async () => ({ width, height, close: () => {} }),
        location: { href: 'http://nacatamalon.local/' },
    });
    const spy = spyOn(globalThis, 'fetch').mockImplementation((async (input: string) => {
        const url = String(input);
        if (url.endsWith('.atlas')) return { ok: true, json: async () => atlas };
        if (url.endsWith('.png')) return { ok: true, blob: async () => new Blob(['png']) };
        return { ok: false, status: 404 };
    }) as unknown as typeof fetch);
    served = { restore: () => spy.mockRestore() };
};

const load = async (atlas: unknown, width: number, height: number): Promise<TLoadedAtlas> => {
    serve(atlas, width, height);
    const { store } = createTestGame();
    let sheet!: TLoadedAtlas;
    startTestScene(store, 'S', () => {
        sheet = useLoadAtlas({ src: '/sheets/hero.atlas' });
        return createScene();
    });
    await whenLoaded(sheet);
    return sheet;
};

describe('a sheet loaded from its file', () => {
    it('leaves out a strip at the edge that is not a whole cell, instead of stretching every frame', async () => {
        const sheet = await load({ format: 1, kind: 'atlas', texture: 'hero.png', grid: { frameWidth: 16, frameHeight: 16 } }, 40, 16);

        expect(sheet.frames).toBe(2);
        expect(sheet.columns).toBe(2);
        expect(atlasFrame(sheet, 1)).toEqual({ uvOffset: { x: 16 / 40, y: 0 }, uvScale: { x: 16 / 40, y: 1 } });
    });

    it('steps over its margins and gaps', async () => {
        const sheet = await load({ format: 1, kind: 'atlas', texture: 'hero.png', grid: { frameWidth: 8, frameHeight: 8, margin: 1, spacing: 2 } }, 30, 10);

        expect(sheet.frames).toBe(3);
        expect(atlasFrame(sheet, 2).uvOffset.x * 30).toBe(21);
    });

    it('draws a packed sheet, and turns the names a run uses into the frame numbers a sprite counts in', async () => {
        warn = spyOn(console, 'warn').mockImplementation(() => {});
        const sheet = await load({
            format: 1, kind: 'atlas', texture: 'hero.png',
            packed: { stand: { x: 0, y: 0, w: 10, h: 20 }, swing: { x: 10, y: 0, w: 10, h: 20 } },
            sequences: { punch: { frames: ['swing', 'stand', 'nowhere'], loop: false, next: 'idle' } },
        }, 20, 20);

        expect(sheet.frames).toBe(2);
        expect(atlasFrame(sheet, 1).uvOffset).toEqual({ x: 0.5, y: 0 });
        // A name the sheet does not have is left out, and said.
        expect(sheet.sequences.punch).toEqual({ frames: [1, 0], loop: false, next: 'idle' });
        expect(String(warn.mock.calls[0]?.[0])).toContain("'nowhere'");
        // And keeps the names, for a map whose tiles name their frames.
        expect(sheet.names).toEqual({ stand: 0, swing: 1 });
    });

    it('says a file that is not an atlas is broken, and slices nothing', async () => {
        warn = spyOn(console, 'warn').mockImplementation(() => {});
        const sheet = await load({ format: 1, kind: 'atlas', texture: 'hero.png' }, 16, 16);

        expect(sheet.status).toBe('error');
        expect(sheet.frames).toBe(0);
    });
});

const HERO = { format: 1, kind: 'atlas', texture: 'hero.png', grid: { frameWidth: 16, frameHeight: 16 }, sequences: { walk: { frames: [1, 2, 3], fps: 10 } } };

/**
 * A scene whose one sprite plays `walk` of the sheet at twice its pace.
 */
const heroScene = (animation: unknown) => parseSceneDoc({
    format: SCENE_FORMAT, version: 1, name: 'Room',
    assets: [{ type: 'atlas', key: 'hero', src: '/sheets/hero.atlas' }],
    root: {
        id: 'root', name: 'Room', transform: null, children: [],
        components: [{ type: 'sprite', id: 'hero-art', texture: null, atlas: 'hero', frame: 0, tint: { r: 1, g: 1, b: 1, a: 1 }, animation }],
    },
}, '/scenes/room.scene');

describe('a sprite in a scene document with an animation', () => {
    const open = async (animation: unknown) => {
        serve(HERO, 64, 16);
        const { store } = createTestGame();
        const root: TBox = startTestScene(store, 'Room', sceneFromDoc(heroScene(animation), '/scenes/room.scene'));
        await whenLoaded(store.get('assets').atlases.get('hero')!);
        const sprite = root.drawables[0] as TSprite;
        return { root, sprite };
    };

    it('plays the run it starts on, at the speed it says', async () => {
        const { root, sprite } = await open({ autoplay: 'walk', speed: 2 });

        // The first update notices the run has arrived and starts it on its first picture.
        runHookUpdates(root, 0);
        expect(sprite.frame).toBe(1);
        // Ten pictures a second, at twice the pace: a twentieth of a second is one picture.
        runHookUpdates(root, 0.05);
        expect(sprite.frame).toBe(2);
    });

    it('rests on its frame when it starts on no run', async () => {
        const { root, sprite } = await open({ autoplay: null, speed: 1 });

        runHookUpdates(root, 1);
        expect(sprite.frame).toBe(0);
        expect(sprite.animation).toEqual({ autoplay: null, speed: 1 });
    });

    it('is written back as the sheet, the frame on screen and the run, never as a plain picture', async () => {
        const { root } = await open({ autoplay: 'walk', speed: 2 });
        runHookUpdates(root, 0);
        runHookUpdates(root, 0.05);

        const doc = serializeScene(root);
        const [art] = doc.root.components;

        expect(doc.assets).toContainEqual({ type: 'atlas', key: 'hero', src: '/sheets/hero.atlas' });
        expect(doc.assets.some((asset) => asset.type === 'texture')).toBe(false);
        expect(art).toMatchObject({ type: 'sprite', id: 'hero-art', texture: null, atlas: 'hero', frame: 2, animation: { autoplay: 'walk', speed: 2 } });
        expect(art).not.toHaveProperty('uvOffset');
        expect(art).not.toHaveProperty('uvScale');
    });

    it('treats the old engine\'s `animation: null` as a still sprite', () => {
        expect(heroScene(null).root.components[0]).not.toHaveProperty('animation');
    });
});
