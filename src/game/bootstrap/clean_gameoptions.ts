import { DEFAULT_GAME_OPTIONS } from "../../CONFIG";
import type { TGameOptions } from "../types/t_game_options";

/**
 * Help to clean the game options and return a cleaned TGameOptions object with default values for missing properties.
 * @param TGameOptions
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const cleanGameOptions = (game_options: TGameOptions ) => {
    const width = game_options.width || DEFAULT_GAME_OPTIONS.width;
    const height = game_options.height || DEFAULT_GAME_OPTIONS.height;
    const background = game_options.background || DEFAULT_GAME_OPTIONS.background;
    const renderer = game_options.renderer || DEFAULT_GAME_OPTIONS.renderer;
    // `??` and not `||`: 0 is a seed like any other, and `||` turned it into a different run every time.
    const seed = game_options.seed ?? DEFAULT_GAME_OPTIONS.seed;
    const smooth = game_options.smooth ?? DEFAULT_GAME_OPTIONS.smooth;
    const msaa = game_options.msaa || DEFAULT_GAME_OPTIONS.msaa;
    const scaling = game_options.scaling ?? DEFAULT_GAME_OPTIONS.scaling;
    const keep = game_options.keep ?? DEFAULT_GAME_OPTIONS.keep;
    const pauseOnBlur = game_options.pauseOnBlur ?? DEFAULT_GAME_OPTIONS.pauseOnBlur;
    // Not in CONFIG either: 1 is not a preference, it is "draw what was asked for".
    const pixelRatio = game_options.pixelRatio ?? 1;
    if (pixelRatio !== 'device' && !(Number.isFinite(pixelRatio) && pixelRatio > 0)) {
        throw new Error(`[NacatamalOn] createGame: pixelRatio must be a number above 0 or 'device', got ${String(pixelRatio)}.`);
    }
    // Not in CONFIG: full screen is a whole monitor, and the pixel-art answer there is a whole
    // multiple, so the default is the one that keeps every game pixel square.
    const fullscreenScaling = game_options.fullscreenScaling ?? 'integer';
    // No default in CONFIG for these two: a game with no actions has an empty map, and one that
    // says nothing about keeping the player's controls does not keep them.
    const actions = game_options.actions ?? [];
    const actionsPersist = game_options.actionsPersist;
    // Nor for the project's screen effects: none is none.
    const post = game_options.post;
    // Nor for the startup line: it is on unless the game says otherwise.
    const banner = game_options.banner ?? true;

    return {
        width,
        height,
        background,
        renderer,
        seed,
        smooth,
        msaa,
        scaling,
        keep,
        pauseOnBlur,
        pixelRatio,
        fullscreenScaling,
        actions,
        actionsPersist,
        post,
        banner
    };

}