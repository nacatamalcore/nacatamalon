import { afterEach, describe, expect, it } from 'bun:test';
import { createFrameContext } from '../src/game/loop/create_frame_context';
import { createScene } from '../src/scene/create_scene';
import { registerScene } from '../src/scene/register_scene';
import { startScene } from '../src/scene/start_scene';
import { tick } from '../src/game/loop/tick';
import { useUpdate } from '../src/hooks/loop/use_update';
import { useKeyboard } from '../src/hooks/input/use_keyboard';
import { useScene } from '../src/hooks/scene/use_scene';
import { fade } from '../src/transition';
import { cleanGameOptions } from '../src/game/bootstrap/clean_gameoptions';
import { createFakeCanvas, createTestGame } from './helpers/test_game';
import type { TSceneFn } from '../src/scene';
import type { TGameStep } from '../src/game/types/t_game_options';
import type { TSceneHandle } from '../src/hooks/scene/use_scene';

/**
 * `createGame({ step })`: the game moving in steps of exactly `1 / step` seconds whatever the
 * screen, against `'display'`, one update per picture. Driven through the real `tick` with the
 * pictures of a screen of a chosen rate, because what is tested is how pictures turn into steps.
 */

(globalThis as { requestAnimationFrame?: (cb: FrameRequestCallback) => number }).requestAnimationFrame = () => 0;

const key = (type: 'keydown' | 'keyup', name: string): void => {
    globalThis.dispatchEvent(Object.assign(new Event(type), { key: name }));
};

afterEach(() => {
    key('keyup', 'x');
});

/**
 * A game on a screen: `picture(ms)` hands the loop one picture that took that long.
 */
const onScreen = (step: TGameStep, body: TSceneFn) => {
    const { store } = createTestGame({ step }, createFakeCanvas(480, 320));
    const ctx = createFrameContext();
    let now = 0;
    const picture = (ms: number): void => {
        const prev = now;
        now += ms;
        tick(store, ctx, now, prev);
    };
    registerScene(store, 'Level', body);
    startScene(store, 'Level');
    // The first picture measures from itself, so it moves nothing: out of the way.
    tick(store, ctx, 0, 0);
    return { store, ctx, picture };
};

/**
 * A second of a screen at `hz`, one picture at a time.
 */
const runFor = (picture: (ms: number) => void, hz: number, seconds = 1): void => {
    for (let i = 0; i < Math.round(hz * seconds); i++) {
        picture(1000 / hz);
    }
};

