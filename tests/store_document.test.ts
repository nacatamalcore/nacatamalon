import { afterEach, beforeEach, describe, expect, it, spyOn } from 'bun:test';
import { applyStoreDocs, clearGameStores, createGameStore, emptyStoreDoc, getGameStore, listGameStores, parseStoreDoc, resetStores, serializeStoreDoc, storeFieldsFromState, defaultStoreFieldValue } from '../src/game_store';
import { storesRead } from '../src/game_store/store_loads';
import { localStorageAdapter } from '../src/game_store/persistence';
import { STORE_FORMAT } from '../src/game_store';

/**
 * A store as a file, and the index that makes a module singleton visible.
 *
 * **The claim that matters here is about order**, because it is the one that fails in production
 * and nowhere else: the values a file authors may arrive before the code that declares the store
 * (a tool reads a project's stores when it opens it) or after (a packaged game imports them while
 * the modules evaluate). Both directions have to end in the same state, so both are here.
 */

const doc = (over: Record<string, unknown> = {}) => ({
    format: STORE_FORMAT,
    version: 1,
    key: 'pet',
    fields: [
        { name: 'hunger', type: 'number', value: 42 },
        { name: 'name', type: 'string', value: 'Gammix' },
        { name: 'asleep', type: 'boolean', value: true },
    ],
    ...over,
});

let warn: ReturnType<typeof spyOn> | null = null;
const silence = () => {
    warn = spyOn(console, 'warn').mockImplementation(() => {});
    return warn;
};

// Before as well as after: the stores are listed for the whole page, and one another file left
// behind would turn up in these lists, depending on the order the files ran in.
beforeEach(() => {
    clearGameStores();
});

afterEach(() => {
    warn?.mockRestore();
    warn = null;
    clearGameStores();
});

