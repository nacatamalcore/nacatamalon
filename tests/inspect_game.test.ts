import { afterEach, describe, expect, it, spyOn } from 'bun:test';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHeadlessGame } from '../src/headless';
import { createScene } from '../src/scene/create_scene';
import { registerScene } from '../src/scene/register_scene';
import { stopScene } from '../src/scene/stop_scene';
import { setScenePaused } from '../src/scene/pause_scene';
import { findScene } from '../src/scene/find_scene';
import { parseSceneDoc, sceneFromDoc } from '../src/scene/document';
import { useLoadTexture } from '../src/hooks/loaders/use_load_texture';
import { useLoadAudio } from '../src/hooks/loaders/use_load_audio';
import { useLoadAtlas } from '../src/hooks/loaders/use_load_atlas';
import { useCubeGeometry } from '../src/hooks/geometry/use_cube_geometry';
import { useScene } from '../src/hooks/scene/use_scene';
import { useUpdate } from '../src/hooks/loop';
import { registerGameSystem } from '../src';
import { encodePng } from '../src/authoring';
import { pixelsFromRows } from '../src/pixels';
import { inspectGame, onAssetsChanged, onScenesChanged, registerAssetType } from '../src/extend';
import { getActiveGame } from '../src/store';
import { startGameSystems, stopGameSystems } from '../src/game_systems/game_systems';
import { advanceFrame } from '../src/game/loop/tick';
import { createFrameContext } from '../src/game/loop/create_frame_context';
import { newTexture } from '../src/loaders';
import { hold } from '../src/loaders/asset_holds';
import { releaseAsset } from '../src/loaders/release_asset';
import { SPLASH_SCENE, clearSplash, setSplash } from '../src/splash/behind_splash';
import { fade } from '../src/transition';
import { createGeometry, updateGeometry } from '../src/geometry/create_geometry';
import { startScene } from '../src/scene/start_scene';
import { createTestGame, startTestScene } from './helpers/test_game';
import type { THeadlessGame } from '../src/headless';
import type { TSceneHandle } from '../src/hooks/scene/use_scene';
import type { TAudioClip, TTexture } from '../src/loaders';
import type { TGeometry } from '../src/geometry';
import type { TRuntimeStore } from '../src/store';
import type { TAssetInspection } from '../src/extend';

// What a tool watching a game reads of it: its scenes, its systems and its files, as a frozen picture,
// and when either half changed.

const removals: Array<() => void> = [];
const withSystems: TRuntimeStore[] = [];
const games: THeadlessGame[] = [];
const folders: string[] = [];
afterEach(() => {
    while (removals.length > 0) removals.pop()!();
    while (withSystems.length > 0) stopGameSystems(withSystems.pop()!);
    while (games.length > 0) games.pop()!.destroy();
    while (folders.length > 0) rmSync(folders.pop()!, { recursive: true, force: true });
});

/** A texture as a finished load leaves it, kept by the game under `key`. */
const loaded = (store: TRuntimeStore, key: string, size = 16): TTexture => {
    const texture = newTexture(`/${key}.png`, key);
    texture.width = size;
    texture.height = size;
    texture.status = 'ready';
    store.get('assets').textures.set(key, texture);
    return texture;
};

/** A scene whose body asks for the textures named, already loaded. */
const asking = (...keys: string[]) => () => {
    for (const key of keys) useLoadTexture({ src: `/${key}.png`, key });
    return createScene();
};

const assetOf = (store: TRuntimeStore, key: string): TAssetInspection | undefined =>
    inspectGame(store).assets.find((asset) => asset.key === key);

const states = (store: TRuntimeStore) => inspectGame(store).scenes.map((scene) => [scene.name, scene.state]);

/** A shape kept by the game, as `createGeometry` leaves one. */
const createTestShape = (store: TRuntimeStore): TGeometry => {
    const shape = {
        type: 'geometry', key: 'geometry:test', status: 'ready', source: null, vertexCount: 3, indexCount: 3,
        bounds: null, positions: null, indices: null, vertexBuffer: null, indexBuffer: null, indexType: 'uint16',
        skinBuffer: null, colorBuffer: null, detailBuffer: null,
    } as TGeometry;
    store.get('assets').geometries.set(shape.key, shape);
    return shape;
};

