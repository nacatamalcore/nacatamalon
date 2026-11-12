import { afterEach, describe, expect, it, spyOn } from 'bun:test';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHeadlessGame } from '../src/headless';
import { createScene } from '../src/scene/create_scene';
import { useLoadTexture } from '../src/hooks/loaders/use_load_texture';
import { useLoadAudio } from '../src/hooks/loaders/use_load_audio';
import { encodePng } from '../src/authoring';
import { pixelsFromRows } from '../src/pixels';
import { registerAssetType, registerPostEffect } from '../src/extend';
import { releaseAsset, releaseLeftBehind, stopHolding } from '../src/loaders/release_asset';
import { getActiveGame } from '../src/store';
import { parseSceneDoc, sceneFromDoc, serializeScene } from '../src/scene/document';
import { POST_BUILTINS, allPostEffects, findPostBuiltin } from '../src/post';
import { effectFromEntry } from '../src/post/install_post_chain';
import { createTestGame, startTestScene } from './helpers/test_game';
import type { THeadlessGame } from '../src/headless';
import type { TPluginAsset } from '../src/extend';
import type { TAudioClip, TTexture } from '../src/loaders';
import type { TRuntimeStore } from '../src/store';

// A kind of file a plugin teaches the engine: fetched and read by the engine, made into what the game
// uses by the plugin, with what it names loaded next to it, and let go of like the engine's own.

const folders: string[] = [];
const games: THeadlessGame[] = [];
afterEach(() => {
    while (games.length > 0) games.pop()!.destroy();
    while (folders.length > 0) rmSync(folders.pop()!, { recursive: true, force: true });
});

const RED = { r: '#ff0000' };

/** A folder for a game's files, with `files` written into it (a string is text, pixels a PNG). */
const filesIn = (files: Record<string, string | Uint8Array>): string => {
    const folder = mkdtempSync(join(tmpdir(), 'nacatamalon-plugin-assets-'));
    folders.push(folder);
    for (const [path, content] of Object.entries(files)) {
        const at = join(folder, path);
        mkdirSync(join(at, '..'), { recursive: true });
        writeFileSync(at, content);
    }
    return folder;
};

const PNG = encodePng(pixelsFromRows(['r'], RED));

/** A game over `folder` whose one scene runs `body`. */
const gameOver = (folder: string, body: () => void): THeadlessGame => {
    const game = createHeadlessGame({ width: 8, height: 8, assets: folder, scenes: { Level: () => { body(); return createScene(); } } });
    games.push(game);
    return game;
};

let kinds = 0;
/** A kind name of its own for each test: the kinds live as long as the page. */
const kindName = (what: string): string => `test-${what}-${kinds++}`;