describe('a store as a file', () => {
    it('reads its rows as the kinds they say they are', () => {
        const read = parseStoreDoc({
            format: STORE_FORMAT,
            version: 1,
            key: 'level',
            fields: [
                { name: 'lives', type: 'number', value: 3 },
                { name: 'spawn', type: 'vec2', value: { x: 10, y: 20 } },
                { name: 'up', type: 'vec3', value: { x: 0, y: 1, z: 0 } },
                { name: 'sky', type: 'color', value: { r: 0.1, g: 0.2, b: 0.3, a: 1 } },
            ],
        }, 'stores/level.store');

        expect(read.fields).toEqual([
            { name: 'lives', type: 'number', value: 3 },
            { name: 'spawn', type: 'vec2', value: { x: 10, y: 20 } },
            { name: 'up', type: 'vec3', value: { x: 0, y: 1, z: 0 } },
            { name: 'sky', type: 'color', value: { r: 0.1, g: 0.2, b: 0.3, a: 1 } },
        ]);
    });

    it('opens whatever state the file is in, and says what it left out', () => {
        const said = silence();
        const read = parseStoreDoc({
            key: 'broken',
            fields: [
                { name: 'good', type: 'number', value: 1 },
                { name: 'emptyish', type: 'number' },
                { name: 'later', type: 'quaternion', value: 1 },
                { type: 'number', value: 2 },
                'nonsense',
                { name: 'good', type: 'number', value: 99 },
            ],
        }, 'stores/broken.store');

        // A row with no value is a row, and takes the quietest value of its kind. A row of a kind
        // this version does not know, one with no name and one that is not a row at all are named
        // rather than swallowed, and so is the second `good`: one name is one field, and the first
        // wins, or a file's second half would matter and its first would not.
        expect(read.fields).toEqual([
            { name: 'good', type: 'number', value: 1 },
            { name: 'emptyish', type: 'number', value: 0 },
        ]);
        expect(String(said.mock.calls[0][0])).toContain('broken.store');
    });

    it('fills a row that is missing its value with the quietest thing of its kind', () => {
        const read = parseStoreDoc({ key: 'k', fields: [{ name: 'n', type: 'vec2' }] }, 'k.store');
        expect(read.fields[0].value).toEqual({ x: 0, y: 0 });

        expect(defaultStoreFieldValue('number')).toBe(0);
        expect(defaultStoreFieldValue('string')).toBe('');
        expect(defaultStoreFieldValue('boolean')).toBe(false);
        expect(defaultStoreFieldValue('vec2')).toEqual({ x: 0, y: 0 });
        expect(defaultStoreFieldValue('vec3')).toEqual({ x: 0, y: 0, z: 0 });
        expect(defaultStoreFieldValue('color')).toEqual({ r: 0, g: 0, b: 0, a: 1 });
    });

    it('goes round the whole way without changing', () => {
        applyStoreDocs([parseStoreDoc(doc(), 'stores/pet.store')]);
        const written = serializeStoreDoc(getGameStore('pet')!);

        expect(written).toEqual(parseStoreDoc(doc(), 'stores/pet.store'));
        expect(parseStoreDoc(written, 'stores/pet.store')).toEqual(written);
    });

    it('works out the rows of a state that already exists', () => {
        expect(storeFieldsFromState({
            lives: 3, name: 'x', on: false,
            spawn: { x: 1, y: 2 },
            up: { x: 0, y: 1, z: 0 },
            sky: { r: 1, g: 1, b: 1, a: 1 },
        })).toEqual([
            { name: 'lives', type: 'number', value: 3 },
            { name: 'name', type: 'string', value: 'x' },
            { name: 'on', type: 'boolean', value: false },
            { name: 'spawn', type: 'vec2', value: { x: 1, y: 2 } },
            { name: 'up', type: 'vec3', value: { x: 0, y: 1, z: 0 } },
            { name: 'sky', type: 'color', value: { r: 1, g: 1, b: 1, a: 1 } },
        ]);
    });

    it('leaves out what no row can hold, and says so', () => {
        const said = silence();
        expect(storeFieldsFromState({ lives: 3, inventory: ['ball'] })).toEqual([
            { name: 'lives', type: 'number', value: 3 },
        ]);
        // A list has no row type, so a store with an inventory can be written down as far as the
        // rest of it. Said out loud, because silently losing half a store is the worse outcome.
        expect(String(said.mock.calls[0][0])).toContain('inventory');
    });

    it('reads the throttle in seconds, and a version 1 file in the milliseconds it said', () => {
        const persist = (version: number, throttle: number) =>
            parseStoreDoc({ format: STORE_FORMAT, version, key: 'k', fields: [], persist: { adapter: 'localStorage', throttle } }, 'k.store').persist;
        expect(persist(2, 0.4)?.throttle).toBe(0.4);
        expect(persist(1, 400)?.throttle).toBe(0.4);
    });

    it('opens a new one empty', () => {
        expect(emptyStoreDoc('coins')).toEqual({ format: STORE_FORMAT, version: 2, key: 'coins', fields: [] });
    });
});

describe('the index', () => {
    it('finds a store by name and lists what there is', () => {
        const pet = createGameStore({ key: 'pet', state: { hunger: 70 } });
        createGameStore({ key: 'coins', state: { total: 0 } });

        expect(getGameStore('pet')).toBe(pet as never);
        expect(listGameStores().map((store) => store.key).sort()).toEqual(['coins', 'pet']);
        expect(getGameStore('nothing')).toBeNull();
    });

    it('says when two stores are called the same', () => {
        const said = silence();
        createGameStore({ key: 'pet', state: { hunger: 70 } });
        createGameStore({ key: 'pet', state: { hunger: 10 } });

        // Not merged away: they share a hole to save in, so each would write over the other.
        expect(String(said.mock.calls[0][0])).toContain("'pet'");
    });
});