/** A game whose frames are run one at a time. */
const framed = (overrides: Parameters<typeof createTestGame>[0] = {}) => {
    const game = createTestGame(overrides);
    const ctx = createFrameContext();
    return { ...game, frame: (ms = 17) => advanceFrame(game.store, ctx, ms) };
};

describe('inspectGame: scenes', () => {
    it('lists the registered scenes, stopped or running, and what state each running one is in', () => {
        const { store } = createTestGame();
        registerScene(store, 'Menu', () => createScene());
        startTestScene(store, 'Level', () => createScene());
        startTestScene(store, 'Hud', () => createScene());
        setScenePaused(store, 'Hud', true);

        expect(inspectGame(store).scenes).toEqual([
            { name: 'Menu', state: 'stopped', registered: true, loads: { ready: 0, total: 0 } },
            { name: 'Level', state: 'running', registered: true, loads: { ready: 0, total: 0 } },
            { name: 'Hud', state: 'paused', registered: true, loads: { ready: 0, total: 0 } },
        ]);
        stopScene(store, 'Level');
        expect(states(store)).toEqual([['Menu', 'stopped'], ['Level', 'stopped'], ['Hud', 'paused']]);
    });

    it('counts what a running scene asked for, and how much of it is ready', () => {
        const { store } = createTestGame();
        loaded(store, 'hero');
        const waiting = newTexture('/far.png', 'far');
        store.get('assets').textures.set('far', waiting);
        startTestScene(store, 'Level', asking('hero', 'far'));

        expect(inspectGame(store).scenes[0]!.loads).toEqual({ ready: 1, total: 2 });
    });

    it('says a scene waiting behind a transition is held, until it is uncovered', () => {
        const { store, frame } = framed();
        let handle!: TSceneHandle;
        startTestScene(store, 'Menu', () => { handle = useScene(); return createScene(); });
        registerScene(store, 'Level', () => createScene());
        handle.change('Level', { transition: fade(0.3) });
        for (let i = 0; i < 30 && findScene(store, 'Level')?.held !== true; i++) frame();

        expect(states(store)).toEqual([['Menu', 'running'], ['Level', 'held']]);
        for (let i = 0; i < 60; i++) frame();
        expect(states(store)).toEqual([['Menu', 'stopped'], ['Level', 'running']]);
    });

    it('lists a scene made from a document by the name it was registered under', () => {
        const { store } = createTestGame();
        const doc = parseSceneDoc({
            format: 'nacatamalon-scene', version: 1, name: 'Level', assets: [{ type: 'texture', key: 'hero', src: '/hero.png' }],
            root: { id: 'root', name: 'Level', transform: null, children: [], components: [] },
        }, 'test');
        loaded(store, 'hero');
        const room = startTestScene(store, 'Room', sceneFromDoc(doc, 'Room'));

        expect(states(store)).toEqual([['Room', 'running']]);
        expect(assetOf(store, 'hero')!.askedBy).toEqual(['Room']);
        // And once it stopped.
        expect(stopScene(store, room)).toBe(true);
        expect(states(store)).toEqual([['Room', 'stopped']]);
        expect(assetOf(store, 'hero')!.askedBy).toEqual(['Room']);
    });

    it('lists a restarted scene once', () => {
        const { store, frame } = framed();
        let handle!: TSceneHandle;
        startTestScene(store, 'Level', () => { handle = useScene(); return createScene(); });
        handle.restart('Level');
        frame();

        expect(states(store)).toEqual([['Level', 'running']]);
    });

    it('leaves the splash out, while it shows and after, and the scene behind it is running', () => {
        const { store } = createTestGame();
        const splash = startTestScene(store, SPLASH_SCENE, () => createScene());
        setSplash(store, splash);
        startTestScene(store, 'Level', () => createScene());

        expect(states(store)).toEqual([['Level', 'running']]);
        stopScene(store, splash);
        clearSplash(store);
        expect(states(store)).toEqual([['Level', 'running']]);
    });
});

describe('inspectGame: systems', () => {
    it('lists the running systems with what they asked for, and none once they stop', () => {
        const { store } = createTestGame();
        loaded(store, 'beep');
        removals.push(registerGameSystem('test-inspect-system', () => {
            useLoadTexture({ src: '/beep.png', key: 'beep' });
        }));
        startGameSystems(store);
        withSystems.push(store);

        expect(inspectGame(store).systems).toEqual([{ name: 'test-inspect-system', loads: { ready: 1, total: 1 } }]);
        expect(assetOf(store, 'beep')!.askedBy).toEqual(['test-inspect-system']);
        stopGameSystems(store);
        expect(inspectGame(store).systems).toEqual([]);
        // Still said to be its: what tells a file that was never let go of.
        expect(assetOf(store, 'beep')!.askedBy).toEqual(['test-inspect-system']);
    });
});

