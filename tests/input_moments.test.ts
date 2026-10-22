import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { createKeyboard } from '../src/input/create_keyboard';
import { createScene } from '../src/scene/create_scene';
import { usePointer } from '../src/hooks/input/use_pointer';
import { useGamepad } from '../src/hooks/input/use_gamepad';
import { useAction, useActions } from '../src/hooks/input/use_actions';
import { createFakeCanvas, createTestGame, startTestScene } from './helpers/test_game';
import { createFakePad, installFakePads } from './helpers/test_gamepad';
import type { TAction, TActionsHandle, TGamepad, TPointerHandle, TPointerInfo } from '../src/input';

/**
 * When each press happened, the moment of the hand rather than the frame that tells of it: for a
 * rhythm game judging a press against the beat. Every moment is in seconds on the page's clock.
 */

/** An event as a browser sends it, with when it happened, in milliseconds. */
const event = (type: string, fields: Record<string, unknown>, timeStamp?: number): Event => {
    const made = Object.assign(new Event(type), fields);
    if (timeStamp !== undefined) Object.defineProperty(made, 'timeStamp', { value: timeStamp });
    return made;
};

describe('a key', () => {
    const keyboard = () => {
        const view = new EventTarget();
        const keys = createKeyboard({ ownerDocument: { defaultView: view } } as unknown as HTMLCanvasElement);
        return { view, keys };
    };

    it('says when it went down, for the frame it did, and nothing after', () => {
        const { view, keys } = keyboard();
        expect(keys.pressedAt(' ')).toBeNull();

        view.dispatchEvent(event('keydown', { key: ' ', code: 'Space' }, 1234.5));
        expect(keys.pressedAt(' ')).toBeCloseTo(1.2345, 9);

        keys.endFrame();
        expect(keys.pressedAt(' ')).toBeNull();
    });

    it('keeps the first press of a frame, and is not moved by the repeats of a held key', () => {
        const { view, keys } = keyboard();
        view.dispatchEvent(event('keydown', { key: 'a', code: 'KeyA' }, 1000));
        view.dispatchEvent(event('keydown', { key: 'a', code: 'KeyA', repeat: true }, 1030));
        view.dispatchEvent(event('keyup', { key: 'a', code: 'KeyA' }, 1040));
        view.dispatchEvent(event('keydown', { key: 'a', code: 'KeyA' }, 1050));
        expect(keys.pressedAt('a')).toBe(1);
    });

    it('happened now when its event does not say', () => {
        const { view, keys } = keyboard();
        const before = performance.now() / 1000;
        view.dispatchEvent(event('keydown', { key: 'b', code: 'KeyB' }, 0));
        expect(keys.pressedAt('b')!).toBeGreaterThanOrEqual(before);
        expect(keys.pressedAt('b')!).toBeLessThanOrEqual(performance.now() / 1000);
    });
});

describe('a pointer', () => {
    const withPointer = () => {
        const canvas = createFakeCanvas(480, 320, 1);
        const { store } = createTestGame({}, canvas);
        let pointer!: TPointerHandle;
        const downs: TPointerInfo[] = [];
        startTestScene(store, 'Taps', () => {
            pointer = usePointer();
            pointer.onDown((info) => downs.push(info));
            return createScene();
        });
        const frame = () => store.get('input').pointer.dispatch(store);
        const fire = (type: string, timeStamp: number, button = 0) =>
            canvas.dispatchEvent(event(type, { clientX: 10, clientY: 10, button, pointerId: 1 }, timeStamp));
        return { pointer, downs, frame, fire };
    };

    it('tells its listener when the touch happened, and says it for the frame', () => {
        const { pointer, downs, frame, fire } = withPointer();
        fire('pointerdown', 2000);
        frame();

        expect(downs.map((info) => info.time)).toEqual([2]);
        expect(pointer.pressedAt()).toBe(2);
        expect(pointer.pressedAt('main')).toBe(2);
        expect(pointer.pressedAt('right')).toBeNull();

        fire('pointerup', 2100);
        frame();
        expect(pointer.pressedAt()).toBeNull();
    });
});

describe('a pad', () => {
    let pads: ReturnType<typeof installFakePads>;
    beforeEach(() => { pads = installFakePads(); });
    afterEach(() => { pads.restore(); });

    it('says when it changed, as the pad tells it, for the frame a button went down', () => {
        const { store } = createTestGame();
        let pad!: TGamepad;
        startTestScene(store, 'Pad', () => { pad = useGamepad(); return createScene(); });
        const frame = () => store.get('input').gamepads.beginFrame();
        const fake = createFakePad();
        pads.pads[0] = fake;
        frame();

        fake.press(0);
        fake.timestamp = 5016;
        frame();
        expect(pad.pressedAt('a')).toBeCloseTo(5.016, 9);
        expect(pad.pressedAt('b')).toBeNull();

        fake.timestamp = 5033;
        frame();
        expect(pad.pressedAt('a')).toBeNull();
    });
});

describe('an action', () => {
    let pads: ReturnType<typeof installFakePads>;
    beforeEach(() => { pads = installFakePads(); });
    afterEach(() => { pads.restore(); });

    const withActions = () => {
        const { store } = createTestGame({
            actions: [
                { name: 'hit', bindings: [{ type: 'key', key: ' ' }, { type: 'button', button: 'a' }] },
                { name: 'left', bindings: [{ type: 'axis', axis: 'leftX', dir: -1 }] },
            ],
        });
        let actions!: TActionsHandle;
        let hit!: TAction;
        startTestScene(store, 'Rhythm', () => { actions = useActions(); hit = useAction('hit'); return createScene(); });
        // As the loop runs a frame: read at its start, its presses closed at its end.
        const frame = () => {
            store.get('input').gamepads.beginFrame();
            store.get('input').actions.sample();
        };
        const endFrame = () => store.get('input').keyboard.endFrame();
        return { actions, hit, frame, endFrame };
    };

    it('says when whatever pressed it first went down, a key or a button, and nothing after', () => {
        const { actions, hit, frame, endFrame } = withActions();
        const fake = createFakePad();
        pads.pads[0] = fake;
        frame();
        endFrame();

        fake.press(0);
        fake.timestamp = 3040;
        globalThis.dispatchEvent(event('keydown', { key: ' ', code: 'Space' }, 3010));
        frame();
        expect(actions.pressedAt('hit')).toBeCloseTo(3.01, 9);
        expect(hit.pressedAt()).toBeCloseTo(3.01, 9);
        endFrame();

        frame();
        expect(actions.pressedAt('hit')).toBeNull();
        globalThis.dispatchEvent(event('keyup', { key: ' ', code: 'Space' }, 3100));
    });

    it('counts a stick, which has no moment of its own, as now', () => {
        const { actions, frame } = withActions();
        const fake = createFakePad();
        pads.pads[0] = fake;
        frame();

        fake.push(0, -1);
        const before = performance.now() / 1000;
        frame();
        expect(actions.pressedAt('left')!).toBeGreaterThanOrEqual(before);
        expect(actions.pressedAt('hit')).toBeNull();
    });
});
