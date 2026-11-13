import { DEFAULT_ACTION_PRESS, DEFAULT_DEADZONE } from '../DEFAULTS';
import { deadzoneRadial, deadzoneScalar } from '../input/gamepad/deadzone';
import type { TActionDef, TActionName, TActionsHandle } from '../input';

/**
 * A player's actions as numbers: how far each is pressed, which went down and up in the step, and
 * for how long each has been held. What came over the line on the server, and what a player's game
 * wrote down of its own steps to run them again.
 *
 * @internal
 */
export type TInputState = {
    values: Record<string, number>;
    pressed: ReadonlySet<string>;
    released: ReadonlySet<string>;
    held: ReadonlyMap<string, number>;
};

const NOTHING: ReadonlySet<string> = new Set();

/**
 * Nothing pressed.
 *
 * @internal
 */
export const neutralInput = (): TInputState => ({ values: {}, pressed: NOTHING, released: NOTHING, held: new Map() });

/**
 * The actions of `read()` as a scene reads its own: the same handle `useActions` gives, with the
 * game's own map for what counts as pressed and the dead zones. `pressedAt` has no moment to give,
 * as the moment was on the player's machine, and says `null`.
 *
 * @internal
 */
export const createInputHandle = (defsOf: () => readonly TActionDef[], read: () => TInputState): TActionsHandle => {
    const def = (name: TActionName): TActionDef | undefined => defsOf().find((each) => each.name === name);
    const press = (name: TActionName): number => def(name)?.press ?? DEFAULT_ACTION_PRESS;
    const raw = (name: TActionName): number => read().values[name] ?? 0;
    const widest = (names: TActionName[]): number => Math.max(0, ...names.map((name) => def(name)?.deadzone ?? DEFAULT_DEADZONE));
    return {
        device: 'any',
        isDown: (name) => raw(name) >= press(name),
        justPressed: (name) => read().pressed.has(name),
        pressedAt: () => null,
        justReleased: (name) => read().released.has(name),
        heldFor: (name) => read().held.get(name) ?? 0,
        value: (name) => deadzoneScalar(raw(name), def(name)?.deadzone ?? DEFAULT_DEADZONE),
        rawValue: raw,
        strength: (negative, positive, deadzone) => deadzoneScalar(raw(positive) - raw(negative), deadzone ?? widest([negative, positive])),
        direction: (negX, posX, negY, posY, deadzone) => deadzoneRadial(
            raw(posX) - raw(negX),
            raw(posY) - raw(negY),
            deadzone ?? widest([negX, posX, negY, posY]),
        ),
        has: (name) => def(name) !== undefined,
        get names() {
            return defsOf().map((each) => each.name);
        },
    };
};