describe('inspectGame: files', () => {
    it('says what each file is, under what key, how it is, and roughly what it takes', () => {
        const { store } = createTestGame();
        loaded(store, 'hero', 16);
        startTestScene(store, 'Level', asking('hero'));

        expect(assetOf(store, 'hero')).toEqual({
            type: 'texture',
            key: 'hero',
            status: 'ready',
            detail: { width: 16, height: 16 },
            bytes: 16 * 16 * 4,
            askedBy: ['Level'],
            heldBy: [{ kind: 'game' }],
        });
    });

    it('leaves out what was let go of', () => {
        const { store } = createTestGame();
        loaded(store, 'hero');
        expect(assetOf(store, 'hero')).toBeDefined();
        releaseAsset(store, 'hero');
        expect(assetOf(store, 'hero')).toBeUndefined();
    });

    it('keeps who asked once they stopped, the first to stop first, and those still running after', () => {
        const { store } = createTestGame();
        loaded(store, 'hero');
        startTestScene(store, 'Level', asking('hero'));
        startTestScene(store, 'Hud', asking('hero'));
        startTestScene(store, 'Pause', asking('hero'));
        stopScene(store, 'Pause');
        stopScene(store, 'Level');

        expect(assetOf(store, 'hero')!.askedBy).toEqual(['Pause', 'Level', 'Hud']);
    });

    it('keeps a scene that asked for something no longer in memory once it stopped', () => {
        const { store } = createTestGame();
        loaded(store, 'hero');
        const roots: WeakRef<object>[] = [];
        for (let i = 0; i < 8; i++) {
            roots.push(new WeakRef(startTestScene(store, `Level${i}`, asking('hero'))));
            stopScene(store, `Level${i}`);
        }
        Bun.gc(true);

        expect(roots.filter((root) => root.deref() !== undefined).length).toBeLessThan(4);
        expect(assetOf(store, 'hero')!.askedBy).toHaveLength(8);
    });

    it('names who keeps a file: the game, another file, or something made in code', () => {
        const { store } = createTestGame();
        const picture = loaded(store, 'picture');
        const sheet = loaded(store, 'sheet');
        hold(picture, sheet);
        const effect = {};
        hold(picture, effect);
        // One that no longer counts is not named.
        const gone = { status: 'ready' };
        hold(picture, gone);
        gone.status = 'released';

        expect(assetOf(store, 'picture')!.heldBy).toEqual([{ kind: 'asset', type: 'texture', key: 'sheet' }, { kind: 'unnamed' }]);
        expect(assetOf(store, 'sheet')!.heldBy).toEqual([]);
    });

    it('hands back a frozen picture, which the game going on does not change', () => {
        const { store } = createTestGame();
        loaded(store, 'hero');
        startTestScene(store, 'Level', asking('hero'));
        const seen = inspectGame(store);

        expect(Object.isFrozen(seen)).toBe(true);
        expect(Object.isFrozen(seen.scenes)).toBe(true);
        expect(Object.isFrozen(seen.scenes[0])).toBe(true);
        expect(Object.isFrozen(seen.scenes[0]!.loads)).toBe(true);
        expect(Object.isFrozen(seen.assets[0]!.askedBy)).toBe(true);
        expect(Object.isFrozen(seen.assets[0]!.heldBy[0])).toBe(true);
        expect(Object.isFrozen(seen.assets[0]!.detail)).toBe(true);

        startTestScene(store, 'Hud', asking('hero'));
        expect(seen.scenes.map((scene) => scene.name)).toEqual(['Level']);
        expect(seen.assets[0]!.askedBy).toEqual(['Level']);
    });
});

