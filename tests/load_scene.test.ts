import { afterEach, beforeEach, describe, expect, it, spyOn } from 'bun:test';
import { createScene } from '../src/scene/create_scene';
import { startScene } from '../src/scene/start_scene';
import { registerScene } from '../src/scene/register_scene';
import { parseSceneDoc, sceneFromDoc } from '../src/scene/document';
import { useLoadScene } from '../src/hooks/loaders/use_load_scene';
import { useLoader } from '../src/hooks/loaders/use_loader';
import { rootOf } from '../src/box';
import { whenLoaded } from '../src/loaders/track_load';
import { releaseAsset } from '../src/loaders/release_asset';
import { createTestGame, startTestScene } from './helpers/test_game';
import type { TLoadedScene } from '../src/loaders/scene';
import type { TLoader } from '../src/loaders/types/t_loader';

const tint = { r: 1, g: 1, b: 1, a: 1 };
const NOWHERE = { x: 0, y: 0, z: 0, rotation: 0, rotationX: 0, rotationY: 0, scaleX: 1, scaleY: 1, scaleZ: 1 };

/** A scene file as the editor saves one: a rock, and the picture it wears. */
const CAVE = {
    format: 'nacatamalon-scene',
    version: 1,
    name: 'cave',
    assets: [{ type: 'texture', key: 'assets/rock.png', src: 'assets/rock.png' }],
    root: {
        id: 'root', name: 'cave', transform: null, components: [],
        children: [{ id: 'rock', name: 'Rock', transform: { ...NOWHERE, x: 40 }, components: [{ type: 'sprite', id: 'face', texture: 'assets/rock.png', width: 16, height: 16, tint }], children: [] }],
    },
};

let fetchSpy: ReturnType<typeof spyOn> | null = null;
let asked: string[] = [];
/** Lets the picture land when the test says so, to see what waits for it. */
let pictureArrives: () => void = () => {};

