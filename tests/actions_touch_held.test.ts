import { afterEach, describe, expect, it } from 'bun:test';
import { createFrameContext } from '../src/game/loop/create_frame_context';
import { createScene } from '../src/scene/create_scene';
import { registerScene } from '../src/scene/register_scene';
import { startScene } from '../src/scene/start_scene';
import { tick } from '../src/game/loop/tick';
import { useUpdate } from '../src/hooks/loop/use_update';
import { useAction, useActions } from '../src/hooks/input/use_actions';
import { useSpawn } from '../src/hooks/spawn/use_spawn';
import { useTouchAction } from '../src/hooks/input/use_touch_action';
import { destroy } from '../src/destroy/destroy';
import type { TGameObject } from '../src/hooks/spawn/use_spawn';
import { createSprite } from '../src/gameobjects/sprite/create_sprite';
import { normalizeActionMap, bindingKey, describeBinding } from '../src/input';
import { createFakeCanvas, createTestGame } from './helpers/test_game';
import type { TSceneFn } from '../src/scene';
import type { TGameStep } from '../src/game/types/t_game_options';
import type { TActionMap } from '../src/input';

/**
 * Actions held by a finger on an on-screen button (`{ type: 'touch', box }`), and how long an action
 * has been held (`heldFor`). Through the real `tick`, because both are worked out where a frame
 * starts: the pointer's events, then the actions' sample.
 */

(globalThis as { requestAnimationFrame?: (cb: FrameRequestCallback) => number }).requestAnimationFrame = () => 0;

const tint = { r: 1, g: 1, b: 1, a: 1 };

const key = (type: 'keydown' | 'keyup', name: string): void => {
    globalThis.dispatchEvent(Object.assign(new Event(type), { key: name }));
};

afterEach(() => {
    key('keyup', 'x');
});

const touch = (canvas: HTMLCanvasElement, type: string, clientX: number, clientY: number, pointerId = 1): void => {
    canvas.dispatchEvent(Object.assign(new Event(type), { clientX, clientY, button: 0, pointerId, pointerType: 'touch' }));
};

const MAP: TActionMap = normalizeActionMap([
    { name: 'jump', bindings: [{ type: 'key', key: 'x' }, { type: 'touch', box: 'Jump' }] },
    { name: 'left', bindings: [{ type: 'key', key: 'ArrowLeft' }, { type: 'touch', box: 'Left' }] },
    { name: 'right', bindings: [{ type: 'touch', box: 'Right' }] },
]);

/**
 * A button: a 40x40 sprite at a point. The object made from it is given the name a touch binding
 * asks for.
 */
const button = (x: number, y: number) => {
    createSprite({ width: 40, height: 40, tint, transform: { x, y, rotation: 0, scaleX: 1, scaleY: 1 } });
};
function Jump() { button(400, 280); }
function Left() { button(40, 280); }
function Right() { button(100, 280); }

const game = (body: TSceneFn, step: TGameStep = 'display') => {
    const canvas = createFakeCanvas(480, 320);
    const { store } = createTestGame({ actions: MAP, step }, canvas);
    const ctx = createFrameContext();
    let now = 0;
    const frame = (ms = 1000 / 60): void => {
        const prev = now;
        now += ms;
        tick(store, ctx, now, prev);
    };
    registerScene(store, 'Level', body);
    startScene(store, 'Level');
    tick(store, ctx, 0, 0);
    return { canvas, frame };
};

describe('an action held by a finger on an on-screen button', () => {
    const pad: TSceneFn = () => {
        useSpawn(Jump, 'Jump')();
        useSpawn(Left, 'Left')();
        useSpawn(Right, 'Right')();
        return createScene();
    };

    it('is down while the finger is on the button, and reads like any other press', () => {
        const seen: Array<[boolean, boolean]> = [];
        const { canvas, frame } = game(() => {
            const jump = useAction('jump');
            useUpdate(() => seen.push([jump.isDown(), jump.justPressed()]));
            return pad();
        });

        frame();
        touch(canvas, 'pointerdown', 400, 280);
        frame();
        frame();
        touch(canvas, 'pointerup', 400, 280);
        frame();

        expect(seen.slice(-3)).toEqual([[true, true], [true, false], [false, false]]);
    });

    it('follows a thumb sliding from one button to the next, and two thumbs hold two actions', () => {
        let actions!: ReturnType<typeof useActions>;
        const { canvas, frame } = game(() => {
            actions = useActions();
            return pad();
        });

        touch(canvas, 'pointerdown', 40, 280, 1);
        frame();
        expect([actions.isDown('left'), actions.isDown('right')]).toEqual([true, false]);

        touch(canvas, 'pointermove', 100, 280, 1);
        touch(canvas, 'pointerdown', 400, 280, 2);
        frame();
        expect([actions.isDown('left'), actions.isDown('right'), actions.isDown('jump')]).toEqual([false, true, true]);
    });

    it('does not count for a handle on the keyboard alone', () => {
        let keyboardOnly!: ReturnType<typeof useActions>;
        const { canvas, frame } = game(() => {
            keyboardOnly = useActions({ device: 'keyboard' });
            return pad();
        });

        touch(canvas, 'pointerdown', 400, 280);
        frame();

        expect(keyboardOnly.isDown('jump')).toBe(false);
    });

    it('is written down and read back like the other bindings', () => {
        const binding = { type: 'touch', box: 'Jump' } as const;
        expect(normalizeActionMap([{ name: 'jump', bindings: [binding, binding, { type: 'touch', box: '' }] }])).toEqual([
            { name: 'jump', bindings: [binding] },
        ]);
        expect(bindingKey(binding)).toBe('touch:Jump');
        expect(describeBinding(binding)).toBe('Touch Jump');
    });
});