describe('inspectGame: files loaded from disk', () => {
    const filesIn = (files: Record<string, string | Uint8Array>): string => {
        const folder = mkdtempSync(join(tmpdir(), 'nacatamalon-inspect-'));
        folders.push(folder);
        for (const [path, content] of Object.entries(files)) {
            const at = join(folder, path);
            mkdirSync(join(at, '..'), { recursive: true });
            writeFileSync(at, content);
        }
        return folder;
    };
    const PNG = encodePng(pixelsFromRows(['rr', 'rr'], { r: '#ff0000' }));

    it('follows each file from loading to ready or error, with a sound\'s length and a shape\'s buffers', async () => {
        const warn = spyOn(console, 'warn').mockImplementation(() => {});
        const error = spyOn(console, 'error').mockImplementation(() => {});
        const folder = filesIn({
            'hero.png': PNG,
            'hit.wav': new Uint8Array(64),
            'sheet.png': PNG,
            'sheet.atlas': JSON.stringify({ format: 1, kind: 'atlas', texture: 'sheet.png', grid: { frameWidth: 1, frameHeight: 1 } }),
        });
        let store!: TRuntimeStore;
        let clip!: TAudioClip;
        let cube!: TGeometry;
        const game = createHeadlessGame({
            width: 8, height: 8, assets: folder, scenes: {
                Level: () => {
                    store = getActiveGame()!;
                    useLoadTexture({ src: '/hero.png' });
                    useLoadTexture({ src: '/missing.png' });
                    clip = useLoadAudio({ src: '/hit.wav' });
                    useLoadAtlas({ src: '/sheet.atlas' });
                    cube = useCubeGeometry();
                    return createScene();
                },
            },
        });
        games.push(game);
        const byType = (type: string) => inspectGame(store).assets.filter((asset) => asset.type === type);
        expect(byType('texture').map((asset) => asset.status)).toContain('loading');

        await game.loaded();
        game.run(1);
        const textures = byType('texture');
        const hero = textures.find((asset) => asset.key.includes('hero'))!;
        expect(hero.status).toBe('ready');
        expect(hero.detail).toEqual({ width: 2, height: 2 });
        expect(hero.bytes).toBe(2 * 2 * 4);
        expect(textures.find((asset) => asset.key.includes('missing'))!.status).toBe('error');

        const [sound] = byType('audio');
        expect(sound!.detail).toEqual({ duration: clip.duration });
        expect(sound!.bytes).toBe(clip.buffer!.length * clip.buffer!.numberOfChannels * 4);

        // A sheet wears its picture inside it, rather than as a file of its own: counted with it.
        const [atlas] = byType('atlas');
        expect(atlas!.detail).toEqual({ width: 2, height: 2 });
        expect(atlas!.bytes).toBe(2 * 2 * 4);
        expect(textures.some((asset) => asset.key.includes('sheet'))).toBe(false);

        // A shape on the card: eight numbers a corner, its corner order, and the colour (four bytes)
        // and detail (six numbers) a cube carries for each corner.
        const [shape] = byType('geometry');
        expect(cube.vertexBuffer).not.toBeNull();
        expect([cube.colorBuffer !== null, cube.detailBuffer !== null, cube.skinBuffer]).toEqual([true, true, null]);
        expect(shape!.bytes).toBe(cube.vertexCount * (8 * 4 + 4 + 6 * 4) + cube.indexCount * (cube.indexType === 'uint16' ? 2 : 4));
        // The files its body asked for; a shape built in code is not one.
        expect(inspectGame(store).scenes[0]!.loads).toEqual({ ready: 3, total: 4 });
        warn.mockRestore();
        error.mockRestore();
    });

    it('calls a plugin\'s file by its kind, and names it as the one keeping the picture it reads', async () => {
        const kind = `test-inspect-rig-${Math.random().toString(36).slice(2)}`;
        const rigs = registerAssetType<TTexture>({ kind, read: 'json', parse: (_, help) => help.texture('hero.png') });
        const folder = filesIn({ 'hero.rig': '{}', 'hero.png': PNG });
        let store!: TRuntimeStore;
        const game = createHeadlessGame({
            width: 8, height: 8, assets: folder,
            scenes: { Level: () => { store = getActiveGame()!; rigs.useLoad({ src: '/hero.rig' }); return createScene(); } },
        });
        games.push(game);
        await game.loaded();

        const { assets } = inspectGame(store);
        const rig = assets.find((asset) => asset.type === kind)!;
        expect(rig.status).toBe('ready');
        expect(assets.find((asset) => asset.type === 'texture')!.heldBy).toEqual([{ kind: 'asset', type: kind, key: rig.key }]);
    });
});

