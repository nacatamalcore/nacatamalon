import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { createScene } from '../src/scene/create_scene';
import { useAction, useActions, useVector } from '../src/hooks/input/use_actions';
import { useGamepad } from '../src/hooks/input/use_gamepad';
import { useInputMap } from '../src/hooks/input/use_input_map';
import { normalizeActionMap } from '../src/input';
import { createTestGame, startTestScene } from './helpers/test_game';
import { createFakePad, installFakePads } from './helpers/test_gamepad';
import type { TActionBinding, TActionMap, TActionOverrides, TActionsHandle, TGamepad, TInputMapHandle, TStorePersistence } from '../src';
import type { TRuntimeStore } from '../src/store';

const LEFT_X = 0;
const LEFT_Y = 1;
const A_BUTTON = 0;
const LT = 6;

/**
 * What a small game binds: a stick, a d-pad and the keys, all on the same four names.
 */
const MOVE_MAP: TActionMap = [
    { name: 'move_left', bindings: [{ type: 'key', key: 'a' }, { type: 'button', button: 'left' }, { type: 'axis', axis: 'leftX', dir: -1 }] },
    { name: 'move_right', bindings: [{ type: 'key', key: 'd' }, { type: 'button', button: 'right' }, { type: 'axis', axis: 'leftX', dir: 1 }] },
    { name: 'move_up', bindings: [{ type: 'key', key: 'w' }, { type: 'button', button: 'up' }, { type: 'axis', axis: 'leftY', dir: -1 }] },
    { name: 'move_down', bindings: [{ type: 'key', key: 's' }, { type: 'button', button: 'down' }, { type: 'axis', axis: 'leftY', dir: 1 }] },
    { name: 'fire', bindings: [{ type: 'key', key: ' ' }, { type: 'button', button: 'rt' }] },
];

let pads: ReturnType<typeof installFakePads>;

beforeEach(() => { pads = installFakePads(); });
afterEach(() => {
    pads.restore();
    (console.warn as { mockRestore?: () => void }).mockRestore?.();
});

/**
 * Presses a key the way the browser would.
 */
const key = (type: 'keydown' | 'keyup', name: string): void => {
    globalThis.dispatchEvent(Object.assign(new Event(type), { key: name }));
};

const frame = (store: TRuntimeStore): void => {
    const input = store.get('input');
    input.gamepads.beginFrame();
    input.actions.sample();
};

/**
 * A frame boundary: what `tick` does at the end.
 */
const endFrame = (store: TRuntimeStore): void => { store.get('input').keyboard.endFrame(); };

