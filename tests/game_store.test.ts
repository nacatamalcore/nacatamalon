import { afterEach, describe, expect, it, spyOn } from 'bun:test';
import { createScene } from '../src/scene/create_scene';
import { stopScene } from '../src/scene/stop_scene';
import { setScenePaused } from '../src/scene/pause_scene';
import { useSpawn } from '../src/hooks/spawn/use_spawn';
import { useStore } from '../src/hooks/store/use_store';
import { clearGameStores, createGameStore, localStorageAdapter } from '../src/game_store';
import type { TStorePersistence, TStoreSet } from '../src/game_store';
import { destroy } from '../src/destroy';
import { createTestGame, startTestScene } from './helpers/test_game';

type TPet = { hunger: number; happy: number; timesFed: number; inventory: string[] };

const newPet = (): TPet => ({ hunger: 70, happy: 70, timesFed: 0, inventory: [] });

/**
 * An adapter that keeps saves in a map and counts the writes.
 */
const memoryAdapter = <S>() => {
    const saved = new Map<string, S>();
    const writes: S[] = [];
    const adapter: TStorePersistence<S> = {
        load: async (key) => (saved.has(key) ? structuredClone(saved.get(key)!) : null),
        save: async (key, state) => {
            const copy = structuredClone(state);
            saved.set(key, copy);
            writes.push(copy);
        },
    };
    return { adapter, saved, writes };
};

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

afterEach(() => {
    // Some tests silence warnings; none should leak into the next.
    (console.warn as { mockRestore?: () => void }).mockRestore?.();
    // Every test here makes a store called 'pet', and the index is of the page rather than of a
    // game: without this the second one is a duplicate key, which is now a warning and rightly so.
    clearGameStores();
});

describe('createGameStore: reading and changing', () => {
    it('changes the live state in place and get returns that same object', () => {
        const store = createGameStore({ key: 'pet', state: newPet() });
        const before = store.state;

        store.set((s) => { s.hunger = 10; });

        expect(store.state).toBe(before);
        expect(store.get()).toBe(before);
        expect(store.state.hunger).toBe(10);
    });

    it('builds actions from slices that share set and get', () => {
        const care = (set: TStoreSet<TPet>) => ({
            feed: () => set((s) => { s.hunger += 15; s.timesFed++; }),
        });
        const life = (set: TStoreSet<TPet>, get: () => TPet) => ({
            // Reads what another slice wrote, through the same get.
            wellFed: () => get().timesFed > 1,
            starve: () => set((s) => { s.hunger = 0; }),
        });
        const store = createGameStore({
            key: 'pet',
            state: newPet(),
            actions: (set, get) => ({ ...care(set), ...life(set, get) }),
        });

        store.actions.feed();
        store.actions.feed();

        expect(store.state.timesFed).toBe(2);
        expect(store.actions.wellFed()).toBe(true);
        store.actions.starve();
        expect(store.state.hunger).toBe(0);
    });
});