describe('onScenesChanged', () => {
    it('is told once at the end of a frame however many scenes changed, and not when none did', () => {
        const { store, frame } = framed();
        let told = 0;
        onScenesChanged(store, () => { told++; });
        frame();
        expect(told).toBe(0);

        startTestScene(store, 'Level', () => createScene());
        startTestScene(store, 'Hud', () => createScene());
        setScenePaused(store, 'Hud', true);
        expect(told).toBe(0);
        frame();
        expect(told).toBe(1);
        frame();
        expect(told).toBe(1);

        setScenePaused(store, 'Hud', false);
        frame();
        expect(told).toBe(2);
        registerScene(store, 'Menu', () => createScene());
        frame();
        expect(told).toBe(3);
    });

    it('is told while the game is paused, at a standstill, and on a picture with no fixed step in it', () => {
        for (const [what, overrides, ms, set] of [
            ['paused', {}, 17, (store: TRuntimeStore) => store.setState('loop', { pausedBy: ['test'] })],
            ['standstill', {}, 17, (store: TRuntimeStore) => store.setState('loop', { timeScale: 0 })],
            ['no step', { step: 60 }, 1, () => {}],
        ] as const) {
            const { store, frame } = framed(overrides);
            set(store);
            let told = 0;
            onScenesChanged(store, () => { told++; });
            startTestScene(store, 'Level', () => createScene());
            frame(ms);
            expect([what, told]).toEqual([what, 1]);
        }
    });

    it('is told when a scene held behind a transition is uncovered, though no scene came or went', () => {
        const { store, frame } = framed();
        let handle!: TSceneHandle;
        startTestScene(store, 'Menu', () => { handle = useScene(); return createScene(); });
        registerScene(store, 'Level', () => createScene());
        handle.launch('Level', { transition: fade(0.3) });
        for (let i = 0; i < 30 && findScene(store, 'Level')?.held !== true; i++) frame();
        expect(states(store)).toEqual([['Menu', 'running'], ['Level', 'held']]);
        let told = 0;
        onScenesChanged(store, () => { told++; });
        for (let i = 0; i < 60; i++) frame();

        expect(states(store)).toEqual([['Menu', 'running'], ['Level', 'running']]);
        expect(told).toBe(1);
    });

    it('is told when a file a running scene asked for arrives, as its loads count changes', () => {
        const { store, frame } = framed();
        const far = newTexture('/far.png', 'far');
        store.get('assets').textures.set('far', far);
        startTestScene(store, 'Level', asking('far'));
        frame();
        let told = 0;
        onScenesChanged(store, () => { told++; });
        far.status = 'ready';
        frame();

        expect(told).toBe(1);
        expect(inspectGame(store).scenes[0]!.loads).toEqual({ ready: 1, total: 1 });
    });

    it('is told when a system starts or stops', () => {
        const { store, frame } = framed();
        removals.push(registerGameSystem('test-inspect-told', () => {}));
        let told = 0;
        onScenesChanged(store, () => { told++; });
        startGameSystems(store);
        withSystems.push(store);
        frame();
        expect(told).toBe(1);
        stopGameSystems(store);
        frame();
        expect(told).toBe(2);
    });
});

describe('onAssetsChanged', () => {
    it('is told once a frame when a file comes in, arrives, fails or is let go of, and not otherwise', () => {
        const { store, frame } = framed();
        let told = 0;
        onAssetsChanged(store, () => { told++; });

        const far = newTexture('/far.png', 'far');
        store.get('assets').textures.set('far', far);
        loaded(store, 'hero');
        frame();
        expect(told).toBe(1);
        frame();
        expect(told).toBe(1);

        far.status = 'ready';
        frame();
        expect(told).toBe(2);
        far.status = 'error';
        frame();
        expect(told).toBe(3);

        releaseAsset(store, 'hero');
        frame();
        expect(told).toBe(4);
    });

    it('is told when one goes and another comes in its place in the same frame', () => {
        const { store, frame } = framed();
        loaded(store, 'a');
        let told = 0;
        onAssetsChanged(store, () => { told++; });
        releaseAsset(store, 'a');
        loaded(store, 'b');
        frame();
        expect(told).toBe(1);
    });

    it('is told when a scene asks for one already loaded, or one that asked stops', () => {
        const { store, frame } = framed();
        loaded(store, 'hero');
        let told = 0;
        onAssetsChanged(store, () => { told++; });
        startTestScene(store, 'Level', asking('hero'));
        frame();
        expect(told).toBe(1);
        stopScene(store, 'Level');
        frame();
        expect(told).toBe(2);
    });
});

