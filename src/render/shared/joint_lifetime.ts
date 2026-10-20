/**
 * How many frames a skeleton's bones stay on the card after it was last drawn. Every placed model
 * has bones of its own, so an enemy that is born and dies leaves its bones behind; let go of after
 * this long unused, a game spawning enemies for an hour does not fill the card. Long enough that a
 * model hidden for a moment does not have them made again when it shows.
 *
 * One number for both cards, so a game frees its bones at the same moment on either.
 *
 * @internal
 */
export const FORGET_JOINTS_AFTER = 120;
