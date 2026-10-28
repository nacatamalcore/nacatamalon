import { describe, expect, it } from 'bun:test';
import { createFrameContext } from '../src/game/loop/create_frame_context';
import { createScene } from '../src/scene/create_scene';
import { registerScene } from '../src/scene/register_scene';
import { startScene } from '../src/scene/start_scene';
import { tick } from '../src/game/loop/tick';
import { useActions } from '../src/hooks/input/use_actions';
import { useInputMap } from '../src/hooks/input/use_input_map';
import { normalizeActionMap, bindingKey, describeBinding } from '../src/input';
import { createFakeCanvas, createTestGame } from './helpers/test_game';
import type { TActionBinding, TActionMap, TActionsHandle, TInputMapHandle } from '../src/input';

/**
 * Actions bound to a mouse button (`{ type: 'mouse', button }`): held like a key, its edges from the
 * events themselves, and never by a finger, which touches the screen for every button drawn on it.
 */

(globalThis as { requestAnimationFrame?: (cb: FrameRequestCallback) => number }).requestAnimationFrame = () => 0;

/**
 * The bit `buttons` carries for each button the browser numbers: 0 main, 1 middle, 2 right.
 */
const BITS = [1, 4, 2, 8, 16];

const MAP: TActionMap = normalizeActionMap([
    { name: 'fire', bindings: [{ type: 'key', key: 'j' }, { type: 'mouse', button: 'main' }] },
    { name: 'aim', bindings: [{ type: 'mouse', button: 'right' }] },
]);

const game = () => {
    const canvas = createFakeCanvas(480, 320);
    const { store } = createTestGame({ actions: MAP }, canvas);
    const ctx = createFrameContext();
    let now = 0;
    const frame = (): void => {
        const prev = now;
        now += 1000 / 60;
        tick(store, ctx, now, prev);
    };
    let any!: TActionsHandle;
    let pad!: TActionsHandle;
    let map!: TInputMapHandle;
    registerScene(store, 'Level', () => {
        any = useActions();
        pad = useActions({ device: 0 });
        map = useInputMap();
        return createScene();
    });
    startScene(store, 'Level');
    tick(store, ctx, 0, 0);

    const pointer = (type: string, button: number, pointerType = 'mouse', held = 0): void => {
        canvas.dispatchEvent(Object.assign(new Event(type), { clientX: 10, clientY: 10, button, buttons: held, pointerId: pointerType === 'mouse' ? 1 : 7, pointerType }));
    };
    const down = (button: number, pointerType = 'mouse'): void => pointer('pointerdown', button, pointerType, BITS[button]);
    const up = (button: number, pointerType = 'mouse'): void => pointer('pointerup', button, pointerType, 0);

    return { frame, down, up, pointer, any: () => any, pad: () => pad, map: () => map };
};

describe('an action bound to a mouse button', () => {
    it('is held while the button is, with one frame of justPressed and one of justReleased', () => {
        const { frame, down, up, any } = game();

        down(0);
        frame();
        expect(any().isDown('fire')).toBe(true);
        expect(any().justPressed('fire')).toBe(true);
        expect(any().isDown('aim')).toBe(false);

        frame();
        expect(any().isDown('fire')).toBe(true);
        expect(any().justPressed('fire')).toBe(false);

        up(0);
        frame();
        expect(any().isDown('fire')).toBe(false);
        expect(any().justReleased('fire')).toBe(true);
    });

    it('sees a click that went down and up between two frames', () => {
        const { frame, down, up, any } = game();

        down(2);
        up(2);
        frame();

        expect(any().isDown('aim')).toBe(false);
        expect(any().justPressed('aim')).toBe(true);
        expect(any().justReleased('aim')).toBe(true);
        expect(any().pressedAt('aim')).not.toBeNull();
    });

    it('hears a second button pressed while the first is held', () => {
        const { frame, down, pointer, any } = game();

        down(0);
        frame();
        // The browser says so as a move, with the new button and every one held.
        pointer('pointermove', 2, 'mouse', BITS[0] | BITS[2]);
        frame();

        expect(any().isDown('fire')).toBe(true);
        expect(any().isDown('aim')).toBe(true);
        expect(any().justPressed('aim')).toBe(true);
    });

    it('is never pressed by a finger', () => {
        const { frame, down, any } = game();

        down(0, 'touch');
        frame();

        expect(any().isDown('fire')).toBe(false);
        expect(any().justPressed('fire')).toBe(false);
    });

    it('is the keyboard\'s player: heard on any device, not on a pad\'s port', () => {
        const { frame, down, any, pad } = game();

        down(0);
        frame();

        expect(any().isDown('fire')).toBe(true);
        expect(pad().isDown('fire')).toBe(false);
    });
});

describe('binding the mouse from a controls screen', () => {
    it('takes a click only when the mouse is asked for', () => {
        const { frame, down, up, map } = game();
        const got: Array<TActionBinding | null> = [];

        const stopDefault = map().capture((binding) => got.push(binding));
        down(0);
        up(0);
        frame();
        expect(got).toEqual([]);
        stopDefault();

        map().capture((binding) => got.push(binding), { sources: ['key', 'mouse'] });
        down(2);
        frame();
        expect(got).toEqual([{ type: 'mouse', button: 'right' }]);
    });
});

describe('a mouse binding in a project file', () => {
    it('is kept, named, and dropped when its button is not one', () => {
        const map = normalizeActionMap([
            { name: 'fire', bindings: [{ type: 'mouse', button: 'main' }, { type: 'mouse', button: 'thumb' }, { type: 'mouse', button: 'main' }] },
        ]);

        expect(map[0]!.bindings).toEqual([{ type: 'mouse', button: 'main' }]);
        expect(bindingKey({ type: 'mouse', button: 'right' })).toBe('mouse:right');
        expect(describeBinding({ type: 'mouse', button: 'main' })).toBe('Mouse Left');
        expect(describeBinding({ type: 'mouse', button: 'forward' })).toBe('Mouse Forward');
    });
});
