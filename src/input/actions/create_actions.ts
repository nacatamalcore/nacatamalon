import { deadzoneRadial, deadzoneScalar, GAMEPAD_AXES, GAMEPAD_BUTTONS, gamepadAxisIndex } from '../gamepad';
import { bindingKey, DEFAULT_ACTION_DEADZONE, DEFAULT_ACTION_PRESS } from './normalize_action_map';
import type { TGamepad } from '../gamepad';
import type { TKeyboardSource } from '../types/t_keyboard';
import type {
    TActionBinding, TActionCaptureOptions, TActionDef, TActionDevice, TActionMap, TActionName,
    TActionOverrides, TActionsHandle,
} from './types/t_action';

/**
 * How many ports `'any'` listens to.
 */
const ANY_DEVICE_PORTS = 4;

/**
 * One action, worked out into what a frame really needs.
 */
type TCompiled = {
    name: TActionName;
    bindings: readonly TActionBinding[];
    deadzone: number;
    press: number;
};

/**
 * One device's readings.
 *
 * The buffers are swapped rather than copied, like the pads', and they are **per device**, which is
 * what keeps two players reading the same action names from eating each other's presses.
 */
type TRow = {
    device: TActionDevice;
    keyboard: boolean;
    pads: TGamepad[];
    cur: Float32Array;
    prev: Float32Array;
};

/**
 * Someone waiting for the player to press anything.
 */
type TCapture = {
    done: (binding: TActionBinding | null) => void;
    sources: Set<'key' | 'button' | 'axis'>;
    row: TRow;
    cancelKey: string | null;
    threshold: number;
    /**
     * Sticks seen at rest since the wait began: only those can be bound.
     */
    settled: Set<string>;
    offKey: () => void;
};

/**
 * What the action layer needs from the rest of the input.
 *
 * @internal
 */
export type TActionSourceOptions = {
    keyboard: TKeyboardSource;
    /**
     * How a row gets hold of a pad. It has to go through the game's own gamepads and not around
     * them: a port is only asked about once someone holds a handle for it, so a row that read pads
     * by itself would read zeros for ever with nothing in the console to say why.
     */
    gamepad: (index: number) => TGamepad;
    actions?: TActionMap;
};

/**
 * The action layer of one game.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TActionSource = {
    /**
     * The handle a scene reads actions through.
     */
    handle(device?: TActionDevice): TActionsHandle;
    /**
     * Works out every row again. Called by the loop, after the pads have been sampled.
     */
    sample(): void;
    /**
     * The game's map, as installed.
     */
    readonly defs: readonly TActionDef[];
    /**
     * Replaces the game's map. The player's own bindings survive.
     */
    setMap(actions: TActionMap): void;
    /**
     * What an action listens to now: the player's if they changed it, the game's if not.
     */
    bindingsOf(action: TActionName): readonly TActionBinding[];
    /**
     * What the game itself says.
     */
    defaultsOf(action: TActionName): readonly TActionBinding[];
    /**
     * Puts the player's bindings in. Can arrive before or after the map.
     */
    setOverrides(overrides: TActionOverrides): void;
    /**
     * Replaces one action's bindings in the player's layer. `null` removes their change.
     */
    setOverride(action: TActionName, bindings: TActionBinding[] | null): void;
    /**
     * The player's layer.
     */
    overrides(): TActionOverrides;
    /**
     * Waits for the player to press anything.
     */
    capture(done: (binding: TActionBinding | null) => void, options?: TActionCaptureOptions): () => void;
};