describe('onAssetsChanged: what a count alone would miss', () => {
    it('is told when a scene that asked for one file stops and another that asks for one starts', () => {
        const { store, frame } = framed();
        loaded(store, 'a');
        loaded(store, 'b');
        startTestScene(store, 'Menu', asking('a'));
        frame();
        let told = 0;
        onAssetsChanged(store, () => { told++; });
        stopScene(store, 'Menu');
        startTestScene(store, 'Level', asking('b'));
        frame();
        expect(told).toBe(1);
    });

    it('is told when a picture changes size, or another is put under its key', () => {
        const { store, frame } = framed();
        const hero = loaded(store, 'hero', 16);
        let told = 0;
        onAssetsChanged(store, () => { told++; });
        hero.width = 128;
        hero.height = 128;
        frame();
        expect(told).toBe(1);
        expect(assetOf(store, 'hero')!.bytes).toBe(128 * 128 * 4);

        loaded(store, 'hero', 128);
        frame();
        expect(told).toBe(2);
    });

    it('is told when a font grows the picture it wears, or a picture turns on its side', () => {
        const { store, frame } = framed();
        const letters = newTexture('/arcade-letters.png', 'arcade-letters');
        letters.width = 128;
        letters.height = 128;
        letters.status = 'ready';
        store.get('assets').fonts.set('arcade', { key: 'arcade', src: '/arcade.ttf', status: 'ready', texture: letters } as never);
        const hero = loaded(store, 'hero');
        hero.width = 64;
        hero.height = 32;
        let told = 0;
        onAssetsChanged(store, () => { told++; });

        letters.width = 256;
        letters.height = 256;
        frame();
        expect(told).toBe(1);
        expect(assetOf(store, 'arcade')!.bytes).toBe(256 * 256 * 4);

        hero.width = 32;
        hero.height = 64;
        frame();
        expect(told).toBe(2);
    });

    it('is told when two pictures change size the opposite way, or a shape is changed', () => {
        const { store, frame } = framed();
        const left = loaded(store, 'left', 160);
        const right = loaded(store, 'right', 160);
        const shape = createTestShape(store);
        let told = 0;
        onAssetsChanged(store, () => { told++; });
        left.width = 200;
        right.width = 120;
        frame();
        expect(told).toBe(1);

        shape.vertexCount *= 2;
        frame();
        expect(told).toBe(2);
    });

    it('is not told when a scene that asked for no file starts or stops', () => {
        const { store, frame } = framed();
        let told = 0;
        onAssetsChanged(store, () => { told++; });
        startTestScene(store, 'Empty', () => createScene());
        frame();
        stopScene(store, 'Empty');
        frame();
        expect(told).toBe(0);
    });

    it('is told when a file a scene asked for that no cache keeps arrives', () => {
        const { store, frame } = framed();
        const level = startTestScene(store, 'Level', () => createScene());
        const voice = { status: 'loading' as const } as { status: 'loading' | 'ready' };
        level.loads.push(voice);
        let told = 0;
        onAssetsChanged(store, () => { told++; });
        voice.status = 'ready';
        frame();
        expect(told).toBe(1);
        expect(inspectGame(store).scenes[0]!.loads).toEqual({ ready: 1, total: 1 });
    });
});