describe('actions', () => {
    it('refuse to be read outside a scene body', () => {
        expect(() => useActions()).toThrow('[NacatamalOn] useActions');
    });

    it('answer to the keyboard and to the pad through the same name', () => {
        const { store } = createTestGame({ actions: MOVE_MAP });
        let input!: TActionsHandle;
        startTestScene(store, 'Level', () => { input = useActions(); return createScene(); });
        const pad = createFakePad();
        pads.pads[0] = pad;
        frame(store);

        key('keydown', ' ');
        frame(store);
        expect(input.isDown('fire')).toBe(true);
        expect(input.justPressed('fire')).toBe(true);

        key('keyup', ' ');
        endFrame(store);
        pad.press(7, 1);
        frame(store);
        expect(input.isDown('fire')).toBe(true);
    });

    it('take the strongest source and not the sum, so a key does not hide a trigger', () => {
        const { store } = createTestGame({ actions: [{ name: 'gas', bindings: [{ type: 'key', key: 'g' }, { type: 'button', button: 'lt' }] }] });
        let input!: TActionsHandle;
        startTestScene(store, 'Level', () => { input = useActions(); return createScene(); });
        const pad = createFakePad();
        pads.pads[0] = pad;

        pad.press(LT, 0.4);
        frame(store);
        expect(input.rawValue('gas')).toBeCloseTo(0.4, 5);

        key('keydown', 'g');
        frame(store);
        // The key is 1 and wins; adding them would have gone past 1 and hidden the trigger.
        expect(input.rawValue('gas')).toBe(1);
        key('keyup', 'g');
        endFrame(store);
    });

    it('keep the press point and the dead zone apart, so a trigger can be both', () => {
        const { store } = createTestGame({ actions: [{ name: 'gas', bindings: [{ type: 'button', button: 'lt' }] }] });
        let input!: TActionsHandle;
        startTestScene(store, 'Level', () => { input = useActions(); return createScene(); });
        const pad = createFakePad();
        pads.pads[0] = pad;

        pad.press(LT, 0.3);
        frame(store);

        // A third of the way: it has a value and it is not pressed.
        expect(input.value('gas')).toBeGreaterThan(0);
        expect(input.isDown('gas')).toBe(false);

        pad.press(LT, 0.8);
        frame(store);
        expect(input.isDown('gas')).toBe(true);
    });

    it('read a stick through four actions exactly as the stick reads itself', () => {
        const { store } = createTestGame({ actions: MOVE_MAP });
        let move!: () => { x: number; y: number };
        let pad!: TGamepad;
        startTestScene(store, 'Level', () => {
            move = useVector('move_left', 'move_right', 'move_up', 'move_down');
            pad = useGamepad();
            return createScene();
        });
        const fake = createFakePad();
        pads.pads[0] = fake;
        fake.push(LEFT_X, 0.5);
        fake.push(LEFT_Y, -0.35);
        frame(store);

        const byActions = move();
        const byStick = pad.leftStick();
        expect(byActions.x).toBeCloseTo(byStick.x, 6);
        expect(byActions.y).toBeCloseTo(byStick.y, 6);
    });

    it('give a keyboard diagonal the same length as a straight line', () => {
        const { store } = createTestGame({ actions: MOVE_MAP });
        let move!: () => { x: number; y: number };
        startTestScene(store, 'Level', () => {
            move = useVector('move_left', 'move_right', 'move_up', 'move_down');
            return createScene();
        });

        key('keydown', 'd');
        frame(store);
        const straight = move();
        key('keydown', 's');
        frame(store);
        const diagonal = move();
        key('keyup', 'd');
        key('keyup', 's');
        endFrame(store);

        expect(Math.hypot(straight.x, straight.y)).toBeCloseTo(1, 5);
        // Not 1.41: the dead zone is applied once, to the finished direction.
        expect(Math.hypot(diagonal.x, diagonal.y)).toBeCloseTo(1, 5);
    });

    it('keep two players apart: a port reads the pad only, and their presses do not mix', () => {
        const { store } = createTestGame({ actions: MOVE_MAP });
        let one!: TActionsHandle;
        let two!: TActionsHandle;
        startTestScene(store, 'Level', () => {
            one = useActions({ device: 'keyboard' });
            two = useActions({ device: 1 });
            return createScene();
        });
        const padTwo = createFakePad(1);
        pads.pads[1] = padTwo;
        frame(store);

        key('keydown', ' ');
        padTwo.press(7, 1);
        frame(store);

        expect(one.justPressed('fire')).toBe(true);
        expect(two.justPressed('fire')).toBe(true);

        key('keyup', ' ');
        endFrame(store);
        frame(store);
        // Player two is still holding: player one letting go took nothing from them.
        expect(two.isDown('fire')).toBe(true);
        expect(one.isDown('fire')).toBe(false);
    });

    it('read one action on its own with useAction', () => {
        const { store } = createTestGame({ actions: MOVE_MAP });
        let fire!: ReturnType<typeof useAction>;
        startTestScene(store, 'Level', () => { fire = useAction('fire'); return createScene(); });

        key('keydown', ' ');
        frame(store);
        expect(fire.name).toBe('fire');
        expect(fire.isDown()).toBe(true);
        key('keyup', ' ');
        endFrame(store);
    });

    it('answer nothing for a name the game does not have', () => {
        const { store } = createTestGame({ actions: MOVE_MAP });
        let input!: TActionsHandle;
        startTestScene(store, 'Level', () => { input = useActions(); return createScene(); });

        expect(input.has('crouch')).toBe(false);
        expect(input.isDown('crouch')).toBe(false);
        expect(input.value('crouch')).toBe(0);
        expect(input.names).toEqual(MOVE_MAP.map((action) => action.name));
    });
});