export const createActions = (options: TActionSourceOptions): TActionSource => {
    const { keyboard, gamepad } = options;

    let defs: TActionDef[] = [...(options.actions ?? [])];
    const overrideMap = new Map<TActionName, TActionBinding[]>();
    const rows = new Map<string, TRow>();

    let plan: TCompiled[] = [];
    let slots = new Map<TActionName, number>();
    let dirty = true;

    const compile = (): void => {
        plan = defs.map((def) => ({
            name: def.name,
            bindings: overrideMap.get(def.name) ?? def.bindings,
            deadzone: def.deadzone ?? DEFAULT_ACTION_DEADZONE,
            press: def.press ?? DEFAULT_ACTION_PRESS,
        }));
        slots = new Map(plan.map((action, i) => [action.name, i]));
        for (const row of rows.values()) {
            if (row.cur.length < plan.length) {
                row.cur = new Float32Array(plan.length);
                row.prev = new Float32Array(plan.length);
            }
        }
        dirty = false;
    };

    /**
     * Rebuilt at the start of a frame's sample, never at the moment of a rebind. Rebinding from
     * inside an update would otherwise split the frame: whoever already read that action saw the old
     * binding and everyone after sees the new one.
     */
    const ensureCompiled = (): void => {
        if (dirty) {
            compile();
        }
    };

    /**
     * How hard one binding is being pressed, 0 to 1, **raw**: no dead zone anywhere. The dead zone
     * is applied once, later, by whoever asked, which is what keeps a diagonal a diagonal.
     */
    const strengthOf = (binding: TActionBinding, row: TRow): number => {
        if (binding.type === 'key') {
            return row.keyboard && keyboard.isDown(binding.key) ? 1 : 0;
        }
        if (binding.type === 'button') {
            let best = 0;
            // A button's value is already undeadzoned and is analogue on the triggers, so one call
            // covers a digital button and a half pulled trigger alike.
            for (const pad of row.pads) {
                best = Math.max(best, pad.value(binding.button));
            }
            return best;
        }
        let best = 0;
        const axis = gamepadAxisIndex[binding.axis];
        for (const pad of row.pads) {
            const value = pad.rawAxis(axis);
            best = Math.max(best, binding.dir > 0 ? Math.max(0, value) : Math.max(0, -value));
        }
        return best;
    };

    const sampleRow = (row: TRow): void => {
        const retired = row.prev;
        row.prev = row.cur;
        row.cur = retired;
        row.cur.fill(0);

        for (let i = 0; i < plan.length; i++) {
            let best = 0;
            // The strongest source wins. Not the sum: a key gives 1, so key plus trigger would go
            // past 1 and hide the analogue source entirely while the key was held. Not the first
            // that is not zero either: that would depend on the order of a list the editor lets you
            // reorder. The strongest is the same answer whatever the order, and that is a test.
            for (const binding of plan[i].bindings) {
                best = Math.max(best, strengthOf(binding, row));
            }
            row.cur[i] = best;
        }
    };

    const rowFor = (device: TActionDevice): TRow => {
        const key = String(device);
        const existing = rows.get(key);
        if (existing !== undefined) {
            return existing;
        }

        ensureCompiled();
        const pads: TGamepad[] = [];
        if (device === 'any') {
            for (let i = 0; i < ANY_DEVICE_PORTS; i++) {
                pads.push(gamepad(i));
            }
        } else if (typeof device === 'number') {
            pads.push(gamepad(device));
        }

        const row: TRow = {
            device,
            // A keyboard is not a port, so naming a port means pad only, which is exactly what
            // player two wants while player one is on the keys.
            keyboard: device === 'any' || device === 'keyboard',
            pads,
            cur: new Float32Array(plan.length),
            prev: new Float32Array(plan.length),
        };
        rows.set(key, row);
        // Read the moment it exists, and seeded so its first frame reports nothing as just pressed.
        // A row is made when it is first asked for, so one made after this frame's sample would read
        // zeros until the next one: a handle answering "nothing is pressed" while a button is held.
        // Seeding is the same trick a pad uses on the frame it appears, and for the same reason.
        sampleRow(row);
        row.prev.set(row.cur);
        return row;
    };

    /**
     * Whether any of an action's keys reports a keyboard edge this frame.
     */
    const keyEdge = (action: TCompiled, row: TRow, released: boolean): boolean => {
        if (!row.keyboard) {
            return false;
        }
        for (const binding of action.bindings) {
            if (binding.type !== 'key') {
                continue;
            }
            if (released ? keyboard.justReleased(binding.key) : keyboard.justPressed(binding.key)) {
                return true;
            }
        }
        return false;
    };

    /**
     * The dead zone a composed reading uses when none is given: the **strictest** of the actions
     * involved. Not their average: "the strictest of the four" is a sentence somebody can hold in
     * their head, and it is a number that really appears in one of the four actions.
     */
    const widestDeadzone = (names: TActionName[]): number => {
        ensureCompiled();
        let widest = 0;
        for (const name of names) {
            const at = slots.get(name);
            if (at !== undefined) {
                widest = Math.max(widest, plan[at].deadzone);
            }
        }
        return widest;
    };

    const buildHandle = (device: TActionDevice): TActionsHandle => {
        const row = rowFor(device);

        const slotOf = (name: TActionName): number => {
            ensureCompiled();
            return slots.get(name) ?? -1;
        };
        const raw = (name: TActionName): number => {
            const at = slotOf(name);
            return at === -1 ? 0 : row.cur[at];
        };

        return {
            device,
            isDown: (name) => {
                const at = slotOf(name);
                return at !== -1 && row.cur[at] >= plan[at].press;
            },
            justPressed: (name) => {
                const at = slotOf(name);
                if (at === -1) {
                    return false;
                }
                const action = plan[at];
                const rose = row.cur[at] >= action.press && row.prev[at] < action.press;
                // A key's edges come from real events and a pad's from comparing two answers, so an
                // action with a key keeps the keyboard's faithfulness and one on the pad alone
                // inherits the pad's limit.
                return rose || keyEdge(action, row, false);
            },
            justReleased: (name) => {
                const at = slotOf(name);
                if (at === -1) {
                    return false;
                }
                const action = plan[at];
                const fell = row.cur[at] < action.press && row.prev[at] >= action.press;
                return fell || keyEdge(action, row, true);
            },
            value: (name) => {
                const at = slotOf(name);
                return at === -1 ? 0 : deadzoneScalar(row.cur[at], plan[at].deadzone);
            },
            rawValue: raw,
            strength: (negative, positive, deadzone) =>
                deadzoneScalar(raw(positive) - raw(negative), deadzone ?? widestDeadzone([negative, positive])),
            vector: (negX, posX, negY, posY, deadzone) => deadzoneRadial(
                raw(posX) - raw(negX),
                raw(posY) - raw(negY),
                deadzone ?? widestDeadzone([negX, posX, negY, posY]),
            ),
            has: (name) => slotOf(name) !== -1,
            get names() {
                ensureCompiled();
                return plan.map((action) => action.name);
            },
        };
    };

    const captures = new Set<TCapture>();

    /**
     * Stops waiting without reporting anything. What the returned function does.
     */
    const stop = (capture: TCapture): void => {
        if (!captures.delete(capture)) {
            return;
        }
        capture.offKey();
    };

    const finish = (capture: TCapture, binding: TActionBinding | null): void => {
        if (!captures.has(capture)) {
            return;
        }
        stop(capture);
        capture.done(binding);
    };

    /**
     * Looks for what a waiting capture wants. Runs after the rows are read, so an edge is this frame's.
     */
    const pollCapture = (capture: TCapture): void => {
        if (capture.sources.has('button')) {
            for (const pad of capture.row.pads) {
                for (const button of GAMEPAD_BUTTONS) {
                    // Just pressed **is** the arming rule for buttons, for free: one already held
                    // when the wait began cannot report a press until it is let go first.
                    if (pad.justPressed(button)) {
                        finish(capture, { type: 'button', button });
                        return;
                    }
                }
            }
        }
        if (capture.sources.has('axis')) {
            for (const pad of capture.row.pads) {
                for (const axis of GAMEPAD_AXES) {
                    const value = pad.rawAxis(gamepadAxisIndex[axis]);
                    const id = `${pad.index}:${axis}`;
                    // A stick has no press to arm against, so it has to be seen at rest first.
                    // Otherwise a controller held to one side while the box opens binds itself, and
                    // a worn stick that drifts binds itself at random.
                    if (Math.abs(value) < capture.threshold) {
                        capture.settled.add(id);
                        continue;
                    }
                    if (!capture.settled.has(id)) {
                        continue;
                    }
                    finish(capture, { type: 'axis', axis, dir: value > 0 ? 1 : -1 });
                    return;
                }
            }
        }
    };

    return {
        handle: (device = 'any') => buildHandle(device),
        sample: () => {
            ensureCompiled();
            for (const row of rows.values()) {
                sampleRow(row);
            }
            for (const capture of [...captures]) {
                pollCapture(capture);
            }
        },
        capture: (done, captureOptions = {}) => {
            const capture: TCapture = {
                done,
                sources: new Set(captureOptions.sources ?? ['key', 'button', 'axis']),
                row: rowFor(captureOptions.device ?? 'any'),
                cancelKey: captureOptions.cancelKey === undefined ? 'Escape' : captureOptions.cancelKey,
                threshold: captureOptions.axisThreshold ?? 0.7,
                settled: new Set(),
                offKey: () => {},
            };

            // The key event itself and not this frame's edges: a key tapped between two frames can
            // still be bound, which is the faithfulness the keyboard already has.
            capture.offKey = keyboard.onKey((key) => {
                if (!captures.has(capture)) {
                    return;
                }
                if (capture.cancelKey !== null && key === capture.cancelKey) {
                    finish(capture, null);
                    return;
                }
                if (capture.sources.has('key')) {
                    finish(capture, { type: 'key', key });
                }
            });

            captures.add(capture);
            // Cancelling is silent: a screen closing half way through is not the player choosing
            // nothing, and reporting there would clear a binding they never touched. The cancel
            // **key** is different, because that is a choice, and it reports nothing chosen.
            return () => stop(capture);
        },
        get defs() { return defs; },
        setMap: (actions) => {
            defs = [...actions];
            dirty = true;
        },
        bindingsOf: (action) => overrideMap.get(action) ?? defs.find((def) => def.name === action)?.bindings ?? [],
        defaultsOf: (action) => defs.find((def) => def.name === action)?.bindings ?? [],
        setOverrides: (next) => {
            overrideMap.clear();
            for (const [name, bindings] of Object.entries(next)) {
                if (Array.isArray(bindings)) {
                    overrideMap.set(name, [...bindings]);
                }
            }
            dirty = true;
        },
        setOverride: (action, bindings) => {
            if (bindings === null) {
                overrideMap.delete(action);
            } else {
                // Repeats dropped on the way in: the strongest source wins, so a repeat does nothing
                // at runtime and would only be clutter on the screen the player is looking at.
                const seen = new Set<string>();
                const unique: TActionBinding[] = [];
                for (const binding of bindings) {
                    const key = bindingKey(binding);
                    if (seen.has(key)) {
                        continue;
                    }
                    seen.add(key);
                    unique.push(binding);
                }
                overrideMap.set(action, unique);
            }
            dirty = true;
        },
        overrides: () => {
            const out: TActionOverrides = {};
            for (const [name, bindings] of overrideMap) {
                out[name] = bindings.map((binding) => ({ ...binding }));
            }
            return out;
        },
    };
};
