import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { createFrameContext } from '../src/game/loop/create_frame_context';
import { createScene } from '../src/scene/create_scene';
import { registerScene } from '../src/scene/register_scene';
import { startScene } from '../src/scene/start_scene';
import { tick } from '../src/game/loop/tick';
import { useUpdate } from '../src/hooks/loop/use_update';
import { useLateUpdate } from '../src/hooks/loop/use_late_update';
import { usePointer } from '../src/hooks/input/use_pointer';
import { useActions } from '../src/hooks/input/use_actions';
import { useGamepad } from '../src/hooks/input/use_gamepad';
import { useKeyboard } from '../src/hooks/input/use_keyboard';
import { useScene } from '../src/hooks/scene/use_scene';
import { useTimer } from '../src/hooks/timer/use_timer';
import { useTween } from '../src/hooks/tween/use_tween';
import { createSprite } from '../src/gameobjects/sprite/create_sprite';
import { usePhysicsBody2d, usePhysicsWorld2d } from '../src/hooks/physics';
import { registerPhysicsProvider } from '../src/physics';
import { rapier2dProvider } from '../src/physics/rapier2d/provider';
import { loadRapier2D } from '../src/physics/rapier2d/load_rapier';
import { editorHandleOf, openHost } from '../src/game/handle/editor_handle_of';
import { box3dProvider } from '../src/physics/box3d/provider';
import { loadBox3D } from '../src/physics/box3d/load_box3d';
import { usePhysicsBody3d, usePhysicsWorld3d } from '../src/hooks/physics';
import { useTransform } from '../src/hooks/transform/use_transform';
import { runHookUpdates } from '../src/game/loop/runHookUpdates';
import { startTestScene } from './helpers/test_game';
import { normalizeActionMap } from '../src/input';
import { createFakeCanvas, createTestGame } from './helpers/test_game';
import { useSpawn } from '../src/hooks/spawn/use_spawn';
import { installFakePads } from './helpers/test_gamepad';
import type { TSceneFn } from '../src/scene';
import type { TGameStep } from '../src/game/types/t_game_options';
import type { TGameInstance } from '../src/game/types/t_game_instance';
import type { TSceneHandle } from '../src/hooks/scene/use_scene';
import type { TSprite } from '../src/gameobjects/sprite/types';

/**
 * Everything that runs once per step rather than once per picture, checked with a fixed step:
 * the pointer, the actions, the pad, a pause, timers and tweens, a scene change between two steps,
 * physics, and a host stepping the game by hand. Each check that has a twin on the screen's time
 * runs both and asks for the same answer, so a step game is the same game, only on its own clock.
 */

(globalThis as { requestAnimationFrame?: (cb: FrameRequestCallback) => number }).requestAnimationFrame = () => 0;

const key = (type: 'keydown' | 'keyup', name: string): void => {
    globalThis.dispatchEvent(Object.assign(new Event(type), { key: name }));
};

let pads: ReturnType<typeof installFakePads>;
beforeEach(() => { pads = installFakePads(); });
afterEach(() => {
    pads.restore();
    key('keyup', 'x');
});

const onScreen = (step: TGameStep, body: TSceneFn, actions?: Parameters<typeof normalizeActionMap>[0]) => {
    const canvas = createFakeCanvas(480, 320);
    const { store } = createTestGame({ step, ...(actions ? { actions: normalizeActionMap(actions) } : {}) }, canvas);
    const ctx = createFrameContext();
    let now = 0;
    const picture = (ms: number): void => {
        const prev = now;
        now += ms;
        tick(store, ctx, now, prev);
    };
    registerScene(store, 'Level', body);
    startScene(store, 'Level');
    tick(store, ctx, 0, 0);
    return { store, ctx, canvas, picture };
};

/**
 * Pictures of a 144 Hz screen until one that runs no step, which is where input has to wait.
 */
const toAPictureWithNoStep = (picture: (ms: number) => void, steps: () => number): void => {
    for (;;) {
        const before = steps();
        picture(1000 / 144);
        if (steps() === before + 1) {
            return;
        }
    }
};

describe('the pointer with a fixed step', () => {
    it('hands a click made on a picture with no step to the next step, once', () => {
        let steps = 0;
        const downs: number[] = [];
        const { canvas, picture } = onScreen(60, () => {
            const pointer = usePointer();
            pointer.onDown(() => downs.push(steps));
            useUpdate(() => { steps += 1; });
            return createScene();
        });

        toAPictureWithNoStep(picture, () => steps);
        canvas.dispatchEvent(Object.assign(new Event('pointerdown'), { clientX: 10, clientY: 10, button: 0, pointerId: 1 }));
        // The picture after a step on a 144 Hz screen runs none: the click waits.
        picture(1000 / 144);
        expect(downs).toEqual([]);
        for (let i = 0; i < 6; i++) {
            picture(1000 / 144);
        }

        expect(downs).toHaveLength(1);
    });
});

