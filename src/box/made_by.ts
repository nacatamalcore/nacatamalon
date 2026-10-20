import type { TBox } from './types/t_box';

/**
 * The component each box `useSpawn` made was made from: what a collision asked by component
 * (`useCollisionWith(Enemy, ...)`) matches on. The function itself, not its name, so a published
 * build that shortens names still matches. Weak, so a box gone is forgotten with it.
 */
const madeBy = new WeakMap<TBox, Function>();

/**
 * Remembers that `box` was made from `component`.
 *
 * @internal
 */
export const markMadeBy = (box: TBox, component: Function): void => {
    madeBy.set(box, component);
};

/**
 * The component `box` was made from, or `undefined` for one `useSpawn` did not make.
 *
 * @internal
 */
export const componentOf = (box: TBox): Function | undefined => madeBy.get(box);
