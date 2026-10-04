import { getActiveBox } from '../../store';
import type { TTimer, TTimerHandle } from './types/t_timer';

/**
 * One call waiting its turn.
 */
type TWaiting = {
    /**
     * Game seconds left until it runs.
     */
    left: number;
    /**
     * For an `every`, how long between runs; `null` for an `after`.
     */
    interval: number | null;
    fn: () => void;
    /**
     * Called off, by its handle or by `cancelAll`. Checked again just before it runs.
     */
    cancelled: boolean;
    /**
     * An `after` that has been queued to run. An `every` never sets it.
     */
    fired: boolean;
};

const isOver = (call: TWaiting): boolean => call.cancelled || call.fired;

/**
 * Runs code later, in game time: once after a while, or again and again.
 *
 * It is what `setTimeout` and `setInterval` would be if they knew about the game. The wait is
 * counted in the same seconds as `useUpdate`'s `delta`, so it stops while the scene is paused,
 * follows `timeScale`, and is gone when the object that asked for it is: a cutscene that waits two
 * seconds still waits two seconds after a pause, and a timer of a scene that ended never fires into
 * the next one. A `setTimeout` does none of the three.
 *
 * Call `useTimer` in the body, like any hook. What it returns can be used from anywhere after that,
 * an update, a click or another timer, so a sequence is just calls that schedule the next step.
 *
 * Several calls due in the same frame run in the order they were due, so a long frame cannot swap
 * the steps of a sequence. One scheduled from inside another runs on a later frame at the soonest.
 *
 * @returns The timer: `after`, `every` and `cancelAll`.
 *
 * @example
 * ```ts
 * export const Level: TSceneFn = () => {
 *     const timer = useTimer();
 *     const banner = createText({ text: 'READY', font, transform: { x: 160, y: 100 } });
 *
 *     timer.after(1.5, () => { banner.text = 'GO!'; });
 *     timer.after(2.5, () => { banner.visible = false; });
 *
 *     // A new enemy every three seconds, for as long as the level runs
 *     timer.every(3, () => { spawnEnemy(); });
 *
 *     return createScene();
 * };
 * ```
 *
 * @category Lifecycle
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const useTimer = (): TTimer => {
    const box = getActiveBox();
    if (box === null) {
        throw new Error('[NacatamalOn] useTimer: call it inside a scene body, not from a timer or a callback.');
    }

    const waiting: TWaiting[] = [];

    // One callback for every call this timer holds, so the loop asks once a frame however many wait.
    box.updateCallbacks.push((delta) => {
        // A copy, taken before any of them runs, so one scheduled from inside another waits for a
        // later frame: the same rule `useTween` and the tree of objects follow.
        const due: Array<{ call: TWaiting; overdue: number }> = [];
        for (const call of [...waiting]) {
            if (isOver(call)) {
                continue;
            }
            call.left -= delta;
            // An `every` shorter than a frame is owed more than one run. Each is queued with how
            // late it is, so they still run in order among the rest.
            while (!call.fired && call.left <= 0) {
                due.push({ call, overdue: -call.left });
                if (call.interval === null) {
                    call.fired = true;
                } else {
                    call.left += call.interval;
                }
            }
        }

        // Most overdue first: in a long frame, the step that was due earlier still runs earlier.
        due.sort((a, b) => b.overdue - a.overdue);
        for (const { call } of due) {
            // Called off by something that ran before it this same frame.
            if (call.cancelled) {
                continue;
            }
            call.fn();
        }

        // Backwards, so removing one does not make the loop skip the next.
        for (let i = waiting.length - 1; i >= 0; i -= 1) {
            if (isOver(waiting[i])) {
                waiting.splice(i, 1);
            }
        }
    });

    const schedule = (left: number, interval: number | null, fn: () => void): TTimerHandle => {
        const call: TWaiting = { left, interval, fn, cancelled: false, fired: false };
        waiting.push(call);
        return {
            cancel: () => { call.cancelled = true; },
            get done() {
                return isOver(call);
            },
        };
    };

    return {
        after: (seconds, fn) => schedule(Math.max(0, seconds), null, fn),
        every: (seconds, fn) => {
            if (!(seconds > 0)) {
                throw new Error(`[NacatamalOn] useTimer: every() needs more than zero seconds between calls, it was given ${seconds}.`);
            }
            return schedule(seconds, seconds, fn);
        },
        cancelAll: () => {
            for (const call of waiting) {
                call.cancelled = true;
            }
        },
    };
};