/** Serves `files` by path, and a 1x1 picture for any `.png` once `pictureArrives` is called. */
const serve = (files: Record<string, unknown>): void => {
    asked = [];
    Object.assign(globalThis, {
        createImageBitmap: async () => ({ width: 1, height: 1, close: () => {} }),
        location: { href: 'http://nacatamalon.local/' },
    });
    const picture = new Promise<void>((resolve) => { pictureArrives = resolve; });
    fetchSpy = spyOn(globalThis, 'fetch').mockImplementation((async (input: string) => {
        const url = String(input);
        asked.push(url);
        if (url.endsWith('.png')) {
            await picture;
            return { ok: true, blob: async () => new Blob(['png']) };
        }
        const path = url.replace(/^http:\/\/nacatamalon\.local\//, '');
        if (path in files) return { ok: true, json: async () => structuredClone(files[path]) };
        return { ok: false, status: 404 };
    }) as unknown as typeof fetch);
};

let warn: ReturnType<typeof spyOn>;
beforeEach(() => {
    warn = spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => {
    fetchSpy?.mockRestore();
    fetchSpy = null;
    warn.mockRestore();
});

const said = (): string => warn.mock.calls.map((call: unknown[]) => String(call[0])).join('\n');

/** A few turns of the event loop, for a fetch and what follows it to run. */
const settle = async (): Promise<void> => {
    for (let i = 0; i < 10; i++) await new Promise((resolve) => setTimeout(resolve, 0));
};

describe('useLoadScene', () => {
    it('refuses to be called outside a scene body', () => {
        expect(() => useLoadScene({ src: 'scenes/cave.scene' })).toThrow('[NacatamalOn] useLoadScene');
    });

    it('adds the scene under the name in its file, which change then starts', async () => {
        serve({ 'scenes/cave.scene': CAVE });
        const { store } = createTestGame();
        let cave!: TLoadedScene;
        const root = startTestScene(store, 'Loading', () => {
            cave = useLoadScene({ src: 'scenes/cave.scene' });
            return createScene();
        });

        expect(cave.status).toBe('loading');
        expect(cave.name).toBe('');
        expect(rootOf(root).loads).toContain(cave);

        pictureArrives();
        await whenLoaded(cave);

        expect(cave.status).toBe('ready');
        expect(cave.name).toBe('cave');
        const started = startScene(store, 'cave');
        expect(started.children.map((box) => box.name)).toEqual(['Rock']);
        expect(started.children[0]!.transform!.x).toBe(40);
    });

    it('asks for what the scene uses as soon as it lands, and is ready only once that has arrived', async () => {
        serve({ 'scenes/cave.scene': CAVE });
        const { store } = createTestGame();
        let cave!: TLoadedScene;
        let loader!: TLoader;
        startTestScene(store, 'Loading', () => {
            cave = useLoadScene({ src: 'scenes/cave.scene' });
            loader = useLoader();
            return createScene();
        });

        await settle();
        // Its file is in and it can be started, and its picture is on the way: not ready yet.
        expect(asked.some((url) => url.endsWith('assets/rock.png'))).toBe(true);
        expect(store.get('world').names.has('cave')).toBe(true);
        expect(cave.status).toBe('loading');
        expect(loader.done).toBe(false);

        pictureArrives();
        await whenLoaded(cave);
        expect(cave.status).toBe('ready');
        expect(store.get('assets').textures.get('assets/rock.png')?.status).toBe('ready');
        expect(loader.done).toBe(true);
    });

    it('reads a file once however many scenes ask for it', async () => {
        serve({ 'scenes/cave.scene': CAVE });
        const { store } = createTestGame();
        const scenes: TLoadedScene[] = [];
        startTestScene(store, 'A', () => {
            scenes.push(useLoadScene({ src: 'scenes/cave.scene' }));
            return createScene();
        });
        startTestScene(store, 'B', () => {
            scenes.push(useLoadScene({ src: './scenes/cave.scene' }));
            return createScene();
        });
        pictureArrives();
        await whenLoaded(scenes[0]!);

        expect(scenes[0]).toBe(scenes[1]!);
        expect(asked.filter((url) => url.endsWith('cave.scene'))).toHaveLength(1);
    });

    it('finds the scene the game added from the same file at its start, and only asks for what it uses', async () => {
        serve({ 'scenes/cave.scene': CAVE });
        const { store } = createTestGame();
        // As an editor's main.ts adds each document before the game starts.
        const added = sceneFromDoc(parseSceneDoc(structuredClone(CAVE), 'scenes/cave.scene'), 'scenes/cave.scene');
        registerScene(store, 'cave', added);
        let cave!: TLoadedScene;
        startTestScene(store, 'Loading', () => {
            cave = useLoadScene({ src: 'scenes/cave.scene' });
            return createScene();
        });
        pictureArrives();
        await whenLoaded(cave);

        expect(cave.status).toBe('ready');
        expect(store.get('world').names.get('cave')).toBe(added);
        expect(store.get('assets').textures.get('assets/rock.png')?.status).toBe('ready');
        expect(said()).not.toContain('already has a scene called that');
    });

    it('leaves out a file whose name the game already has, and says so', async () => {
        serve({ 'scenes/cave.scene': CAVE });
        const { store } = createTestGame();
        const ours = () => createScene();
        startTestScene(store, 'cave', ours);
        let cave!: TLoadedScene;
        startTestScene(store, 'Loading', () => {
            cave = useLoadScene({ src: 'scenes/cave.scene' });
            return createScene();
        });
        await whenLoaded(cave);

        expect(cave.status).toBe('error');
        expect(store.get('world').names.get('cave')).toBe(ours);
        expect(said()).toContain('already has a scene called that');
    });

    it('ends as an error, with a warning, when the file is not there', async () => {
        serve({});
        const { store } = createTestGame();
        let cave!: TLoadedScene;
        startTestScene(store, 'Loading', () => {
            cave = useLoadScene({ src: 'scenes/nowhere.scene' });
            return createScene();
        });
        await whenLoaded(cave);

        expect(cave.status).toBe('error');
        expect(said()).toContain("[NacatamalOn] useLoadScene: 'scenes/nowhere.scene' could not be loaded");
    });

    it('says a scene asked for too early is still loading, not that it does not exist', () => {
        serve({ 'scenes/cave.scene': CAVE });
        const { store } = createTestGame();
        startTestScene(store, 'Loading', () => {
            useLoadScene({ src: 'scenes/cave.scene' });
            return createScene();
        });

        expect(() => startScene(store, 'cave')).toThrow("'cave' is not registered yet, and scenes/cave.scene is still loading");
    });

    it('does not blame a file already added when the name asked for is simply wrong', async () => {
        serve({ 'scenes/cave.scene': CAVE });
        const { store } = createTestGame();
        let cave!: TLoadedScene;
        startTestScene(store, 'Loading', () => {
            cave = useLoadScene({ src: 'scenes/cave.scene' });
            return createScene();
        });
        await settle();
        // Added, its picture still on the way.
        expect(cave.name).toBe('cave');
        expect(cave.status).toBe('loading');

        expect(() => startScene(store, 'cvae')).toThrow("'cvae' is not registered. Add it to the object passed to createGame, or load its .scene file with useLoadScene.");
    });

    it('asks for the maps its boxes show, which the list of assets leaves out, and waits for them', async () => {
        const withMap = structuredClone(CAVE);
        withMap.assets = [];
        withMap.root.children[0]!.components = [{ type: 'tilemap', id: 'ground', map: 'maps/cave.tilemap' }] as never;
        serve({ 'scenes/cave.scene': withMap });
        const { store } = createTestGame();
        let cave!: TLoadedScene;
        startTestScene(store, 'Loading', () => {
            cave = useLoadScene({ src: 'scenes/cave.scene' });
            return createScene();
        });
        await whenLoaded(cave);

        // Under the key the box's createTilemap finds it by, so the scene starts on the same one.
        expect(asked.some((url) => url.endsWith('maps/cave.tilemap'))).toBe(true);
        const map = store.get('assets').tilemaps.get('maps/cave.tilemap');
        expect(map).toBeDefined();
        expect(map!.status).not.toBe('loading');
    });

    it('reads a document inside an envelope', async () => {
        serve({ 'scenes/cave.scene': { format: 'nacatamal-scene', version: 2, scene: CAVE } });
        const { store } = createTestGame();
        let cave!: TLoadedScene;
        startTestScene(store, 'Loading', () => {
            cave = useLoadScene({ src: 'scenes/cave.scene' });
            return createScene();
        });
        pictureArrives();
        await whenLoaded(cave);

        expect(cave.status).toBe('ready');
        expect(cave.name).toBe('cave');
    });

    it('finds its scene already there when the same file is loaded again, under another key or after being let go of', async () => {
        serve({ 'scenes/cave.scene': CAVE });
        const { store } = createTestGame();
        let first!: TLoadedScene;
        startTestScene(store, 'A', () => {
            first = useLoadScene({ src: 'scenes/cave.scene' });
            return createScene();
        });
        pictureArrives();
        await whenLoaded(first);
        const added = store.get('world').names.get('cave');

        let again!: TLoadedScene;
        startTestScene(store, 'B', () => {
            again = useLoadScene({ src: 'scenes/cave.scene', key: 'the-cave' });
            return createScene();
        });
        await whenLoaded(again);
        expect(again).not.toBe(first);
        expect(again.status).toBe('ready');
        expect(again.name).toBe('cave');

        expect(releaseAsset(store, first)).toBe(true);
        expect(first.status).toBe('released');
        let after!: TLoadedScene;
        startTestScene(store, 'C', () => {
            after = useLoadScene({ src: 'scenes/cave.scene' });
            return createScene();
        });
        await whenLoaded(after);
        expect(after.status).toBe('ready');
        // The one scene, never added twice.
        expect(store.get('world').names.get('cave')).toBe(added);
        expect(said()).not.toContain('already has a scene called that');
    });
});