describe('found by an outside review', () => {
    it('tells the files changed when a scene asks for one and stops between two frames', () => {
        const { store, frame } = framed();
        loaded(store, 'hero');
        registerScene(store, 'Brief', asking('hero'));
        frame();
        let told = 0;
        onAssetsChanged(store, () => { told++; });
        startScene(store, 'Brief');
        stopScene(store, 'Brief');
        frame();

        expect(assetOf(store, 'hero')!.askedBy).toEqual(['Brief']);
        expect(told).toBe(1);
    });

    it('measures a plugin\'s file by what it is, whatever its kind is called', () => {
        const { store } = createTestGame();
        store.get('assets').pluginAssets.set('cue', { type: 'plugin-asset', kind: 'audio', key: 'cue', src: '/cue.json', status: 'ready', data: null });
        store.get('assets').pluginAssets.set('sheet', { type: 'plugin-asset', kind: 'texture', key: 'sheet', src: '/sheet.json', status: 'ready', data: null });

        expect(assetOf(store, 'cue')).toMatchObject({ type: 'audio', detail: {}, bytes: null });
        expect(assetOf(store, 'sheet')).toMatchObject({ type: 'texture', detail: {}, bytes: null });
    });

    it('tells two pictures resized so that their weighed sizes would add up the same', () => {
        const { store, frame } = framed();
        const first = loaded(store, 'first', 128);
        const second = loaded(store, 'second', 128);
        let told = 0;
        onAssetsChanged(store, () => { told++; });
        first.width = 256;
        second.width = 64;
        frame();
        expect(told).toBe(1);
    });

    it('tells no listener after the one that ended the game, of the scenes or of the files', () => {
        for (const listen of [onScenesChanged, onAssetsChanged]) {
            const { store, frame } = framed();
            const told: string[] = [];
            listen(store, () => { told.push('first'); store.setState('loop', { destroyed: true }); });
            listen(store, () => { told.push('second'); });
            loaded(store, 'hero');
            startTestScene(store, 'Level', asking('hero'));
            frame();
            expect(told).toEqual(['first']);
        }
    });

    it('counts the room a shape that shrank still takes on the card', () => {
        const { store } = createTestGame();
        const triangles = (count: number) => ({ positions: Array.from({ length: count * 9 }, (_, i) => (i % 3 === 0 ? i : 0)) });
        let shape!: TGeometry;
        startTestScene(store, 'Level', () => { shape = createGeometry(triangles(1)); return createScene(); });
        const small = assetOf(store, shape.key)!.bytes!;
        updateGeometry(shape, triangles(100));
        const grown = assetOf(store, shape.key)!.bytes!;
        updateGeometry(shape, triangles(1));

        expect(grown).toBeGreaterThan(small * 50);
        expect(assetOf(store, shape.key)!.bytes).toBe(grown);
    });

    it('keeps who asked for a file when its body threw, a system\'s or a scene\'s', () => {
        const { store } = createTestGame();
        const error = spyOn(console, 'error').mockImplementation(() => {});
        loaded(store, 'beep');
        loaded(store, 'hero');
        removals.push(registerGameSystem('test-inspect-thrower', () => {
            useLoadTexture({ src: '/beep.png', key: 'beep' });
            throw new Error('not today');
        }));
        startGameSystems(store);
        withSystems.push(store);
        registerScene(store, 'Broken', () => { useLoadTexture({ src: '/hero.png', key: 'hero' }); throw new Error('nor this'); });
        expect(() => startScene(store, 'Broken')).toThrow('nor this');

        // Or one that broke after its body: one that forgot to end with createScene.
        loaded(store, 'far');
        registerScene(store, 'Unfinished', (() => { useLoadTexture({ src: '/far.png', key: 'far' }); }) as never);
        expect(() => startScene(store, 'Unfinished')).toThrow('createScene');

        expect(assetOf(store, 'beep')!.askedBy).toEqual(['test-inspect-thrower']);
        expect(assetOf(store, 'hero')!.askedBy).toEqual(['Broken']);
        expect(assetOf(store, 'far')!.askedBy).toEqual(['Unfinished']);
        error.mockRestore();
    });
});

