import { afterEach, describe, expect, it, spyOn } from 'bun:test';
import { resolveAssetPath } from '../src/loaders/resolve_asset_path';
import { createScene } from '../src/scene/create_scene';
import { createTilemap } from '../src/gameobjects/tilemap/create_tilemap';
import { whenLoaded } from '../src/loaders';
import { createTestGame, startTestScene } from './helpers/test_game';
import { serveTilemap } from './helpers/test_tilemap';
import { asGltf, serveGltf, TEST_QUAD } from './helpers/test_gltf';
import { useLoadGltf } from '../src/hooks/loaders/use_load_gltf';
import { useLoadAtlas } from '../src/hooks/loaders/use_load_atlas';
import { useLoadTexture } from '../src/hooks/loaders/use_load_texture';
import { assetKey } from '../src/loaders/asset_key';
import { textureByKey } from '../src/loaders/texture/texture_by_key';
import { createGameHandle } from '../src/game/handle/create_game_handle';
import type { TGltfModel, TLoadedAtlas, TTexture } from '../src/loaders';
import type { TTilemap } from '../src/gameobjects/tilemap';

/**
 * Where a path written inside an asset file points.
 *
 * The case worth having tests for is the published one: a game does not always sit at the root of a
 * domain, and a rule that quietly assumes it does produces a 404 that only ever shows up after a
 * deploy. The rest of these pin the behaviour that was already right so that fixing that one cannot
 * break them.
 */

/**
 * Pretends the page is at `href`, or that there is no page at all.
 */
const onPage = (href: string | null): void => {
    if (href === null) {
        delete (globalThis as { location?: unknown }).location;
        return;
    }
    Object.defineProperty(globalThis, 'location', { value: { href }, configurable: true, writable: true });
};

const originalLocation = (globalThis as { location?: unknown }).location;

afterEach(() => {
    Object.defineProperty(globalThis, 'location', { value: originalLocation, configurable: true, writable: true });
});

describe('resolveAssetPath', () => {
    it('keeps the subdirectory the page is served from', () => {
        // The published case: a host that puts each game under its own folder. Resolving against a
        // made-up root would answer '/assets/tilesets/overworld.atlas' and every sheet would 404.
        onPage('https://html-classic.itch.zone/html/1234/index.html');

        expect(resolveAssetPath('./assets/maps/1-1.tilemap', '../tilesets/overworld.atlas'))
            .toBe('/html/1234/assets/tilesets/overworld.atlas');
    });

    it('answers the same for a game at the root', () => {
        onPage('http://localhost:5176/');

        expect(resolveAssetPath('/assets/maps/1-1.tilemap', '../tilesets/overworld.atlas'))
            .toBe('/assets/tilesets/overworld.atlas');
        expect(resolveAssetPath('./assets/maps/1-1.tilemap', '../tilesets/overworld.atlas'))
            .toBe('/assets/tilesets/overworld.atlas');
    });

    it('works with no page at all', () => {
        // Under a test runner there is no `location`, and reading it must not throw. With every
        // path absolute the stand-in root cancels out, so the answer is the same one.
        onPage(null);

        expect(resolveAssetPath('/maps/level.tilemap', 'tiles.atlas')).toBe('/maps/tiles.atlas');
    });

    it('keeps the host of a file that came from another one', () => {
        // The editor's case: the page on one port, the project's files served from another. A bare
        // path would ask the page's host, which answers with its own HTML and a 200.
        onPage('http://localhost:5174/?engine=nacatamalon');
        expect(resolveAssetPath('http://localhost:4321/assets/models/cars/sedan.gltf', 'sedan.bin'))
            .toBe('http://localhost:4321/assets/models/cars/sedan.bin');
        expect(resolveAssetPath('http://localhost:4321/../assets/maps/a.tilemap', '../tiles/t.atlas'))
            .toBe('http://localhost:4321/assets/tiles/t.atlas');
        // The same host as the page is still a path.
        expect(resolveAssetPath('http://localhost:5174/assets/m.tilemap', 't.atlas')).toBe('/assets/t.atlas');
    });

    it('reads the page at every call, not once when it loaded', () => {
        // A test that sets up its page after the engine has been imported still has to be believed,
        // which is what a module-level constant would have got wrong.
        onPage('https://example.com/a/b/');
        expect(resolveAssetPath('./m.tilemap', 't.atlas')).toBe('/a/b/t.atlas');

        onPage('https://example.com/c/');
        expect(resolveAssetPath('./m.tilemap', 't.atlas')).toBe('/c/t.atlas');
    });

    it('leaves a path that starts at the root alone', () => {
        onPage('https://html-classic.itch.zone/html/1234/index.html');

        // A file naming '/assets/x.png' means the root and says so. Only a relative name is
        // relative to the file that wrote it.
        expect(resolveAssetPath('./assets/maps/1-1.tilemap', '/assets/tilesets/overworld.atlas'))
            .toBe('/assets/tilesets/overworld.atlas');
    });

    it('resolves a sheet beside its image the way a sheet writes it', () => {
        onPage('https://example.com/game/');

        expect(resolveAssetPath('/game/assets/sprites/mario.atlas', 'mario.png'))
            .toBe('/game/assets/sprites/mario.png');
    });
});

describe('a map and its sheet, loaded from a subdirectory', () => {
    it('asks for both of them where the game actually is', async () => {
        const served = serveTilemap();
        // After the helper, which sets up a page of its own: this is the published case, and it is
        // the one the old rule got wrong.
        onPage('https://html-classic.itch.zone/html/1234/index.html');

        const { store } = createTestGame();
        let map!: TTilemap;
        startTestScene(store, 'Level', () => {
            map = createTilemap({ src: './assets/maps/level.tilemap' });
            return createScene();
        });
        await whenLoaded(map);
        served.restore();

        // The sheet and its image, both under the folder the game is served from. Before there was
        // one resolver, these came back rooted at the domain and the map drew nothing.
        expect(served.asked).toContain('/html/1234/assets/maps/tiles.atlas');
        expect(served.asked).toContain('/html/1234/assets/maps/tiles.png');
        expect(map.status).toBe('ready');
    });
});