describe('what a file says and what the code says', () => {
    it('lands over a store that already exists, field by field', () => {
        const pet = createGameStore({ key: 'pet', state: { hunger: 70, happy: 50 } });
        applyStoreDocs([parseStoreDoc(doc(), 'stores/pet.store')]);

        // The file's value wins where it speaks, and the code's stands where it does not.
        expect(pet.state as Record<string, unknown>).toEqual({ hunger: 42, happy: 50, name: 'Gammix', asleep: true });
    });

    it('builds the store outright when no code has declared one', () => {
        applyStoreDocs([parseStoreDoc(doc(), 'stores/pet.store')]);

        const pet = getGameStore('pet');
        expect(pet).not.toBeNull();
        expect(pet!.state).toEqual({ hunger: 42, name: 'Gammix', asleep: true });
    });

    it('ends in the same state whichever of the two arrives first', () => {
        // The order inside a tool: the file, then the code.
        applyStoreDocs([parseStoreDoc(doc(), 'stores/pet.store')]);
        const first = createGameStore({ key: 'pet', state: { hunger: 70, happy: 50 } });
        const fileFirst = { ...first.state };

        clearGameStores();

        // The order inside a packaged game: the code, then the file.
        const second = createGameStore({ key: 'pet', state: { hunger: 70, happy: 50 } });
        applyStoreDocs([parseStoreDoc(doc(), 'stores/pet.store')]);

        expect(second.state as Record<string, unknown>).toEqual(fileFirst);
        expect(second.state as Record<string, unknown>).toEqual({ hunger: 42, happy: 50, name: 'Gammix', asleep: true });
    });

    it('is adopted by the code that was missing, rather than doubled', () => {
        applyStoreDocs([parseStoreDoc(doc(), 'stores/pet.store')]);
        const fromFile = getGameStore('pet')!;
        const live = fromFile.state;

        // Somebody took hold of it in the meantime: a behaviour's link, a panel watching it.
        let told = 0;
        fromFile.subscribe(() => { told += 1; });

        const declared = createGameStore({
            key: 'pet',
            state: { hunger: 70, happy: 50 },
            actions: (set) => ({ feed: () => set((s) => { (s as { hunger: number }).hunger += 1; }) }),
        });

        // The same object, and the same state object inside it.
        expect(declared as never).toBe(fromFile as never);
        expect(declared.state as never).toBe(live as never);
        expect(getGameStore('pet')).toBe(fromFile);
        // With the code's actions on top, and the file's values still over the code's floor.
        expect(declared.state as Record<string, unknown>).toEqual({ hunger: 42, happy: 50, name: 'Gammix', asleep: true });

        // And whoever was already listening still is, which is half the point of adopting. It has
        // already been told once by the adoption itself, which really is a change: the code's floor
        // went down and the file's values came back over it.
        const heard = told;
        declared.actions.feed();
        expect(told).toBe(heard + 1);
        expect(heard).toBeGreaterThan(0);
    });

    it('does not treat a store the code declared as one waiting for it', () => {
        const said = silence();
        createGameStore({ key: 'pet', state: { hunger: 70 } });
        createGameStore({ key: 'pet', state: { hunger: 10 } });

        // The real duplicate-key mistake stays visible instead of being merged into an adoption.
        expect(said).toHaveBeenCalled();
    });
});

describe('starting a game again', () => {
    it('goes back to the code and then the file, in that order', () => {
        const pet = createGameStore({ key: 'pet', state: { hunger: 70, happy: 50 } });
        applyStoreDocs([parseStoreDoc(doc(), 'stores/pet.store')]);

        pet.set((s) => { s.hunger = 1; s.happy = 1; });
        resetStores();

        // Not the code's floor alone, which would be "whatever was hard-coded" rather than the
        // start of a game.
        expect(pet.state as Record<string, unknown>).toEqual({ hunger: 42, happy: 50, name: 'Gammix', asleep: true });
    });
});

