import { GAMEPAD_AXES, GAMEPAD_BUTTONS } from '../gamepad';
import { normalizeKey } from '../normalize_key';
import type { TActionBinding, TActionDef, TActionMap } from './types/t_action';

/**
 * What an action's dead zone is when it does not say. The same as the stick's, on purpose.
 *
 * @category Input
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const DEFAULT_ACTION_DEADZONE = 0.2;

/**
 * How far an analogue source travels before it counts as pressed, when the action does not say.
 *
 * A different number from the dead zone on purpose. One number for both would mean 0.5 as the floor
 * for a stick, which is very high: movement through actions would feel dead next to reading the
 * stick, which here sits right beside it.
 *
 * @category Input
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const DEFAULT_ACTION_PRESS = 0.5;

/**
 * A binding as one short string, so two of them can be compared and repeats can be spotted. Used by
 * the controls screen to find conflicts as well.
 *
 * @param binding - The binding.
 * @returns A short string, the same for two bindings that listen to the same thing.
 *
 * @category Input
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const bindingKey = (binding: TActionBinding): string => {
    if (binding.type === 'key') {
        return `key:${normalizeKey(binding.key)}`;
    }
    if (binding.type === 'button') {
        return `button:${binding.button}`;
    }
    return `axis:${binding.axis}:${binding.dir}`;
};

const isBinding = (value: unknown): value is TActionBinding => {
    if (typeof value !== 'object' || value === null) {
        return false;
    }
    const binding = value as Partial<TActionBinding> & { type?: string };
    if (binding.type === 'key') {
        return typeof (binding as { key?: unknown }).key === 'string' && (binding as { key: string }).key.length > 0;
    }
    if (binding.type === 'button') {
        return GAMEPAD_BUTTONS.includes((binding as { button: never }).button);
    }
    if (binding.type === 'axis') {
        const axis = binding as { axis?: never; dir?: unknown };
        return GAMEPAD_AXES.includes(axis.axis as never) && (axis.dir === 1 || axis.dir === -1);
    }
    return false;
};

/**
 * Takes whatever came out of a file and gives back a map the engine can trust: unknown kinds of
 * binding are dropped, keys are written the one way the keyboard writes them, repeats inside one
 * action go (the strongest source wins at runtime, so a repeat would only be clutter in the controls
 * screen), and an action with no name is not an action.
 *
 * Total and quiet about the details: a project file is not a promise, and the game still has to run.
 *
 * @param value - Whatever a file gave back, as `JSON.parse` left it.
 * @returns An input map the engine can trust.
 *
 * @category Input
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const normalizeActionMap = (value: unknown): TActionMap => {
    if (!Array.isArray(value)) {
        return [];
    }

    const map: TActionMap = [];
    const names = new Set<string>();

    for (const entry of value) {
        if (typeof entry !== 'object' || entry === null) {
            continue;
        }
        const def = entry as Partial<TActionDef>;
        if (typeof def.name !== 'string' || def.name.length === 0 || names.has(def.name)) {
            continue;
        }
        names.add(def.name);

        const bindings: TActionBinding[] = [];
        const seen = new Set<string>();
        for (const binding of Array.isArray(def.bindings) ? def.bindings : []) {
            if (!isBinding(binding)) {
                continue;
            }
            const clean: TActionBinding = binding.type === 'key'
                ? { type: 'key', key: normalizeKey(binding.key) }
                : { ...binding };
            const key = bindingKey(clean);
            if (seen.has(key)) {
                continue;
            }
            seen.add(key);
            bindings.push(clean);
        }

        const clean: TActionDef = { name: def.name, bindings };
        if (typeof def.deadzone === 'number' && def.deadzone >= 0 && def.deadzone < 1) {
            clean.deadzone = def.deadzone;
        }
        if (typeof def.press === 'number' && def.press > 0 && def.press <= 1) {
            clean.press = def.press;
        }
        map.push(clean);
    }

    return map;
};