describe('the actions with a fixed step', () => {
    it('report a key press once, on a 144 Hz screen, like the keyboard', () => {
        let steps = 0;
        let pressed = 0;
        const { picture } = onScreen(60, () => {
            const actions = useActions();
            useUpdate(() => {
                steps += 1;
                if (actions.justPressed('jump')) pressed += 1;
            });
            return createScene();
        }, [{ name: 'jump', bindings: [{ type: 'key', key: 'x' }] }]);

        toAPictureWithNoStep(picture, () => steps);
        key('keydown', 'x');
        for (let i = 0; i < 12; i++) {
            picture(1000 / 144);
        }

        expect(pressed).toBe(1);
    });

    it('report a pad button once, read on each step', () => {
        pads.pads[0] = {
            index: 0, id: 'Fake Pad', mapping: 'standard', connected: true,
            buttons: Array.from({ length: 17 }, () => ({ pressed: false, value: 0 })),
            axes: [0, 0, 0, 0],
        } as never;
        let pressed = 0;
        const { picture } = onScreen(60, () => {
            const pad = useGamepad();
            useUpdate(() => {
                if (pad.justPressed('a')) pressed += 1;
            });
            return createScene();
        });
        picture(1000 / 60);

        (pads.pads[0] as unknown as { buttons: Array<{ pressed: boolean; value: number }> }).buttons[0] = { pressed: true, value: 1 };
        for (let i = 0; i < 12; i++) {
            picture(1000 / 144);
        }

        expect(pressed).toBe(1);
    });
});

describe('a paused game with a fixed step', () => {
    // A pause menu has to answer: while paused, every picture closes the input as on the screen's time.
    it('closes the input on every picture, so a press made while paused is not fresh after it', () => {
        const run = (step: TGameStep): boolean[] => {
            const seen: boolean[] = [];
            const { store, picture } = onScreen(step, () => {
                const keys = useKeyboard();
                useUpdate(() => seen.push(keys.justPressed('x')));
                return createScene();
            });
            store.setState('loop', { ...store.get('loop'), pausedBy: ['menu'] });
            key('keydown', 'x');
            picture(1000 / 60);
            store.setState('loop', { ...store.get('loop'), pausedBy: [] });
            picture(1000 / 60);
            return seen;
        };

        // The screen's time also runs the first picture, which measures nothing, with a delta of 0;
        // a fixed step has no time owed yet and runs none. After that the two agree.
        expect(run('display').at(-1)).toBe(false);
        expect(run(60)).toEqual([false]);
    });
});

describe('timers and tweens with a fixed step', () => {
    it('fire on the same step on every screen', () => {
        const firedAt = (hz: number): number => {
            let steps = 0;
            let at = -1;
            const { picture } = onScreen(60, () => {
                const timer = useTimer();
                timer.after(0.5, () => { at = steps; });
                useUpdate(() => { steps += 1; });
                return createScene();
            });
            for (let i = 0; i < hz; i++) {
                picture(1000 / hz);
            }
            return at;
        };

        expect(firedAt(144)).toBe(firedAt(60));
        expect(firedAt(30)).toBe(firedAt(60));
    });

    it('move a tween by the same values on every screen', () => {
        const values = (hz: number): number[] => {
            const seen: number[] = [];
            const { picture } = onScreen(60, () => {
                const tween = useTween();
                tween({ from: 0, to: 100, duration: 0.25, onUpdate: (v: number) => { seen.push(v); } });
                return createScene();
            });
            for (let i = 0; i < hz / 2; i++) {
                picture(1000 / hz);
            }
            return seen;
        };

        expect(values(144)).toEqual(values(60));
    });
});

describe('a scene change between two steps of one picture', () => {
    it('runs the old scene up to the change and the new one from the next step', () => {
        const order: string[] = [];
        let handle!: TSceneHandle;
        const { store, picture } = onScreen(60, () => {
            handle = useScene();
            useUpdate(() => {
                order.push('old');
                handle.change('Next');
            });
            return createScene();
        });
        registerScene(store, 'Next', () => {
            useUpdate(() => order.push('new'));
            return createScene();
        });

        // A 30 Hz picture: two steps.
        picture(1000 / 30);

        expect(order).toEqual(['old', 'new']);
    });
});

describe('useLateUpdate with a fixed step', () => {
    it('runs once after the updates of each step', () => {
        const order: string[] = [];
        const { picture } = onScreen(60, () => {
            useUpdate(() => order.push('update'));
            useLateUpdate(() => order.push('late'));
            return createScene();
        });

        picture(1000 / 30);

        expect(order).toEqual(['update', 'late', 'update', 'late']);
    });
});

