// The magic numbers of the Penner set, under the names easings.net gives them. They are
// deliberately NOT re-exported from `index.ts`: they are shared between curves in this
// folder, not part of the engine's public surface.

/**
 * Back overshoot amount.
 */
export const c1 = 1.70158;

/**
 * Back overshoot for the in-out variant, stronger so the symmetric curve reads the same.
 */
export const c2 = c1 * 1.525;

/**
 * `c1 + 1`: the cubic term's coefficient in the back curves.
 */
export const c3 = c1 + 1;

/**
 * Elastic period for the in/out variants.
 */
export const c4 = (2 * Math.PI) / 3;

/**
 * Elastic period for the in-out variant.
 */
export const c5 = (2 * Math.PI) / 4.5;

/**
 * Bounce amplitude.
 */
export const n1 = 7.5625;

/**
 * Bounce divisor: where each of the four arcs ends.
 */
export const d1 = 2.75;
