/**
 * NacatamalOn with no browser: a game run from Node or Bun, a frame at a time, the same way every
 * time, for checking it from a test or a script.
 *
 * **It answers for the game's logic, not for its look.** The scenes, hooks, updates, tweens, stores
 * and physics run as they do in a page; nothing is drawn, but what would be shown is still worked
 * out, so a test can press keys, run frames and ask where things are and what is on the screen.
 *
 * It is the door `nacatamalon/headless`, apart from the front one because it is never part of a
 * game: it reads files from disk with Node's own modules, which a page has no use for and a game's
 * bundle must not carry.
 *
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export { createHeadlessGame } from './create_headless_game';
export type { THeadlessGame, THeadlessGameOptions, THeadlessPicture } from './types';