describe('remapping', () => {
    /**
     * Somewhere to keep the player's bindings that a test can look inside.
     */
    const memoryAdapter = () => {
        const saved = new Map<string, TActionOverrides>();
        const adapter: TStorePersistence<TActionOverrides> = {
            load: async (key) => saved.get(key) ?? null,
            save: async (key, value) => { saved.set(key, structuredClone(value)); },
        };
        return { adapter, saved };
    };

    const withMap = (persist?: { adapter: TStorePersistence<TActionOverrides> }) => {
        const { store } = createTestGame({ actions: MOVE_MAP, actionsPersist: persist });
        let map!: TInputMapHandle;
        let input!: TActionsHandle;
        startTestScene(store, 'Level', () => {
            map = useInputMap();
            input = useActions();
            return createScene();
        });
        return { store, map, input };
    };

    it('lists what the game bound and what the player changed', () => {
        const { map } = withMap();

        expect(map.list()).toEqual(MOVE_MAP.map((action) => action.name));
        expect(map.bindings('fire')).toEqual(MOVE_MAP[4].bindings);

        map.bind('fire', { type: 'key', key: 'f' }, 0);

        expect(map.bindings('fire')[0]).toEqual({ type: 'key', key: 'f' });
        // What the game says never changes, which is what a reset button shows.
        expect(map.defaults('fire')[0]).toEqual({ type: 'key', key: ' ' });
    });

    it('changes what is read on the very next frame', () => {
        const { store, map, input } = withMap();

        map.bind('fire', { type: 'key', key: 'f' }, 0);
        key('keydown', 'f');
        frame(store);

        expect(input.isDown('fire')).toBe(true);
        key('keyup', 'f');
        endFrame(store);
    });

    it('says which other actions are already on that button', () => {
        const { map } = withMap();

        expect(map.conflicts({ type: 'key', key: 'a' })).toEqual(['move_left']);
        expect(map.conflicts({ type: 'key', key: 'a' }, 'move_left')).toEqual([]);
    });

    it('puts one action or all of them back to what the game says', () => {
        const { map } = withMap();
        map.bind('fire', { type: 'key', key: 'f' }, 0);
        map.bind('move_left', { type: 'key', key: 'j' }, 0);

        map.reset('fire');
        expect(map.bindings('fire')[0]).toEqual({ type: 'key', key: ' ' });
        expect(map.bindings('move_left')[0]).toEqual({ type: 'key', key: 'j' });

        map.reset();
        expect(map.bindings('move_left')[0]).toEqual({ type: 'key', key: 'a' });
        expect(map.overrides()).toEqual({});
    });

    it('removes and clears bindings', () => {
        const { map } = withMap();

        expect(map.unbind('fire', { type: 'key', key: ' ' })).toBe(1);
        expect(map.bindings('fire')).toEqual([{ type: 'button', button: 'rt' }]);

        map.clear('fire');
        expect(map.bindings('fire')).toEqual([]);
    });

    it('waits for the player to press something, and reports the key', () => {
        const { map } = withMap();
        const caught: Array<TActionBinding | null> = [];
        map.capture((binding) => { caught.push(binding); });

        key('keydown', 'k');

        expect(caught).toEqual([{ type: 'key', key: 'k' }]);
    });

    it('reports nothing when the player cancels, and nothing at all when the screen closes', () => {
        const { map } = withMap();
        const caught: Array<TActionBinding | null> = [];

        map.capture((binding) => { caught.push(binding); });
        key('keydown', 'Escape');
        expect(caught).toEqual([null]);

        const cancel = map.capture((binding) => { caught.push(binding); });
        cancel();
        key('keydown', 'k');
        // Closing the screen is not the player choosing nothing: it says nothing at all.
        expect(caught).toEqual([null]);
    });

    it('will not bind a stick that was already pushed when the waiting began', () => {
        const { store, map } = withMap();
        const pad = createFakePad();
        pads.pads[0] = pad;
        pad.push(LEFT_X, 1);
        frame(store);

        const caught: Array<TActionBinding | null> = [];
        map.capture((binding) => { caught.push(binding); }, { sources: ['axis'] });
        frame(store);
        expect(caught).toEqual([]);

        // Back to the middle first, and then pushed: now it counts.
        pad.push(LEFT_X, 0);
        frame(store);
        pad.push(LEFT_X, -1);
        frame(store);

        expect(caught).toEqual([{ type: 'axis', axis: 'leftX', dir: -1 }]);
    });

    it('will not bind a button that was already held when the waiting began', () => {
        const { store, map } = withMap();
        const pad = createFakePad();
        pads.pads[0] = pad;
        pad.press(A_BUTTON);
        frame(store);

        const caught: Array<TActionBinding | null> = [];
        map.capture((binding) => { caught.push(binding); }, { sources: ['button'] });
        frame(store);
        expect(caught).toEqual([]);

        pad.release(A_BUTTON);
        frame(store);
        pad.press(A_BUTTON);
        frame(store);

        expect(caught).toEqual([{ type: 'button', button: 'a' }]);
    });

    it("keeps the player's bindings and brings them back", async () => {
        const memory = memoryAdapter();
        const first = withMap({ adapter: memory.adapter });
        first.map.bind('fire', { type: 'key', key: 'f' }, 0);
        await first.map.save();

        expect(memory.saved.get('nacatamalon:input-map')).toEqual({ fire: [{ type: 'key', key: 'f' }, { type: 'button', button: 'rt' }] });

        const second = withMap({ adapter: memory.adapter });
        // The load is started at boot and lands on its own.
        await new Promise((resolve) => setTimeout(resolve, 0));

        expect(second.map.bindings('fire')[0]).toEqual({ type: 'key', key: 'f' });
    });
});

describe('normalizeActionMap', () => {
    it('drops what it cannot understand and keeps what it can', () => {
        const map = normalizeActionMap([
            { name: 'jump', bindings: [{ type: 'key', key: 'A' }, { type: 'key', key: 'a' }, { type: 'button', button: 'nope' }, { type: 'axis', axis: 'leftX', dir: 0 }] },
            { name: 'jump', bindings: [] },
            { bindings: [] },
            'rubbish',
        ]);

        // One action, one binding: the repeat and the two broken ones went, and the key is spelled
        // the one way the keyboard spells it.
        expect(map).toEqual([{ name: 'jump', bindings: [{ type: 'key', key: 'a' }] }]);
    });
});
