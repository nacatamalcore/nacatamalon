import { afterEach, beforeEach, describe, expect, it, spyOn } from 'bun:test';
import { createScene } from '../src/scene/create_scene';
import { useLoadPack } from '../src/hooks/loaders/use_load_pack';
import { rootOf } from '../src/box';
import { createPack } from '../src/gameobjects/pack';
import { useEvent } from '../src/hooks/events/use_event';
import { whenLoaded } from '../src/loaders/track_load';
import { clearScripts, registerScript } from '../src/scripts/script_registry';
import { createTestGame, startTestScene } from './helpers/test_game';
import type { TLoadedPack } from '../src/loaders/pack';
import type { TBox } from '../src/box';

const tint = { r: 1, g: 1, b: 1, a: 1 };
const NOWHERE = { x: 0, y: 0, z: 0, rotation: 0, rotationX: 0, rotationY: 0, scaleX: 1, scaleY: 1, scaleZ: 1 };

/**
 * A box file the way the editor saves one: its box is the only child of a container root.
 */
const boxFile = (name: string, components: unknown[], assets: unknown[] = []) => ({
    format: 'nacatamal-box',
    version: 2,
    box: {
        format: 'nacatamalon-scene',
        version: 1,
        name,
        assets,
        root: { id: `${name}-container`, name, transform: null, components: [], children: [{ id: name, name, transform: { ...NOWHERE }, components, children: [] }] },
    },
});

/**
 * An installed pack, as the import leaves it: its documents' paths start with `packs/<name>/`.
 */
const SIGNS = {
    'pack.json': {
        format: 'nacatamalon-pack',
        version: 1,
        name: 'signs',
        packVersion: '2.0.0',
        exports: { boxes: ['Signpost', 'Arrow'], scenes: [] },
        files: ['boxes/Signpost.box', 'boxes/Arrow.box', 'assets/sign.png'],
        requires: { actions: [{ name: 'talk', bindings: [{ type: 'key', key: 'e' }] }] },
    },
    'boxes/Signpost.box': boxFile('Signpost', [
        { type: 'sprite', id: 'face', texture: 'packs/signs/assets/sign.png', width: 16, height: 16, tint },
        { type: 'script', id: 'talk', ref: 'sign_talk', props: { bob: 3, label: 'HI' } },
    ], [{ type: 'texture', key: 'packs/signs/assets/sign.png', src: 'packs/signs/assets/sign.png' }]),
    'boxes/Arrow.box': boxFile('Arrow', [{ type: 'sprite', id: 'shaft', texture: null, width: 20, height: 4, tint }]),
};

let fetchSpy: ReturnType<typeof spyOn> | null = null;
let asked: string[] = [];

/**
 * Serves `files` under `/packs/<folder>/`, and a 1x1 picture for any `.png`.
 */
const serve = (folder: string, files: Record<string, unknown>): void => {
    asked = [];
    Object.assign(globalThis, {
        createImageBitmap: async () => ({ width: 1, height: 1, close: () => {} }),
        location: { href: 'http://nacatamalon.local/' },
    });
    fetchSpy = spyOn(globalThis, 'fetch').mockImplementation((async (input: string) => {
        const url = String(input);
        asked.push(url);
        const path = url.replace(`/packs/${folder}/`, '');
        if (url.endsWith('.png')) return { ok: true, blob: async () => new Blob(['png']) };
        if (path in files) return { ok: true, json: async () => structuredClone(files[path]) };
        return { ok: false, status: 404 };
    }) as unknown as typeof fetch);
};

let warn: ReturnType<typeof spyOn>;
beforeEach(() => {
    warn = spyOn(console, 'warn').mockImplementation(() => {});
    clearScripts();
});
afterEach(() => {
    fetchSpy?.mockRestore();
    fetchSpy = null;
    warn.mockRestore();
    clearScripts();
});

const said = (): string => warn.mock.calls.map((call: unknown[]) => String(call[0])).join('\n');