describe('createGameStore: subscribe', () => {
    it('without a selector, tells on every change, straight away', () => {
        const store = createGameStore({ key: 'pet', state: newPet() });
        let calls = 0;
        store.subscribe(() => { calls += 1; });

        store.set((s) => { s.hunger -= 1; });
        expect(calls).toBe(1);
        store.set((s) => { s.hunger -= 1; });
        expect(calls).toBe(2);
    });

    it('with a selector, tells only when the selected value changes, with the new and the old', () => {
        const store = createGameStore({ key: 'pet', state: newPet() });
        const log: Array<[boolean, boolean]> = [];
        store.subscribe((s) => s.hunger > 30, (content, previous) => { log.push([content, previous]); });

        store.set((s) => { s.hunger = 50; });
        store.set((s) => { s.happy = 0; });
        store.set((s) => { s.hunger = 20; });
        store.set((s) => { s.hunger = 10; });
        store.set((s) => { s.hunger = 90; });

        expect(log).toEqual([[false, true], [true, false]]);
    });

    it('uses equals when one is given', () => {
        const store = createGameStore({ key: 'pet', state: newPet() });
        const log: number[] = [];
        // Tens only: 70 to 75 is the same, 70 to 80 is not.
        store.subscribe((s) => s.hunger, (hunger) => { log.push(hunger); }, (a, b) => Math.floor(a / 10) === Math.floor(b / 10));

        store.set((s) => { s.hunger = 75; });
        store.set((s) => { s.hunger = 80; });

        expect(log).toEqual([80]);
    });

    it('never tells about a selected object that was changed in place: select values instead', () => {
        const store = createGameStore({ key: 'pet', state: newPet() });
        const byObject: number[] = [];
        const byLength: number[] = [];
        store.subscribe((s) => s.inventory, (items) => { byObject.push(items.length); });
        store.subscribe((s) => s.inventory.length, (length) => { byLength.push(length); });

        store.set((s) => { s.inventory.push('apple'); });

        expect(byObject).toEqual([]);
        expect(byLength).toEqual([1]);
    });

    it('stops with the function it returns, and the same function twice is two subscriptions', () => {
        const store = createGameStore({ key: 'pet', state: newPet() });
        let calls = 0;
        const listener = () => { calls += 1; };
        const off = store.subscribe(listener);
        store.subscribe(listener);

        off();
        off();
        store.set((s) => { s.hunger = 1; });

        expect(calls).toBe(1);
    });

    it('does not call a listener removed by an earlier one of the same change', () => {
        const store = createGameStore({ key: 'pet', state: newPet() });
        const log: string[] = [];
        let offB = () => {};
        store.subscribe(() => { log.push('a'); offB(); });
        offB = store.subscribe(() => { log.push('b'); });

        store.set((s) => { s.hunger = 1; });

        expect(log).toEqual(['a']);
    });

    it('keeps telling the rest when a listener throws', () => {
        const store = createGameStore({ key: 'pet', state: newPet() });
        const warn = spyOn(console, 'warn').mockImplementation(() => {});
        warn.mockClear();
        const log: string[] = [];
        store.subscribe(() => { throw new Error('broken'); });
        store.subscribe(() => { log.push('still told'); });

        store.set((s) => { s.hunger = 1; });

        expect(log).toEqual(['still told']);
        expect(warn).toHaveBeenCalledTimes(1);
    });

    it('does not report the same change twice when a listener changes the store again', () => {
        const store = createGameStore({ key: 'pet', state: newPet() });
        const log: number[] = [];
        store.subscribe((s) => s.hunger < 0, (below) => {
            log.push(store.state.hunger);
            // Clamps it back: a change inside the listener.
            if (below) store.set((s) => { s.hunger = 0; });
        });

        store.set((s) => { s.hunger = -5; });

        // Once for going below zero, once for coming back: no loop, no repeat.
        expect(log).toEqual([-5, 0]);
        expect(store.state.hunger).toBe(0);
    });
});

describe('useStore', () => {
    it('refuses to be called outside a scene body', () => {
        const store = createGameStore({ key: 'pet', state: newPet() });
        expect(() => useStore(store, (s) => s.hunger, () => {})).toThrow('[NacatamalOn] useStore');
    });

    it('tells the scene when the selected value changes, and stops when the scene does', () => {
        const { store: game } = createTestGame();
        const pet = createGameStore({ key: 'pet', state: newPet() });
        const log: boolean[] = [];
        startTestScene(game, 'Level', () => {
            useStore(pet, (s) => s.hunger > 30, (content) => { log.push(content); });
            return createScene();
        });

        pet.set((s) => { s.hunger = 5; });
        stopScene(game, 'Level');
        pet.set((s) => { s.hunger = 90; });

        expect(log).toEqual([false]);
    });

    it('stops as soon as its object is destroyed', () => {
        const { store: game } = createTestGame();
        const pet = createGameStore({ key: 'pet', state: newPet() });
        let calls = 0;
        const Listener = () => { useStore(pet, (s) => s.hunger, () => { calls += 1; }); };
        let listener!: ReturnType<ReturnType<typeof useSpawn>>;
        startTestScene(game, 'Level', () => { listener = useSpawn(Listener)(); return createScene(); });

        destroy(listener);
        pet.set((s) => { s.hunger = 1; });

        expect(calls).toBe(0);
    });

    it('still hears while its scene is paused', () => {
        const { store: game } = createTestGame();
        const pet = createGameStore({ key: 'pet', state: newPet() });
        let calls = 0;
        startTestScene(game, 'Level', () => {
            useStore(pet, (s) => s.hunger, () => { calls += 1; });
            return createScene();
        });

        setScenePaused(game, 'Level', true);
        pet.set((s) => { s.hunger = 1; });

        expect(calls).toBe(1);
    });
});