describe('registerAssetType', () => {
    it('loads a file the engine reads and the plugin makes something of, with the picture it names', async () => {
        type TRig = { bones: string[]; picture: TTexture };
        const rigs = registerAssetType<TRig>({
            kind: kindName('rig'),
            read: 'json',
            parse: (json, help) => {
                const doc = json as { bones: string[]; picture: string };
                return { bones: doc.bones, picture: help.texture(doc.picture) };
            },
        });
        const folder = filesIn({ 'rigs/hero.rig.json': JSON.stringify({ bones: ['hip', 'knee'], picture: 'hero.png' }), 'rigs/hero.png': PNG });
        let rig!: TPluginAsset<TRig>;
        const game = gameOver(folder, () => { rig = rigs.useLoad({ src: '/rigs/hero.rig.json' }); });
        expect(rig.status).toBe('loading');
        await game.loaded();

        expect(rig.status).toBe('ready');
        expect(rig.data!.bones).toEqual(['hip', 'knee']);
        // Read next to the file, and arrived before the file was called ready.
        expect(rig.data!.picture.src).toBe('/rigs/hero.png');
        expect(rig.data!.picture.status).toBe('ready');
    });

    it('reads a file as text or as bytes when the kind says so', async () => {
        const words = registerAssetType<string>({ kind: kindName('words'), read: 'text', parse: (text) => (text as string).toUpperCase() });
        const blob = registerAssetType<number>({ kind: kindName('blob'), read: 'bytes', parse: (bytes) => (bytes as ArrayBuffer).byteLength });
        const folder = filesIn({ 'a.txt': 'hola', 'b.bin': new Uint8Array([1, 2, 3]) });
        let text!: TPluginAsset<string>;
        let bytes!: TPluginAsset<number>;
        const game = gameOver(folder, () => {
            text = words.useLoad({ src: '/a.txt' });
            bytes = blob.useLoad({ src: '/b.bin' });
        });
        await game.loaded();
        expect(text.data).toBe('HOLA');
        expect(bytes.data).toBe(3);
    });

    it('a file its kind cannot read ends in error, said in the kind\'s name, and the game goes on', async () => {
        const warn = spyOn(console, 'warn').mockImplementation(() => {});
        const strict = registerAssetType({ kind: kindName('strict'), read: 'json', parse: () => { throw new Error('not one of mine'); } });
        const folder = filesIn({ 'x.json': '{}' });
        let file!: TPluginAsset;
        const game = gameOver(folder, () => { file = strict.useLoad({ src: '/x.json' }); });
        await game.loaded();
        expect(file.status).toBe('error');
        expect(file.data).toBeNull();
        expect(String(warn.mock.calls[0]?.[0])).toContain(`${strict.kind}: '/x.json' could not be loaded`);
        warn.mockRestore();
    });

    it('takes the same definition twice, refuses another under its name, and a way of reading it does not know', () => {
        const definition = { kind: kindName('twice'), read: 'json' as const, parse: () => 1 };
        const first = registerAssetType(definition);
        expect(registerAssetType(definition)).toBe(first);
        expect(() => registerAssetType({ ...definition })).toThrow(/already registered with another definition/);
        expect(() => registerAssetType({ kind: kindName('odd'), read: 'xml' as never, parse: () => 1 })).toThrow(/read as 'xml'/);
    });

    it('a file names one of another kind, loaded next to it and waited for', async () => {
        const inner = registerAssetType<string>({ kind: kindName('inner'), read: 'text', parse: (text) => text as string });
        const outer = registerAssetType<TPluginAsset<string>>({
            kind: kindName('outer'),
            read: 'json',
            parse: (json, help) => help.asset<string>(inner.kind, (json as { part: string }).part),
        });
        const folder = filesIn({ 'set/outer.json': JSON.stringify({ part: 'inner.txt' }), 'set/inner.txt': 'the part' });
        let file!: TPluginAsset<TPluginAsset<string>>;
        const game = gameOver(folder, () => { file = outer.useLoad({ src: '/set/outer.json' }); });
        await game.loaded();
        expect(file.status).toBe('ready');
        expect(file.data!.status).toBe('ready');
        expect(file.data!.data).toBe('the part');
    });

    it('a file that names itself ends in error instead of waiting for ever', async () => {
        const warn = spyOn(console, 'warn').mockImplementation(() => {});
        let kind = '';
        const loop = registerAssetType({ kind: kind = kindName('loop'), read: 'json', parse: (_json, help) => help.asset(kind, 'self.json') });
        const folder = filesIn({ 'self.json': '{}' });
        let file!: TPluginAsset;
        const game = gameOver(folder, () => { file = loop.useLoad({ src: '/self.json' }); });
        await game.loaded();
        expect(file.status).toBe('error');
        warn.mockRestore();
    });

    it('let go of, it lets go of what it made and of the picture only it held; one the game loaded too stays', async () => {
        const released: string[] = [];
        const sheets = registerAssetType<{ name: string; picture: TTexture }>({
            kind: kindName('sheet'),
            read: 'json',
            parse: (json, help) => ({ name: (json as { name: string }).name, picture: help.texture((json as { picture: string }).picture) }),
            release: (data) => { released.push(data.name); },
        });
        const folder = filesIn({
            'a.json': JSON.stringify({ name: 'a', picture: 'a.png' }),
            'b.json': JSON.stringify({ name: 'b', picture: 'b.png' }),
            'a.png': PNG,
            'b.png': PNG,
        });
        let a!: TPluginAsset<{ name: string; picture: TTexture }>;
        let b!: TPluginAsset<{ name: string; picture: TTexture }>;
        let store!: TRuntimeStore;
        const game = gameOver(folder, () => {
            store = getActiveGame()!;
            a = sheets.useLoad({ src: '/a.json' });
            b = sheets.useLoad({ src: '/b.json' });
            useLoadTexture({ src: '/b.png' });
        });
        await game.loaded();
        const pictureA = a.data!.picture;
        const pictureB = b.data!.picture;

        expect(releaseAsset(store, a)).toBe(true);
        expect(releaseAsset(store, b)).toBe(true);
        expect(released).toEqual(['a', 'b']);
        expect(a.status).toBe('released');
        expect(a.data).toBeNull();
        expect(store.get('assets').pluginAssets.size).toBe(0);
        // Only the file held the first picture; the game asked for the second itself.
        expect(pictureA.status).toBe('released');
        expect(pictureB.status).toBe('ready');
    });

    it('a file another one asked for stays, though the game lets go of it, until that one goes too', async () => {
        const released: string[] = [];
        const parts = registerAssetType<string>({ kind: kindName('part'), read: 'text', parse: (text) => text as string, release: (text) => { released.push(text); } });
        const wholes = registerAssetType<TPluginAsset<string>>({
            kind: kindName('whole'), read: 'json', parse: (json, help) => help.asset<string>(parts.kind, (json as { part: string }).part),
        });
        const folder = filesIn({ 'whole.json': JSON.stringify({ part: 'part.txt' }), 'part.txt': 'P' });
        let whole!: TPluginAsset<TPluginAsset<string>>;
        let part!: TPluginAsset<string>;
        let store!: TRuntimeStore;
        const game = gameOver(folder, () => {
            store = getActiveGame()!;
            whole = wholes.useLoad({ src: '/whole.json' });
            part = parts.useLoad({ src: '/part.txt' });
        });
        await game.loaded();
        expect(whole.data).toBe(part);

        releaseAsset(store, part);
        expect(part.status).toBe('ready');
        expect(released).toEqual([]);
        releaseAsset(store, whole);
        expect(part.status).toBe('released');
        expect(released).toEqual(['P']);
    });

    it('a sound the game loaded stays when a file that asked for the same one goes', async () => {
        const cues = registerAssetType<TAudioClip>({ kind: kindName('cue'), read: 'json', parse: (json, help) => help.audio((json as { sound: string }).sound) });
        const folder = filesIn({ 'cue.json': JSON.stringify({ sound: 'hit.wav' }), 'hit.wav': new Uint8Array(64) });
        let cue!: TPluginAsset<TAudioClip>;
        let clip!: TAudioClip;
        let store!: TRuntimeStore;
        const game = gameOver(folder, () => {
            store = getActiveGame()!;
            clip = useLoadAudio({ src: '/hit.wav' });
            cue = cues.useLoad({ src: '/cue.json' });
        });
        await game.loaded();
        expect(cue.data).toBe(clip);
        releaseAsset(store, cue);
        expect(clip.status).not.toBe('released');
        expect(store.get('assets').sounds.size).toBe(1);
        // And once the game lets go of it, nothing else holds it.
        releaseAsset(store, clip);
        expect(clip.status).toBe('released');
    });

    it('two files that name each other, both loaded by the game, end instead of waiting for ever', async () => {
        const warn = spyOn(console, 'warn').mockImplementation(() => {});
        let kind = '';
        const pair = registerAssetType({ kind: kind = kindName('pair'), read: 'json', parse: (json, help) => help.asset(kind, (json as { other: string }).other) });
        const folder = filesIn({ 'a.json': JSON.stringify({ other: 'b.json' }), 'b.json': JSON.stringify({ other: 'a.json' }) });
        let a!: TPluginAsset;
        let b!: TPluginAsset;
        const game = gameOver(folder, () => {
            a = pair.useLoad({ src: '/a.json' });
            b = pair.useLoad({ src: '/b.json' });
        });
        await game.loaded();
        // One of them is told it waits for the other; the other then finishes.
        expect([a.status, b.status].sort()).toEqual(['error', 'ready']);
        warn.mockRestore();
    });

    it('let go of while its parse is still at it, asks for nothing more in its name', async () => {
        let resume!: () => void;
        const paused = new Promise<void>((resolve) => { resume = resolve; });
        const slow = registerAssetType({
            kind: kindName('slow'), read: 'json',
            parse: async (_json, help) => { await paused; return help.texture('late.png'); },
        });
        const folder = filesIn({ 'slow.json': '{}', 'late.png': PNG });
        let file!: TPluginAsset;
        let store!: TRuntimeStore;
        gameOver(folder, () => { store = getActiveGame()!; file = slow.useLoad({ src: '/slow.json' }); });
        // Let the fetch and the read land, so parse is waiting.
        for (let i = 0; i < 20 && store.get('assets').textures.size === 0 && file.status === 'loading'; i++) await new Promise((r) => setTimeout(r, 5));
        releaseAsset(store, file);
        resume();
        await new Promise((r) => setTimeout(r, 20));
        expect(file.status).toBe('released');
        expect([...store.get('assets').textures.values()].some((texture) => texture.src === '/late.png')).toBe(false);
    });

    it('a game destroyed while a parse is at it says nothing of a failure', async () => {
        const warn = spyOn(console, 'warn').mockImplementation(() => {});
        let resume!: () => void;
        const paused = new Promise<void>((resolve) => { resume = resolve; });
        let reading = false;
        const slow = registerAssetType({
            kind: kindName('outlived'), read: 'json',
            parse: async (_json, help) => { reading = true; await paused; return help.texture('late.png'); },
        });
        const folder = filesIn({ 'slow.json': '{}', 'late.png': PNG });
        let file!: TPluginAsset;
        const game = createHeadlessGame({ width: 8, height: 8, assets: folder, scenes: { Level: () => { file = slow.useLoad({ src: '/slow.json' }); return createScene(); } } });
        for (let i = 0; i < 40 && !reading; i++) await new Promise((r) => setTimeout(r, 5));
        expect(reading).toBe(true);
        game.destroy();
        resume();
        await new Promise((r) => setTimeout(r, 20));
        expect(file.status).not.toBe('error');
        expect(warn.mock.calls.filter((call) => String(call[0]).includes('could not be loaded'))).toEqual([]);
        warn.mockRestore();
    });

    it('a file that failed after asking for a picture does not keep the game from letting go of it', async () => {
        const warn = spyOn(console, 'warn').mockImplementation(() => {});
        const broken = registerAssetType({
            kind: kindName('broken'), read: 'json',
            parse: (_json, help) => { help.texture('shared.png'); throw new Error('broken after asking'); },
        });
        const folder = filesIn({ 'broken.json': '{}', 'shared.png': PNG });
        let file!: TPluginAsset;
        let picture!: TTexture;
        let store!: TRuntimeStore;
        const game = gameOver(folder, () => {
            store = getActiveGame()!;
            file = broken.useLoad({ src: '/broken.json' });
            picture = useLoadTexture({ src: '/shared.png' });
        });
        await game.loaded();
        expect(file.status).toBe('error');
        releaseAsset(store, picture);
        expect(picture.status).toBe('released');
        warn.mockRestore();
    });

    it('taken out by the editor to load afresh, its kind lets go of what it made', async () => {
        const released: string[] = [];
        const notes = registerAssetType<string>({ kind: kindName('reload'), read: 'text', parse: (text) => text as string, release: (text) => { released.push(text); } });
        const folder = filesIn({ 'n.txt': 'note' });
        let file!: TPluginAsset<string>;
        let store!: TRuntimeStore;
        const game = gameOver(folder, () => { store = getActiveGame()!; file = notes.useLoad({ src: '/n.txt' }); });
        await game.loaded();
        stopHolding(file);
        expect(releaseLeftBehind(store, file)).toBe(true);
        expect(released).toEqual(['note']);
        expect(file.status).toBe('released');
    });

    it('one key names one file, whatever its kind', () => {
        const one = registerAssetType({ kind: kindName('one'), read: 'text', parse: (text) => text });
        const two = registerAssetType({ kind: kindName('two'), read: 'text', parse: (text) => text });
        const folder = filesIn({ 'x.txt': 'x' });
        expect(() => gameOver(folder, () => {
            one.useLoad({ src: '/x.txt', key: 'shared' });
            two.useLoad({ src: '/x.txt', key: 'shared' });
        })).toThrow(/already names a/);
    });
});