describe('useLoadPack', () => {
    it('refuses to be called outside a scene body', () => {
        expect(() => useLoadPack({ src: '/packs/signs' })).toThrow('[NacatamalOn] useLoadPack');
    });

    it('hands back the pack at once, and fills in what it offers when it lands', async () => {
        serve('signs', SIGNS);
        const { store } = createTestGame();
        let pack!: TLoadedPack;
        const root = startTestScene(store, 'Level', () => {
            pack = useLoadPack({ src: '/packs/signs' });
            return createScene();
        });

        expect(pack.status).toBe('loading');
        expect(pack.src).toBe('/packs/signs/');
        // Counted with the scene's other loads, which is what `useLoader` reads.
        expect(rootOf(root).loads).toContain(pack);

        await whenLoaded(pack);

        expect(pack.status).toBe('ready');
        expect(pack.name).toBe('signs');
        expect(pack.version).toBe('2.0.0');
        expect(pack.exports).toEqual({ boxes: ['Signpost', 'Arrow'], scenes: [] });
        // The box file's container is dropped: the box itself is what a copy is made of.
        expect(pack.boxes.Signpost!.root.name).toBe('Signpost');
    });

    it("finds the documents' pictures inside the pack's folder, wherever it is served", async () => {
        serve('shop', { ...SIGNS, 'pack.json': { ...SIGNS['pack.json'] } });
        const { store } = createTestGame();
        let pack!: TLoadedPack;
        startTestScene(store, 'Level', () => {
            pack = useLoadPack({ src: '/packs/shop/' });
            return createScene();
        });
        await whenLoaded(pack);

        // Installed as `packs/signs/…`, served from `/packs/shop/`: the prefix goes, the folder stays.
        const asset = pack.boxes.Signpost!.assets[0]!;
        expect(asset.type === 'texture' && asset.src).toBe('/packs/shop/assets/sign.png');
        // The key is left alone, so the sprite that names it still finds it.
        expect(asset.key).toBe('packs/signs/assets/sign.png');
    });

    it('reads a pack once however many scenes ask for it', async () => {
        serve('signs', SIGNS);
        const { store } = createTestGame();
        const packs: TLoadedPack[] = [];
        startTestScene(store, 'A', () => {
            packs.push(useLoadPack({ src: '/packs/signs' }));
            packs.push(useLoadPack({ src: '/packs/signs/' }));
            return createScene();
        });
        await whenLoaded(packs[0]!);

        expect(packs[0]).toBe(packs[1]!);
        expect(asked.filter((url) => url.endsWith('pack.json'))).toHaveLength(1);
    });

    it('adds the actions it needs to the game, and never changes one the game has', async () => {
        serve('signs', {
            ...SIGNS,
            'pack.json': { ...SIGNS['pack.json'], requires: { actions: [{ name: 'talk', bindings: [{ type: 'key', key: 'e' }] }, { name: 'jump', bindings: [{ type: 'key', key: 'x' }] }] } },
        });
        const { store } = createTestGame({ actions: [{ name: 'jump', bindings: [{ type: 'key', key: ' ' }] }] });
        let pack!: TLoadedPack;
        startTestScene(store, 'Level', () => {
            pack = useLoadPack({ src: '/packs/signs' });
            return createScene();
        });
        await whenLoaded(pack);

        const { defs } = store.get('input').actions;
        expect(defs.map((d) => d.name)).toEqual(['jump', 'talk']);
        expect(defs.find((d) => d.name === 'jump')!.bindings).toEqual([{ type: 'key', key: ' ' }]);
    });

    it('ends as an error, and says so, when there is no pack there', async () => {
        serve('signs', {});
        const { store } = createTestGame();
        let pack!: TLoadedPack;
        startTestScene(store, 'Level', () => {
            pack = useLoadPack({ src: '/packs/nothing' });
            return createScene();
        });
        await whenLoaded(pack);

        expect(pack.status).toBe('error');
        expect(said()).toContain("'/packs/nothing/' could not be loaded");
    });
});

