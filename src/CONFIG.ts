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
    pauseOnBlur: true
};

/**
 * Maximum allowed frame delta for the game loop.
 * @internal
 * @since 1.0.0
 */
export const MAX_FRAME_DELTA = 0.25;