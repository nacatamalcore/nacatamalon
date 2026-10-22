import type { TSfxPreset } from './types/t_song';

/**
 * The kinds of sound effect `renderSfx` makes, in order: what a tool offers to choose from.
 *
 * Written out rather than read off the recipes, so a game that lists them does not carry the code
 * that makes them.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const SFX_PRESETS: readonly TSfxPreset[] = ['coin', 'jump', 'hit', 'explosion', 'crowd', 'cheer', 'whistle', 'bat'];
