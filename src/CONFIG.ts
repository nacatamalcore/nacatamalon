import { getColor } from "./color";
import { GAME_CONFIG } from "./CONST";
import type { TGameOptions } from "./game/types/t_game_options";

/**
 * Default configuration for the game engine.
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const DEFAULT_GAME_OPTIONS: TGameOptions = {
    width: 800,
    height: 600,
    background: getColor('darkviolet'),
    renderer: GAME_CONFIG.RENDER_TYPE.AUTO,
    seed: undefined,
    smooth: false,
    msaa: 1,
    scaling: 'none',
    keep: 'both',
    pauseOnBlur: true,
    step: 'display'
};

/**
 * Maximum allowed frame delta for the game loop.
 * @internal
 * @since 1.0.0
 */
export const MAX_FRAME_DELTA = 0.25;

/**
 * The most fixed steps run before one picture is drawn, for a game with a `step`. A machine that
 * needs more to catch up drops the rest and the game slows down, which is what an overloaded
 * console did, rather than spending ever longer catching up and falling further behind.
 * @internal
 * @since 1.0.0
 */
export const MAX_STEPS_PER_FRAME = 4;

/**
 * The range a `step` may take, in steps a second: fewer is a slideshow, more is past any screen.
 * @internal
 * @since 1.0.0
 */
export const MIN_STEP_RATE = 10;
export const MAX_STEP_RATE = 240;