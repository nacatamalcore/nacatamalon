import { afterEach, describe, expect, it, spyOn } from 'bun:test';
import { applyStoreDocs, clearGameStores, createGameStore, emptyStoreDoc, getGameStore, listGameStores, parseStoreDoc, resetStores, serializeStoreDoc, storeFieldsFromState, defaultStoreFieldValue } from '../src/game_store';
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

    it('opens a new one empty', () => {
        expect(emptyStoreDoc('coins')).toEqual({ format: STORE_FORMAT, version: 1, key: 'coins', fields: [] });
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