describe('createPack', () => {
    /**
     * A scene placing whatever `body` asks for, run until the pack has landed.
     */
    const placed = async (body: (pack: TLoadedPack) => void): Promise<{ root: TBox; pack: TLoadedPack; store: ReturnType<typeof createTestGame>['store'] }> => {
        serve('signs', SIGNS);
        const { store } = createTestGame();
        let pack!: TLoadedPack;
        const root = startTestScene(store, 'Level', () => {
            pack = useLoadPack({ src: '/packs/signs' });
            body(pack);
            return createScene();
        });
        await whenLoaded(pack);
        // `createPack` builds on the same landing, a tick after it.
        await Promise.resolve();
        return { root, pack, store };
    };

    it('hands back the copy at once, and builds the box inside it when the pack lands', async () => {
        let copy!: TBox;
        const { root } = await placed((pack) => {
            copy = createPack({ pack, box: 'Arrow', transform: { x: 40, y: 50 } });
            expect(copy.children).toHaveLength(0);
        });

        expect(root.children).toContain(copy);
        expect([copy.transform!.x, copy.transform!.y]).toEqual([40, 50]);
        expect(copy.children).toHaveLength(1);
        expect(copy.children[0]!.name).toBe('Arrow');
        expect(copy.children[0]!.drawables).toHaveLength(1);
    });

    it('makes each call its own copy, with its own settings laid over the pack\'s', async () => {
        const seen: Record<string, unknown>[] = [];
        registerScript('sign_talk', (_self, props) => { seen.push({ ...props }); });
        const copies: TBox[] = [];
        await placed((pack) => {
            copies.push(createPack({ pack, box: 'Signpost' }));
            copies.push(createPack({ pack, box: 'Signpost', props: { bob: 8 } }));
        });

        expect(seen).toEqual([{ bob: 3, label: 'HI' }, { bob: 8, label: 'HI' }]);
        // Two copies are two objects, with ids of their own.
        expect(copies[0]!.children[0]!.id).not.toBe(copies[1]!.children[0]!.id);
    });

    it('builds straight away when the pack is already here', async () => {
        const { store } = await placed(() => {});
        let copy!: TBox;
        startTestScene(store, 'Other', () => {
            copy = createPack({ pack: useLoadPack({ src: '/packs/signs' }), box: 'Arrow' });
            return createScene();
        });
        expect(copy.children.map((child) => child.name)).toEqual(['Arrow']);
    });

    it("hears what a copy tells it through on, connected before the pack even landed", async () => {
        registerScript('sign_talk', (_self, props) => {
            const said = useEvent<string>('said');
            said(String(props.label));
        });
        const heard: string[] = [];
        await placed((pack) => {
            createPack({ pack, box: 'Signpost', on: { said: (label) => heard.push(`one: ${String(label)}`) } });
            createPack({ pack, box: 'Signpost', props: { label: 'BYE' }, on: { said: (label) => heard.push(`two: ${String(label)}`) } });
        });

        // Each copy hears its own, with its own settings.
        expect(heard).toEqual(['one: HI', 'two: BYE']);
    });

    it('names a script nothing registered, and tells you what to import', async () => {
        await placed((pack) => { createPack({ pack, box: 'Signpost' }); });
        expect(said()).toContain('"sign_talk", which nothing has registered');
        expect(said()).toContain('signs.pack.ts');
    });

    it('asks which, listing what the pack offers, when it offers more than one and none is named', async () => {
        let copy!: TBox;
        await placed((pack) => { copy = createPack({ pack }); });
        expect(copy.children).toHaveLength(0);
        expect(said()).toContain('offers 2 things (Signpost, Arrow); say which with box or scene');
    });

    it('says what it offers when the name is not one of them', async () => {
        await placed((pack) => { createPack({ pack, box: 'Bench' }); });
        expect(said()).toContain('offers no box "Bench". It offers box "Signpost", box "Arrow"');
    });
});
