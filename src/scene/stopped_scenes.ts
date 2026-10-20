import type { TBox } from '../box';

/**
 * The roots of the scenes that have stopped. Weak, so a scene nobody holds any more is forgotten
 * with it. Not "every root not running": a scene being built is not running yet either, and makes
 * its things all the same.
 */
const stopped = new WeakSet<TBox>();

/**
 * Remembers that the scene of `root` has stopped.
 *
 * @internal
 */
export const markSceneStopped = (root: TBox): void => {
    stopped.add(root);
};

/**
 * Whether the scene of `root` has stopped.
 *
 * @internal
 */
export const isSceneStopped = (root: TBox): boolean => stopped.has(root);