describe('createGameStore: saving', () => {
    it("'auto' turns a burst of changes into one save of the latest state", async () => {
        const memory = memoryAdapter<TPet>();
        const store = createGameStore({ key: 'pet', state: newPet(), persist: { adapter: memory.adapter, throttle: 20 } });

        store.set((s) => { s.hunger = 1; });
        store.set((s) => { s.hunger = 2; });
        store.set((s) => { s.hunger = 3; });
        expect(memory.writes.length).toBe(0);

        await sleep(40);

        expect(memory.writes.length).toBe(1);
        expect(memory.writes[0].hunger).toBe(3);
    });

    it("'auto' keeps saving while something changes all the time", async () => {
        const memory = memoryAdapter<TPet>();
        const store = createGameStore({ key: 'pet', state: newPet(), persist: { adapter: memory.adapter, throttle: 20 } });

        // A value decaying every 5 ms for 110 ms: a debounce would never save until it stopped.
        for (let i = 0; i < 22; i++) {
            store.set((s) => { s.hunger -= 1; });
            await sleep(5);
        }

        expect(memory.writes.length).toBeGreaterThanOrEqual(2);
    });

    it("'manual' only saves when asked", async () => {
        const memory = memoryAdapter<TPet>();
        const store = createGameStore({ key: 'pet', state: newPet(), persist: { adapter: memory.adapter, mode: 'manual', throttle: 5 } });

        store.set((s) => { s.timesFed = 4; });
        await sleep(20);
        expect(memory.writes.length).toBe(0);

        await store.save();
        expect(memory.saved.get('pet')?.timesFed).toBe(4);
    });

    it('save cancels the pending automatic save instead of writing twice', async () => {
        const memory = memoryAdapter<TPet>();
        const store = createGameStore({ key: 'pet', state: newPet(), persist: { adapter: memory.adapter, throttle: 20 } });

        store.set((s) => { s.hunger = 1; });
        await store.save();
        await sleep(40);

        expect(memory.writes.length).toBe(1);
    });

    it('does nothing when saved or loaded without persist', async () => {
        const store = createGameStore({ key: 'pet', state: newPet() });
        await store.save();
        expect(await store.load()).toBe(false);
    });
});

describe('createGameStore: loading and resetting', () => {
    it('puts a save over the defaults, so fields added later keep their value, and tells', async () => {
        const memory = memoryAdapter<TPet>();
        // A save from an older version of the game, before `inventory` existed.
        memory.saved.set('pet', { hunger: 12, timesFed: 9 } as TPet);
        const store = createGameStore({ key: 'pet', state: newPet(), persist: { adapter: memory.adapter } });
        let calls = 0;
        store.subscribe(() => { calls += 1; });

        expect(await store.load()).toBe(true);

        expect(store.state).toEqual({ hunger: 12, happy: 70, timesFed: 9, inventory: [] });
        expect(calls).toBe(1);
    });

    it('resolves to false when there is no save', async () => {
        const memory = memoryAdapter<TPet>();
        const store = createGameStore({ key: 'pet', state: newPet(), persist: { adapter: memory.adapter } });
        expect(await store.load()).toBe(false);
    });

    it('goes back to the declared state, even after the object it was given was changed, and keeps the same object', () => {
        const initial = newPet();
        const store = createGameStore({ key: 'pet', state: initial });
        const live = store.state;
        let calls = 0;
        store.subscribe(() => { calls += 1; });

        store.set((s) => { s.hunger = 0; s.inventory.push('bone'); (s as Record<string, unknown>).extra = true; });
        store.reset();

        expect(store.state).toBe(live);
        expect(store.state).toEqual(newPet());
        expect(calls).toBe(2);
        // A second reset still has a clean copy to go back to.
        store.set((s) => { s.inventory.push('ball'); });
        store.reset();
        expect(store.state.inventory).toEqual([]);
    });

    it('warns and carries on when the adapter fails', async () => {
        const warn = spyOn(console, 'warn').mockImplementation(() => {});
        warn.mockClear();
        const broken: TStorePersistence<TPet> = {
            load: async () => { throw new Error('offline'); },
            save: () => Promise.reject(new Error('offline')),
        };
        const store = createGameStore({ key: 'pet', state: newPet(), persist: { adapter: broken } });

        expect(await store.load()).toBe(false);
        await store.save();

        expect(warn).toHaveBeenCalledTimes(2);
    });
});

describe('localStorageAdapter', () => {
    /**
     * A `localStorage` with nothing behind it.
     */
    const fakeLocalStorage = () => {
        const items = new Map<string, string>();
        Object.assign(globalThis, {
            localStorage: {
                getItem: (key: string) => items.get(key) ?? null,
                setItem: (key: string, value: string) => { items.set(key, value); },
            },
        });
        return items;
    };

    it('saves as JSON and reads it back', async () => {
        const items = fakeLocalStorage();
        const adapter = localStorageAdapter<TPet>();

        await adapter.save('pet', newPet());

        expect(items.get('pet')).toBe(JSON.stringify(newPet()));
        expect(await adapter.load('pet')).toEqual(newPet());
        expect(await adapter.load('nothing')).toBeNull();
    });

    it('reads a broken save as no save, with a warning', async () => {
        const items = fakeLocalStorage();
        const warn = spyOn(console, 'warn').mockImplementation(() => {});
        warn.mockClear();
        items.set('pet', '{ not json');

        expect(await localStorageAdapter<TPet>().load('pet')).toBeNull();
        expect(warn).toHaveBeenCalledTimes(1);
    });
});
