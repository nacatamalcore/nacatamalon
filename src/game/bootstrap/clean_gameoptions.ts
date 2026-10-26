import { getColor } from '../../color';
import { cleanLayerNames } from '../../physics/layer_names';
import { DEFAULT_GAME_OPTIONS, MAX_STEP_RATE, MIN_STEP_RATE } from "../../CONFIG";
import type { TGameOptions } from "../types/t_game_options";
import type { TRendererType } from "../../render/interface/t_renderer_capabilities";

/** Every renderer a game can ask for. */
const RENDERERS: readonly TRendererType[] = ['AUTO', 'WEBGPU', 'WEBGL2'];

/**
 * Help to clean the game options and return a cleaned TGameOptions object with default values for missing properties.
 * @param TGameOptions
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const cleanGameOptions = (game_options: TGameOptions ) => {
    const width = game_options.width || DEFAULT_GAME_OPTIONS.width;
    const height = game_options.height || DEFAULT_GAME_OPTIONS.height;
    // `??` and not `||`: black written as a number is 0, and `||` turned it into the default.
    const background = getColor(game_options.background ?? DEFAULT_GAME_OPTIONS.background!);
    // Read in capitals whatever way it is written: 'webgl2' is what a person means by 'WEBGL2'.
    const asked: unknown = game_options.renderer;
    const renderer = (typeof asked === 'string' && asked !== '' ? asked.toUpperCase() : DEFAULT_GAME_OPTIONS.renderer) as TRendererType;
    if (!RENDERERS.includes(renderer)) {
        throw new Error(`[NacatamalOn] createGame: renderer must be ${RENDERERS.map((name) => `'${name}'`).join(', ')}, got ${String(game_options.renderer)}.`);
    }
    // `??` and not `||`: 0 is a seed like any other, and `||` turned it into a different run every time.
    const seed = game_options.seed ?? DEFAULT_GAME_OPTIONS.seed;
    const smooth = game_options.smooth ?? DEFAULT_GAME_OPTIONS.smooth;
    // Follows `smooth` unless it says: pixel art is drawn on whole pixels, smooth pictures between them.
    const pixelSnap = game_options.pixelSnap ?? !smooth;
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
    // Nor for the layers' names: a game that names none says them by number.
    const physicsLayers = cleanLayerNames(game_options.physicsLayers);
    // Nor for the browser's menu: the right button is the game's unless it says otherwise.
    const contextMenu = game_options.contextMenu ?? false;
    // Nor for the project's screen effects: none is none.
    const post = game_options.post;
    // Nor for the startup line: it is on unless the game says otherwise.
    const banner = game_options.banner ?? true;
    // Nor for the splash: off unless the game asks for it.
    const splash = game_options.splash ?? false;
    const step = game_options.step ?? DEFAULT_GAME_OPTIONS.step!;
    if (step !== 'display' && !(Number.isFinite(step) && step >= MIN_STEP_RATE && step <= MAX_STEP_RATE)) {
        throw new Error(`[NacatamalOn] createGame: step must be 'display' or a number of steps a second from ${MIN_STEP_RATE} to ${MAX_STEP_RATE} (60, or 50 for PAL), got ${String(step)}.`);
    }

    return {
        width,
        height,
        background,
        renderer,
        seed,
        smooth,
        pixelSnap,
        msaa,
        scaling,
        keep,
        pauseOnBlur,
        pixelRatio,
        fullscreenScaling,
        actions,
        actionsPersist,
        physicsLayers,
        contextMenu,
        post,
        banner,
        splash,
        step
    };

}