describe('a plugin\'s file in a scene document', () => {
    const docListing = (kind: string) => parseSceneDoc({
        format: 'nacatamalon-scene', version: 1, name: 'Level',
        assets: [{ type: 'plugin', kind, key: 'hero', src: '/hero.txt' }],
        root: { id: 'root', name: 'Level', transform: null, children: [], components: [] },
    }, 'test');

    it('is loaded with its kind when the scene is built', async () => {
        let loaded: TPluginAsset<string> | undefined;
        const notes = registerAssetType<string>({ kind: kindName('note'), read: 'text', parse: (text) => text as string });
        const doc = docListing(notes.kind);
        expect(doc.assets).toEqual([{ type: 'plugin', kind: notes.kind, key: 'hero', src: '/hero.txt' }]);
        const folder = filesIn({ 'hero.txt': 'a hero' });
        const game = createHeadlessGame({
            width: 8, height: 8, assets: folder,
            scenes: {
                Level: () => {
                    const built = sceneFromDoc(doc, 'Level')();
                    loaded = getActiveGame()!.get('assets').pluginAssets.get('hero') as TPluginAsset<string>;
                    return built;
                },
            },
        });
        games.push(game);
        await game.loaded();
        expect(loaded?.status).toBe('ready');
        expect(loaded?.data).toBe('a hero');
    });

    it('is kept in the manifest when the scene is saved again, its kind known or not', () => {
        const warn = spyOn(console, 'warn').mockImplementation(() => {});
        const kind = kindName('missing');
        const { store } = createTestGame();
        const root = startTestScene(store, 'Level', sceneFromDoc(docListing(kind), 'Level'));
        // No plugin taught the game this kind: said once, and nothing loaded.
        expect(warn.mock.calls.filter((call) => String(call[0]).includes(`a '${kind}' file`))).toHaveLength(1);
        expect(store.get('assets').pluginAssets.size).toBe(0);
        expect(serializeScene(root).assets).toContainEqual({ type: 'plugin', kind, key: 'hero', src: '/hero.txt' });
        warn.mockRestore();
    });
});

