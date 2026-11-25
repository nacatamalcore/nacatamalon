import type { TEmphasis } from './emphasis';

/**
 * A sound of a text read aloud. `first`, the one that begins a word; `emphasis`, its word's; `air`,
 * a stop with a puff of air after it.
 *
 * @internal
 */
export type TSaidSound = { name: string; stress: number; first: boolean; emphasis?: TEmphasis; air?: boolean };

/**
 * A pause, and the question it is in or ends: `asksWhat` when it asks what, who or how, rather than
 * for a yes or a no, and `begins` when the question begins in the phrase it ends.
 *
 * @internal
 */
export type TSaidPause = { pause: number; mark: string; asks: boolean; asksWhat: boolean; begins: boolean };

/**
 * @internal
 */
export type TSaidToken = TSaidSound | TSaidPause;

/**
 * Whether a mark ends a sentence rather than a phrase of it.
 *
 * @internal
 */
export const closes = (mark: string): boolean => mark !== ',' && mark !== ';';