describe('an action held by a button that says which (useTouchAction)', () => {
    // No names anywhere: one component, two props, and the map binds the actions to keys only.
    const Button = ({ x, action }: { x: number; action: string }) => {
        button(x, 280);
        useTouchAction(action);
    };

    it('holds its action while a finger is on it, beside the map\'s own bindings', () => {
        let actions!: ReturnType<typeof useActions>;
        const { canvas, frame } = game(() => {
            actions = useActions();
            useSpawn(Button)({ x: 40, action: 'left' });
            useSpawn(Button)({ x: 400, action: 'jump' });
            return createScene();
        });

        touch(canvas, 'pointerdown', 400, 280);
        frame();
        expect([actions.isDown('jump'), actions.justPressed('jump'), actions.isDown('left')]).toEqual([true, true, false]);

        touch(canvas, 'pointermove', 40, 280);
        frame();
        expect([actions.isDown('jump'), actions.isDown('left')]).toEqual([false, true]);

        touch(canvas, 'pointerup', 40, 280);
        frame();
        expect(actions.isDown('left')).toBe(false);
    });

    it('presses nothing once the button is destroyed', () => {
        let actions!: ReturnType<typeof useActions>;
        let jump!: TGameObject;
        const { canvas, frame } = game(() => {
            actions = useActions();
            jump = useSpawn(Button)({ x: 400, action: 'jump' });
            return createScene();
        });

        touch(canvas, 'pointerdown', 400, 280);
        frame();
        expect(actions.isDown('jump')).toBe(true);

        destroy(jump);
        frame();
        frame();
        expect(actions.isDown('jump')).toBe(false);
    });

    it('does not count for a handle on the keyboard alone', () => {
        let keyboardOnly!: ReturnType<typeof useActions>;
        const { canvas, frame } = game(() => {
            keyboardOnly = useActions({ device: 'keyboard' });
            useSpawn(Button)({ x: 400, action: 'jump' });
            return createScene();
        });

        touch(canvas, 'pointerdown', 400, 280);
        frame();
        expect(keyboardOnly.isDown('jump')).toBe(false);
    });

    it('warns when the game has no such action', () => {
        const warn = console.warn;
        const said: string[] = [];
        console.warn = (message: string) => { said.push(message); };
        try {
            game(() => {
                useSpawn(Button)({ x: 400, action: 'jmup' });
                return createScene();
            });
        } finally {
            console.warn = warn;
        }
        expect(said.some((message) => message.includes("no action 'jmup'"))).toBe(true);
    });

    it('throws outside a body', () => {
        expect(() => useTouchAction('jump')).toThrow(/inside the body/);
    });
});

describe('how long an action has been held', () => {
    it('grows by game time while held, from nothing on the frame it went down', () => {
        const held: number[] = [];
        const { frame } = game(() => {
            const actions = useActions();
            useUpdate(() => held.push(actions.heldFor('jump')));
            return createScene();
        }, 60);

        frame();
        key('keydown', 'x');
        frame();
        frame();
        frame();

        expect(held.slice(-3)).toEqual([0, 1 / 60, 2 / 60]);
    });

    it('still says how long on the frame it is let go, and nothing the frame after', () => {
        const seen: Array<[boolean, number]> = [];
        const { frame } = game(() => {
            const fire = useAction('jump');
            useUpdate(() => seen.push([fire.justReleased(), fire.heldFor()]));
            return createScene();
        }, 60);

        frame();
        key('keydown', 'x');
        for (let i = 0; i < 31; i++) {
            frame();
        }
        key('keyup', 'x');
        frame();
        frame();

        const [released, after] = seen.slice(-2);
        expect(released[0]).toBe(true);
        expect(released[1]).toBeCloseTo(0.5, 6);
        expect(after).toEqual([false, 0]);
    });

    it('stops growing while the game is paused', () => {
        let actions!: ReturnType<typeof useActions>;
        const canvas = createFakeCanvas(480, 320);
        const { store } = createTestGame({ actions: MAP, step: 60 }, canvas);
        const ctx = createFrameContext();
        let now = 0;
        const frame = (): void => { const prev = now; now += 1000 / 60; tick(store, ctx, now, prev); };
        registerScene(store, 'Level', () => { actions = useActions(); return createScene(); });
        startScene(store, 'Level');
        tick(store, ctx, 0, 0);

        key('keydown', 'x');
        frame();
        frame();
        const before = actions.heldFor('jump');
        store.setState('loop', { ...store.get('loop'), pausedBy: ['menu'] });
        frame();
        frame();

        expect(actions.heldFor('jump')).toBe(before);
    });
});