describe('physics with a fixed step', () => {
    beforeEach(() => { registerPhysicsProvider(rapier2dProvider); });
    afterEach(() => { registerPhysicsProvider(null); });

    it('lands a falling body on the same pixel on a 144 Hz screen as on a 60 Hz one', async () => {
        await loadRapier2D();
        const fall = async (hz: number): Promise<number> => {
            let ball!: TSprite;
            const { picture } = onScreen(60, () => {
                usePhysicsWorld2d();
                ball = createSprite({ width: 10, height: 10, transform: { x: 100, y: 0, rotation: 0, scaleX: 1, scaleY: 1 } });
                usePhysicsBody2d({ body: 'dynamic', collider: { shape: 'rect', width: 10, height: 10 } });
                return createScene();
            });
            await new Promise((resolve) => setTimeout(resolve, 0));
            for (let i = 0; i < hz; i++) {
                picture(1000 / hz);
            }
            return ball.transform.y;
        };

        const at60 = await fall(60);
        expect(at60).toBeGreaterThan(0);
        expect(await fall(144)).toBe(at60);
    });
});

describe('a host stepping a game with a fixed step', () => {
    it('runs exactly the frames it asked for, by the time it asked for', async () => {
        const deltas: number[] = [];
        const { store, picture } = onScreen(60, () => {
            useUpdate((dt) => deltas.push(dt));
            return createScene();
        });
        const instance = { destroy: () => {} } as unknown as TGameInstance;
        openHost(instance).resolve(store);
        const handle = await editorHandleOf(instance);

        handle.pause('editor');
        picture(1000);
        expect(deltas).toEqual([]);

        handle.stepFrames(3, 1 / 60);
        picture(1000);
        expect(deltas).toEqual([1 / 60, 1 / 60, 1 / 60]);
        expect(handle.isPaused()).toBe(true);

        // And resumed, it carries on in whole steps, without the second it spent paused.
        handle.resume('editor');
        picture(1000 / 60);
        expect(deltas).toHaveLength(4);
    });
});

/**
 * How far a falling body moves on each step, and whether that grows evenly: under gravity each step
 * moves it a little further than the last, by the same amount every time. A world that fitted six of
 * its own steps into five of the game's would show one step in five moving about twice as far.
 */
const evenly = (heights: number[]): number => {
    const moves = heights.slice(1).map((h, i) => Math.abs(h - heights[i]));
    const growth = moves.slice(1).map((m, i) => m - moves[i]);
    const typical = growth.slice().sort((a, b) => a - b)[Math.floor(growth.length / 2)];
    return Math.max(...growth.map((g) => Math.abs(g - typical))) / typical;
};

describe('physics stepped by a game at 50 (PAL)', () => {
    afterEach(() => { registerPhysicsProvider(null); });

    it('takes one step of 1/50 per step of the game in 2D, so a fall moves evenly', async () => {
        registerPhysicsProvider(rapier2dProvider);
        await loadRapier2D();
        const { store } = createTestGame({ step: 50 });
        let ball!: TSprite;
        const root = startTestScene(store, 'Level', () => {
            usePhysicsWorld2d();
            ball = createSprite({ width: 10, height: 10, transform: { x: 100, y: 0, rotation: 0, scaleX: 1, scaleY: 1 } });
            usePhysicsBody2d({ body: 'dynamic', collider: { shape: 'rect', width: 10, height: 10 } });
            return createScene();
        });
        await new Promise((resolve) => setTimeout(resolve, 0));

        // Fifteen steps: well before it reaches the fastest a body falls, where the growth stops.
        const heights: number[] = [];
        for (let i = 0; i < 15; i++) {
            runHookUpdates(root, 1 / 50);
            heights.push(ball.transform.y);
        }

        expect(evenly(heights)).toBeLessThan(0.05);
    });

    it('does the same in 3D', async () => {
        registerPhysicsProvider(box3dProvider);
        await loadBox3D();
        const { store } = createTestGame({ step: 50 });
        let place!: ReturnType<typeof useTransform>;
        const root = startTestScene(store, 'Level', () => {
            usePhysicsWorld3d();
            useSpawn(function Crate() {
                place = useTransform({ y: 100 });
                usePhysicsBody3d({ body: 'dynamic', collider: { shape: 'box', size: [1, 1, 1] } });
            })();
            return createScene();
        });
        await new Promise((resolve) => setTimeout(resolve, 0));

        const heights: number[] = [];
        for (let i = 0; i < 26; i++) {
            runHookUpdates(root, 1 / 50);
            heights.push(place.y);
        }

        expect(evenly(heights)).toBeLessThan(0.05);
    });
});

describe('a host stepping a game at 50 without saying by how much', () => {
    it('runs one step of the game, 1/50, and on the screen\'s time 1/60', async () => {
        for (const [step, want] of [[50, 1 / 50], ['display', 1 / 60]] as const) {
            const deltas: number[] = [];
            const { store, picture } = onScreen(step, () => {
                useUpdate((dt) => deltas.push(dt));
                return createScene();
            });
            const instance = { destroy: () => {} } as unknown as TGameInstance;
            openHost(instance).resolve(store);
            const handle = await editorHandleOf(instance);
            handle.pause('editor');
            deltas.length = 0;

            handle.stepFrame();
            picture(1000);
            handle.stepFrames(2);
            picture(1000);

            expect(deltas).toEqual([want, want, want]);
        }
    });
});