describe('a game with a fixed step', () => {
    it('runs sixty steps a second of exactly 1/60 on a 144 Hz screen, a 60 Hz one and a 30 Hz one', () => {
        for (const hz of [144, 60, 30]) {
            const deltas: number[] = [];
            const { picture } = onScreen(60, () => {
                useUpdate((delta) => deltas.push(delta));
                return createScene();
            });

            runFor(picture, hz);

            expect(Math.abs(deltas.length - 60)).toBeLessThanOrEqual(1);
            expect(deltas.every((d) => d === 1 / 60)).toBe(true);
        }
    });

    it('runs one step per picture on a 60 Hz screen whose pictures come a hair early and late', () => {
        const perPicture: number[] = [];
        let count = 0;
        const { picture } = onScreen(60, () => {
            useUpdate(() => { count += 1; });
            return createScene();
        });

        for (let i = 0; i < 120; i++) {
            const before = count;
            picture(i % 2 === 0 ? 16.4 : 16.93);
            perPicture.push(count - before);
        }

        expect(perPicture.every((n) => n === 1)).toBe(true);
    });

    it('takes 50 for PAL', () => {
        const deltas: number[] = [];
        const { picture } = onScreen(50, () => {
            useUpdate((delta) => deltas.push(delta));
            return createScene();
        });

        runFor(picture, 60);

        expect(Math.abs(deltas.length - 50)).toBeLessThanOrEqual(1);
        expect(deltas.every((d) => d === 1 / 50)).toBe(true);
    });

    // The reason the option exists: a jump worked out with gravity, frame by frame.
    it('jumps exactly as high on every screen, where the screen\'s own time does not', () => {
        const jump = (step: TGameStep, hz: number): number => {
            let y = 0;
            let vy = 300;
            let highest = 0;
            const { picture } = onScreen(step, () => {
                useUpdate((delta) => {
                    y += vy * delta;
                    vy -= 900 * delta;
                    highest = Math.max(highest, y);
                });
                return createScene();
            });
            runFor(picture, hz);
            return highest;
        };

        const fixed = [144, 60, 30].map((hz) => jump(60, hz));
        expect(fixed[1]).toBe(fixed[0]);
        expect(fixed[2]).toBe(fixed[0]);

        const display = [144, 60, 30].map((hz) => jump('display', hz));
        expect(Math.abs(display[0] - display[2])).toBeGreaterThan(2);
    });

    it('makes a move written without delta the same speed on every screen', () => {
        const travelled = (hz: number): number => {
            let x = 0;
            const { picture } = onScreen(60, () => {
                useUpdate(() => { x += 2; });
                return createScene();
            });
            runFor(picture, hz);
            return x;
        };

        expect(travelled(144)).toBe(travelled(60));
    });

    it('slows down past four steps a picture rather than jumping ahead', () => {
        let count = 0;
        const { picture } = onScreen(60, () => {
            useUpdate(() => { count += 1; });
            return createScene();
        });

        // Ten pictures a second, each owed six steps.
        runFor(picture, 10);

        expect(count).toBe(40);
    });

    it('runs fewer whole steps in slow motion, each one still exactly a step', () => {
        const deltas: number[] = [];
        const { store, picture } = onScreen(60, () => {
            useUpdate((delta) => deltas.push(delta));
            return createScene();
        });
        store.setState('loop', { ...store.get('loop'), timeScale: 0.5 });

        runFor(picture, 60);

        expect(Math.abs(deltas.length - 30)).toBeLessThanOrEqual(1);
        expect(deltas.every((d) => d === 1 / 60)).toBe(true);
    });

    it('with time stopped, still runs a frame per picture with nothing to move by, as on the screen\'s time', () => {
        const deltas: number[] = [];
        const { store, picture } = onScreen(60, () => {
            useUpdate((delta) => deltas.push(delta));
            return createScene();
        });
        store.setState('loop', { ...store.get('loop'), timeScale: 0 });

        runFor(picture, 60, 0.1);

        expect(deltas.length).toBe(6);
        expect(deltas.every((d) => d === 0)).toBe(true);
    });
});

describe('the input of a game with a fixed step', () => {
    it('keeps a press made on a picture with no step for the next step, and hands it over once', () => {
        const seen: boolean[] = [];
        const { picture } = onScreen(60, () => {
            const keys = useKeyboard();
            useUpdate(() => seen.push(keys.justPressed('x')));
            return createScene();
        });

        // On a 144 Hz screen most pictures carry no step. Find one, then press during it.
        let ran = seen.length;
        do {
            ran = seen.length;
            picture(1000 / 144);
        } while (seen.length !== ran + 1);
        key('keydown', 'x');
        picture(1000 / 144);
        expect(seen.length).toBe(ran + 1);
        // No step on that picture: nobody has read the press yet.
        for (let i = 0; i < 6; i++) {
            picture(1000 / 144);
        }

        expect(seen.filter((pressed) => pressed)).toHaveLength(1);
    });

    it('hands a press to the first of two steps in one picture and not the second', () => {
        const seen: boolean[] = [];
        const { picture } = onScreen(60, () => {
            const keys = useKeyboard();
            useUpdate(() => seen.push(keys.justPressed('x')));
            return createScene();
        });

        key('keydown', 'x');
        picture(1000 / 30);

        expect(seen).toEqual([true, false]);
    });
});

describe('a scene change with a fixed step', () => {
    it('uncovers on real time, even in slow motion where most pictures run no step', () => {
        let handle!: TSceneHandle;
        const { store, picture } = onScreen(60, () => {
            handle = useScene();
            return createScene();
        });
        registerScene(store, 'Next', () => createScene());
        store.setState('loop', { ...store.get('loop'), timeScale: 0.1 });

        handle.change('Next', { transition: fade(0.3) });
        // Well past the 0.3 s it lasts, on real time; at a tenth of the speed it would be 3 s.
        runFor(picture, 60, 0.5);

        expect(store.get('transition').active).toBeNull();
    });
});

describe('the step a game asks for', () => {
    it('is the screen\'s time when it is not given', () => {
        expect(cleanGameOptions({ width: 320, height: 224 }).step).toBe('display');
    });

    it('refuses a rate no game runs at, saying which', () => {
        for (const bad of [0, 5, 500, Number.NaN, 'fast' as unknown as number]) {
            expect(() => cleanGameOptions({ width: 320, height: 224, step: bad })).toThrow('[NacatamalOn] createGame: step must be');
        }
    });
});