describe('registerPostEffect', () => {
    it('gives a plugin\'s effect a name a chain can use, listed after the engine\'s own', () => {
        const posterize = findPostBuiltin('posterize')!;
        const key = kindName('vhs');
        registerPostEffect({ key, label: 'VHS', description: 'A tape played once too often.', binds: null, fields: [], build: posterize.build });
        // Listed after the engine's own, which stay what they are.
        expect(allPostEffects().at(-1)!.key).toBe(key);
        expect(POST_BUILTINS.some((builtin) => builtin.key === key)).toBe(false);
        expect(findPostBuiltin(key)).not.toBeNull();
        const { store } = createTestGame();
        expect(effectFromEntry(store, { builtin: key }, 'project')).not.toBeNull();
    });

    it('takes the same effect twice, and refuses a name the engine or another plugin has', () => {
        const posterize = findPostBuiltin('posterize')!;
        const info = { key: kindName('crt2'), label: 'CRT 2', description: '…', binds: null, fields: [], build: posterize.build };
        registerPostEffect(info);
        expect(() => registerPostEffect(info)).not.toThrow();
        expect(() => registerPostEffect({ ...info })).toThrow(/another plugin's/);
        expect(() => registerPostEffect({ ...info, key: 'crt' })).toThrow(/the engine's own/);
        expect(() => registerPostEffect({ ...info, key: kindName('x'), formerKeys: ['palette'] })).toThrow(/the engine's own/);
    });
});