describe('the two listeners', () => {
    it('keep no stopped scene in memory, while listening', () => {
        const { store, frame } = framed();
        const roots: WeakRef<object>[] = [];
        onScenesChanged(store, () => {});
        for (let i = 0; i < 8; i++) {
            roots.push(new WeakRef(startTestScene(store, `Kept${i}`, () => createScene())));
            frame();
            stopScene(store, `Kept${i}`);
            frame();
        }
        Bun.gc(true);

        expect(roots.filter((root) => root.deref() !== undefined).length).toBeLessThan(4);
    });

    it('keep no scene in memory that was running when the last listener stopped', () => {
        const { store, frame } = framed();
        const stop = onScenesChanged(store, () => {});
        // Seen while listened to: what the listeners last saw has it in it.
        const seen = (() => new WeakRef(startTestScene(store, 'Seen', () => createScene())))();
        frame();
        stop();
        stopScene(store, 'Seen');
        for (let i = 0; i < 3; i++) frame();
        Bun.gc(true);

        expect(seen.deref()).toBeUndefined();
    });

    it('tell nothing of the splash leaving: it is not one of the game\'s scenes', () => {
        const { store, frame } = framed();
        const splash = startTestScene(store, SPLASH_SCENE, () => createScene());
        setSplash(store, splash);
        startTestScene(store, 'Level', () => createScene());
        let told = 0;
        onScenesChanged(store, () => { told++; });
        stopScene(store, splash);
        clearSplash(store);
        frame();

        expect(told).toBe(0);
    });

    it('do not tell a listener taken off by an earlier one in the same frame', () => {
        const { store, frame } = framed();
        const told: string[] = [];
        let second = () => {};
        onScenesChanged(store, () => { told.push('first'); second(); });
        second = onScenesChanged(store, () => { told.push('second'); });
        startTestScene(store, 'Level', () => createScene());
        frame();

        expect(told).toEqual(['first']);
    });

    it('tell nothing of a game ended while it was drawn', () => {
        const { store, renderer, frame } = framed();
        let told = 0;
        onScenesChanged(store, () => { told++; });
        renderer.frame = () => { store.setState('loop', { destroyed: true }); };
        startTestScene(store, 'Level', () => createScene());
        frame();

        expect(told).toBe(0);
    });

    it('tell what changed in a frame whose drawing threw', () => {
        const { store, renderer, frame } = framed();
        let told = 0;
        onScenesChanged(store, () => { told++; });
        renderer.frame = () => { throw new Error('no card'); };
        startTestScene(store, 'Level', () => createScene());

        expect(() => frame()).toThrow('no card');
        expect(told).toBe(1);
    });

    it('tell every listener when one throws, and say it', () => {
        const { store, frame } = framed();
        const error = spyOn(console, 'error').mockImplementation(() => {});
        const told: string[] = [];
        onScenesChanged(store, () => { throw new Error('mine'); });
        onScenesChanged(store, () => { told.push('second'); });
        startTestScene(store, 'Level', () => createScene());
        frame();

        expect(told).toEqual(['second']);
        expect(String(error.mock.calls[0]?.[0])).toContain('onScenesChanged');
        error.mockRestore();
    });

    it('let a listener stop listening while told, and look at the game', () => {
        const { store, frame } = framed();
        const seen: string[][] = [];
        const stop = onScenesChanged(store, () => {
            seen.push(inspectGame(store).scenes.map((scene) => scene.name));
            stop();
        });
        startTestScene(store, 'Level', () => createScene());
        frame();
        startTestScene(store, 'Hud', () => createScene());
        frame();

        expect(seen).toEqual([['Level']]);
    });

    it('keep two games on a page apart', () => {
        const one = framed();
        const two = framed();
        let toldTwo = 0;
        onScenesChanged(two.store, () => { toldTwo++; });
        startTestScene(one.store, 'Level', () => createScene());
        one.frame();
        two.frame();

        expect(toldTwo).toBe(0);
    });

    it('tell nothing once the game has ended', () => {
        const { store, frame } = framed();
        let told = 0;
        onScenesChanged(store, () => { told++; });
        onAssetsChanged(store, () => { told++; });
        startTestScene(store, 'Level', () => createScene());
        loaded(store, 'hero');
        store.setState('loop', { destroyed: true });
        frame();

        expect(told).toBe(0);
    });

    it('tell those listening to the files nothing once one told of the scenes ended the game', () => {
        const { store, frame } = framed();
        let told = 0;
        onScenesChanged(store, () => { store.setState('loop', { destroyed: true }); });
        onAssetsChanged(store, () => { told++; });
        startTestScene(store, 'Level', () => createScene());
        loaded(store, 'hero');
        frame();

        expect(told).toBe(0);
    });

    it('work in a headless game, told of a scene a running one launched', () => {
        let store!: TRuntimeStore;
        let told = 0;
        let frames = 0;
        const game = createHeadlessGame({
            width: 8, height: 8, scenes: {
                Level: () => {
                    store = getActiveGame()!;
                    const scene = useScene();
                    useUpdate(() => {
                        if (++frames === 3) scene.launch('Hud');
                    });
                    return createScene();
                },
                Hud: () => createScene(),
            },
            initialScene: 'Level',
        });
        games.push(game);
        onScenesChanged(store, () => { told++; });
        game.run(2);
        expect(told).toBe(0);
        game.run(2);
        expect(told).toBe(1);
        expect(states(store)).toEqual([['Level', 'running'], ['Hud', 'running']]);
    });
});