describe('a model served from a subfolder', () => {
    it('finds its numbers and its picture under the folder the game is served from', async () => {
        const { json, bin } = asGltf({
            nodes: [{ name: 'Tower', primitives: [{ ...TEST_QUAD, material: 0 }] }],
            materials: [{ image: 'textures/atlas.png' }],
        });
        const served = serveGltf({
            // The model file itself is asked for exactly as it was written, the way a browser
            // resolves any address on a page. It is the paths INSIDE it that have to be worked out.
            './assets/models/tower.gltf': json,
            '/html/1234/assets/models/model.bin': bin,
            '/html/1234/assets/models/textures/atlas.png': 'png',
        });
        // After the helper, which sets up a page of its own.
        onPage('https://html-classic.itch.zone/html/1234/index.html');

        const { store } = createTestGame();
        let model!: TGltfModel;
        startTestScene(store, 'Level', () => {
            model = useLoadGltf({ src: './assets/models/tower.gltf' });
            return createScene();
        });
        await whenLoaded(model);
        served.restore();

        expect(served.asked).toContain('/html/1234/assets/models/model.bin');
        expect(served.asked).toContain('/html/1234/assets/models/textures/atlas.png');
        expect(model.status).toBe('ready');
    });
});

describe('one file, one entry in the cache', () => {
    const GAME = 'https://html-classic.itch.zone/html/1234/index.html';
    const count = (asked: string[], end: string) => asked.filter((url) => url.endsWith(end)).length;

    it('is the same file however the game writes its path', async () => {
        const served = serveTilemap();
        onPage(GAME);
        const warn = spyOn(console, 'warn').mockImplementation(() => {});

        const { store } = createTestGame();
        let first!: TTexture;
        let second!: TTexture;
        startTestScene(store, 'Level', () => {
            first = useLoadTexture({ src: './assets/maps/tiles.png' });
            second = useLoadTexture({ src: '/html/1234/assets/maps/tiles.png' });
            return createScene();
        });
        await whenLoaded(first);
        served.restore();

        expect(second).toBe(first);
        expect(count(served.asked, 'tiles.png')).toBe(1);
        expect(store.get('assets').textures.size).toBe(1);
        // Found by the name it was asked by, either way it is written.
        startTestScene(store, 'Other', () => {
            expect(textureByKey('createSprite', './assets/maps/tiles.png')).toBe(first);
            expect(textureByKey('createSprite', '/html/1234/assets/maps/tiles.png')).toBe(first);
            return createScene();
        });
        // The same file is not "another file under a key already taken".
        expect(warn).not.toHaveBeenCalled();
        warn.mockRestore();
    });

    it('shares a map\'s sheet with the game, asked for with no key', async () => {
        const served = serveTilemap();
        onPage(GAME);

        const { store } = createTestGame();
        let map!: TTilemap;
        let sheet!: TLoadedAtlas;
        startTestScene(store, 'Level', () => {
            sheet = useLoadAtlas({ src: './assets/maps/tiles.atlas' });
            map = createTilemap({ src: './assets/maps/level.tilemap' });
            return createScene();
        });
        await whenLoaded(map);
        served.restore();

        // The build of a game served from a folder used to ask for this sheet twice: once as the
        // game wrote it and once as the map resolved it, and made two textures of it.
        expect(count(served.asked, 'tiles.atlas')).toBe(1);
        expect(store.get('assets').atlases.size).toBe(1);
        expect(sheet.status).toBe('ready');
    });

    it('shares it with one the game loaded under a key of its own', async () => {
        const served = serveTilemap();
        onPage(GAME);

        const { store } = createTestGame();
        let map!: TTilemap;
        startTestScene(store, 'Level', () => {
            useLoadAtlas({ src: './assets/maps/tiles.atlas', key: 'tiles' });
            map = createTilemap({ src: './assets/maps/level.tilemap' });
            return createScene();
        });
        await whenLoaded(map);
        served.restore();

        expect(count(served.asked, 'tiles.atlas')).toBe(1);
        expect([...store.get('assets').atlases.keys()]).toEqual(['tiles']);
        expect(map.status).toBe('ready');
    });

    it('lets go of a file by the path the game wrote, however it was kept', async () => {
        const served = serveTilemap();
        onPage(GAME);

        const { store } = createTestGame();
        let texture!: TTexture;
        startTestScene(store, 'Level', () => {
            texture = useLoadTexture({ src: './assets/maps/tiles.png' });
            return createScene();
        });
        await whenLoaded(texture);
        served.restore();

        expect(createGameHandle(store).releaseAsset('./assets/maps/tiles.png')).toBe(true);
        expect(texture.status).toBe('released');
        expect(store.get('assets').textures.size).toBe(0);
    });

    it('leaves the engine\'s own names and inline data as they are', () => {
        onPage(GAME);
        expect(assetKey('nacatamalon:arcade')).toBe('nacatamalon:arcade');
        expect(assetKey('data:image/png;base64,AAAA')).toBe('data:image/png;base64,AAAA');
        expect(assetKey('./assets/a.png')).toBe('/html/1234/assets/a.png');
        expect(assetKey('https://html-classic.itch.zone/html/1234/assets/a.png')).toBe('/html/1234/assets/a.png');
        expect(assetKey('https://cdn.example.com/a.png')).toBe('https://cdn.example.com/a.png');
    });
});