describe('what a store saved, loaded with its file', () => {
    const saves = new Map<string, string>();
    const before = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');

    beforeEach(() => {
        clearGameStores();
        saves.clear();
        Object.defineProperty(globalThis, 'localStorage', {
            configurable: true,
            value: { getItem: (key: string) => saves.get(key) ?? null, setItem: (key: string, value: string) => { saves.set(key, value); } },
        });
    });
    afterEach(() => {
        clearGameStores();
        if (before) Object.defineProperty(globalThis, 'localStorage', before);
        else delete (globalThis as { localStorage?: unknown }).localStorage;
    });

    const kept = (mode: 'auto' | 'manual' = 'auto') => parseStoreDoc(doc({ persist: { adapter: 'localStorage', mode } }), 'stores/pet.store');

    it('is there once the promise is done, over the file', async () => {
        saves.set('pet', JSON.stringify({ hunger: 7 }));
        await applyStoreDocs([kept()]);
        expect(getGameStore('pet')!.state).toEqual({ hunger: 7, name: 'Gammix', asleep: true });
    });

    it('with no save, is what the file says', async () => {
        await applyStoreDocs([kept()]);
        expect(getGameStore('pet')!.state.hunger).toBe(42);
    });

    it('is left to the game in manual mode', async () => {
        saves.set('pet', JSON.stringify({ hunger: 7 }));
        await applyStoreDocs([kept('manual')]);
        expect(getGameStore('pet')!.state.hunger).toBe(42);
    });

    it('is loaded by a store the code declared, with its own way of saving', async () => {
        createGameStore({ key: 'pet', state: { hunger: 1 }, persist: { adapter: { load: async () => ({ hunger: 9 }), save: async () => {} } } });
        await applyStoreDocs([parseStoreDoc(doc(), 'stores/pet.store')]);
        expect(getGameStore('pet')!.state.hunger).toBe(9);
    });

    it('outlives the code that declares the store arriving late, progress made since included', async () => {
        saves.set('pet', JSON.stringify({ hunger: 7 }));
        await applyStoreDocs([kept()]);
        const fromFile = getGameStore('pet')!;
        fromFile.set((s) => { s.hunger = 8; });
        // Not saved yet: what is played since the last save is kept too.
        const store = createGameStore({ key: 'pet', state: { hunger: 1 } });
        expect(store.state.hunger).toBe(8);
    });

    it('is read by a store whose code, arriving late, is what saves it', async () => {
        await applyStoreDocs([parseStoreDoc(doc(), 'stores/pet.store')]);
        const store = createGameStore({ key: 'pet', state: { hunger: 1 }, persist: { adapter: { load: async () => ({ hunger: 9 }), save: async () => {} } } });
        await Promise.resolve();
        await Promise.resolve();
        expect(store.state.hunger).toBe(9);
    });

    it('is not written over by a change saved while it is being read', async () => {
        const disk = { coins: 99 };
        let answer!: (saved: object) => void;
        const store = createGameStore({ key: 'pet', state: { coins: 0 }, persist: { throttle: 0.01, adapter: {
            load: () => new Promise<never>((resolve) => { answer = resolve as never; }), save: async (_key, state) => { Object.assign(disk, state); },
        } } });
        store.set((s) => { s.coins = 1; });
        const loaded = store.load();
        await new Promise((resolve) => setTimeout(resolve, 30));
        expect(disk.coins).toBe(99);
        answer({ ...disk });
        await loaded;
        expect(store.state.coins).toBe(99);
    });

    it('is the code\'s, when its code saves it somewhere else than its file said', async () => {
        saves.set('pet', JSON.stringify({ hunger: 7 }));
        await applyStoreDocs([kept()]);
        const store = createGameStore({ key: 'pet', state: { hunger: 1 }, persist: { adapter: { load: async () => ({ hunger: 9 }), save: async () => {} } } });
        await Promise.resolve();
        await Promise.resolve();
        expect(store.state.hunger).toBe(9);
    });

    it('keeps who listens, those gone before the code arrived included', async () => {
        await applyStoreDocs([kept()]);
        const fromFile = getGameStore('pet')!;
        const heard: string[] = [];
        const off = fromFile.subscribe(() => heard.push('first'));
        off();
        fromFile.subscribe(() => heard.push('second'));
        const store = createGameStore({ key: 'pet', state: { hunger: 1 }, persist: { adapter: localStorageAdapter() } });
        heard.length = 0;
        store.set((s) => { s.hunger = 3; });
        expect(heard).toEqual(['second']);
    });

    it('is waited for by a game that starts, and nothing is when nothing is being read', async () => {
        expect(storesRead(1)).toBeNull();
        saves.set('pet', JSON.stringify({ hunger: 7 }));
        void applyStoreDocs([kept()]);
        expect(getGameStore('pet')!.state.hunger).toBe(42);
        await storesRead(1);
        expect(getGameStore('pet')!.state.hunger).toBe(7);
        expect(storesRead(1)).toBeNull();
    });

    it('does not hold the game when it never answers, and is neither put in late nor written over', async () => {
        silence();
        let answer!: (saved: object) => void;
        const written: unknown[] = [];
        createGameStore({ key: 'pet', state: { hunger: 1 }, persist: { throttle: 0.001, adapter: {
            load: () => new Promise<never>((resolve) => { answer = resolve as never; }), save: async (_key, state) => { written.push(state); },
        } } });
        void applyStoreDocs([parseStoreDoc(doc(), 'stores/pet.store')]);
        await storesRead(0.01);
        const store = getGameStore('pet')!;
        store.set((s) => { s.hunger = 2; });
        store.set((s) => { s.hunger = 3; });
        await new Promise((resolve) => setTimeout(resolve, 20));
        expect(store.state.hunger).toBe(3);
        expect(written).toEqual([]);
        // Read when the game asks, though the first never answered, it saves by itself again.
        const again = store.load();
        answer({ hunger: 99 });
        await again;
        expect(store.state.hunger).toBe(99);
        store.set((s) => { s.hunger = 100; });
        await new Promise((resolve) => setTimeout(resolve, 20));
        expect(written.length).toBeGreaterThan(0);
        warn?.mockRestore();
    });

    it('that could not be read is not written over, however often it is tried, until it is read', async () => {
        silence();
        const answers: Array<{ resolve(saved: unknown): void; reject(error: Error): void }> = [];
        const written: unknown[] = [];
        const store = createGameStore({ key: 'pet', state: { coins: 0 }, persist: { throttle: 0.001, adapter: {
            load: () => new Promise<never>((resolve, reject) => { answers.push({ resolve: resolve as never, reject }); }),
            save: async (_key, state) => { written.push({ ...state }); },
        } } });
        const pause = () => new Promise((resolve) => setTimeout(resolve, 15));
        void applyStoreDocs([parseStoreDoc(doc({ fields: [] }), 'stores/pet.store')]);
        await storesRead(0.01);
        const retry = store.load();
        answers[1]!.reject(new Error('offline'));
        expect(await retry).toBe(false);
        store.set((s) => { s.coins = 1; });
        answers[0]!.resolve({ coins: 99 });
        await pause();
        expect(store.state.coins).toBe(1);
        expect(written).toEqual([]);
        const good = store.load();
        answers[2]!.resolve({ coins: 99 });
        expect(await good).toBe(true);
        expect(store.state.coins).toBe(99);
        await pause();
        expect(written.every((one) => (one as { coins: number }).coins === 99)).toBe(true);
        warn?.mockRestore();
    });

    it('asked for by the game while it is being read is the same read', async () => {
        let asked = 0;
        const store = createGameStore({ key: 'pet', state: { hunger: 1 }, persist: { adapter: { load: async () => { asked++; return { hunger: 9 }; }, save: async () => {} } } });
        void applyStoreDocs([parseStoreDoc(doc(), 'stores/pet.store')]);
        expect(await store.load()).toBe(true);
        expect(asked).toBe(1);
        expect(store.state.hunger).toBe(9);
    });

    it('read again somewhere else while a game starts is waited for too', async () => {
        saves.set('pet', JSON.stringify({ hunger: 7 }));
        void applyStoreDocs([kept()]);
        const start = storesRead(1);
        const store = createGameStore({ key: 'pet', state: { hunger: 1 }, persist: { adapter: {
            load: () => new Promise<never>((resolve) => { setTimeout(() => (resolve as (saved: unknown) => void)({ hunger: 99 }), 15); }), save: async () => {},
        } } });
        await start;
        expect(store.state.hunger).toBe(99);
    });

    it('is the game\'s own save when it saves while it is being read', async () => {
        const disk: { coins: number } = { coins: 99 };
        let answer!: (saved: unknown) => void;
        const store = createGameStore({ key: 'pet', state: { coins: 0 }, persist: { throttle: 0.001, adapter: {
            load: () => new Promise<never>((resolve) => { answer = resolve as never; }), save: async (_key, state) => { Object.assign(disk, state); },
        } } });
        const loading = store.load();
        store.set((s) => { s.coins = 1; });
        await store.save();
        answer({ coins: 99 });
        expect(await loading).toBe(false);
        await new Promise((resolve) => setTimeout(resolve, 15));
        expect([store.state.coins, disk.coins]).toEqual([1, 1]);
    });

    it('that is not valid JSON is kept aside, and the store goes on saving', async () => {
        silence();
        saves.set('pet', '{broken');
        await applyStoreDocs([kept()]);
        expect(saves.get('pet.unreadable')).toBe('{broken');
        const store = getGameStore('pet')!;
        store.set((s) => { s.hunger = 5; });
        await store.save();
        expect(JSON.parse(saves.get('pet')!).hunger).toBe(5);
        warn?.mockRestore();
    });

    it('that the browser refuses to read is not written over', async () => {
        silence();
        const adapter = localStorageAdapter();
        Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: { getItem: () => { throw new Error('refused'); }, setItem: (key: string, value: string) => { saves.set(key, value); } } });
        const store = createGameStore({ key: 'pet', state: { hunger: 1 }, persist: { throttle: 0.001, adapter } });
        expect(await store.load()).toBe(false);
        store.set((s) => { s.hunger = 2; });
        await new Promise((resolve) => setTimeout(resolve, 15));
        expect(saves.size).toBe(0);
        warn?.mockRestore();
    });

    it('saved by the game while it was being read holds nobody, and goes on saving by itself', async () => {
        const written: number[] = [];
        const store = createGameStore({ key: 'pet', state: { coins: 0 }, persist: { throttle: 0.001, adapter: {
            load: () => new Promise<never>(() => {}), save: async (_key, state) => { written.push(state.coins); },
        } } });
        void applyStoreDocs([parseStoreDoc(doc({ fields: [] }), 'stores/pet.store')]);
        const start = storesRead(0.5);
        const at = performance.now();
        await store.save();
        await start;
        expect(performance.now() - at).toBeLessThan(200);
        await new Promise((resolve) => setTimeout(resolve, 520));
        store.set((s) => { s.coins = 5; });
        await new Promise((resolve) => setTimeout(resolve, 15));
        expect(written.at(-1)).toBe(5);
    });

    it('changed while the game writes it over one that could not be read is saved too', async () => {
        silence();
        const written: number[] = [];
        const store = createGameStore({ key: 'pet', state: { coins: 0 }, persist: { throttle: 0.001, adapter: {
            load: async () => { throw new Error('offline'); },
            save: async (_key, state) => { const { coins } = state; await new Promise((resolve) => setTimeout(resolve, 10)); written.push(coins); },
        } } });
        await store.load();
        const saving = store.save();
        store.set((s) => { s.coins = 2; });
        await saving;
        await new Promise((resolve) => setTimeout(resolve, 40));
        expect(written).toEqual([0, 2]);
        warn?.mockRestore();
    });
});
