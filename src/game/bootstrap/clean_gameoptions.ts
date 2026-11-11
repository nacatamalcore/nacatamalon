import { getColor } from '../../color';
import { cleanLayerNames } from '../../physics/layer_names';
import { DEFAULT_GAME_OPTIONS, MAX_STEP_RATE, MIN_STEP_RATE } from "../../DEFAULTS";
import type { TGameOptions, TPixelSnap } from "../types/t_game_options";
import type { TRendererType } from "../../render/interface/t_renderer_capabilities";
import { CANVAS_ALIGNS } from '../../DOM/types/t_canvas_align';

/** Every renderer a game can ask for. */
const RENDERERS: readonly TRendererType[] = ['AUTO', 'WEBGPU', 'WEBGL2'];

/** Every way a game can draw on pixels. */
const PIXEL_SNAPS: readonly TPixelSnap[] = ['screen', 'game', 'off'];

/**
 * Help to clean the game options and return a cleaned TGameOptions object with default values for missing properties.
 * @param TGameOptions
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const cleanGameOptions = (game_options: TGameOptions ) => {
    // What the game says, then its style's, then the default: the style sets them, the game rewrites.
    // The two are one decision, taken from one place: a game that says either says the resolution,
    // and a style that gives only one of them gives none.
    const style = game_options.style;
    const sized = game_options.width || game_options.height
        ? game_options
        : style?.width && style.height ? style : DEFAULT_GAME_OPTIONS;
    const width = sized.width || DEFAULT_GAME_OPTIONS.width!;
    const height = sized.height || DEFAULT_GAME_OPTIONS.height!;
    // `??` and not `||`: black written as a number is 0, and `||` turned it into the default.
    const background = getColor(game_options.background ?? DEFAULT_GAME_OPTIONS.background!);
    // Read in capitals whatever way it is written: 'webgl2' is what a person means by 'WEBGL2'. Not
    // said is AUTO; anything else that is not one of the names is refused, a `true` or an empty
    // name as much as a misspelt one, rather than drawn with whichever card there is.
    const asked: unknown = game_options.renderer ?? DEFAULT_GAME_OPTIONS.renderer;
    const renderer = (typeof asked === 'string' ? asked.toUpperCase() : asked) as TRendererType;
    if (!RENDERERS.includes(renderer)) {
        throw new Error(`[NacatamalOn] createGame: renderer must be ${RENDERERS.map((name) => `'${name}'`).join(', ')}, got ${String(game_options.renderer)}.`);
    }
    // `??` and not `||`: 0 is a seed like any other, and `||` turned it into a different run every time.
    const seed = game_options.seed ?? DEFAULT_GAME_OPTIONS.seed;
    const smooth = game_options.smooth ?? game_options.style?.smooth ?? DEFAULT_GAME_OPTIONS.smooth!;
    // The screen scaled up the way the pictures are read (`null`, following `smooth` as it changes),
    // unless the game or its style says otherwise.
    const smoothScaling = game_options.smoothScaling ?? game_options.style?.smoothScaling ?? null;
    // Follows `smooth` unless it says: pixel art is drawn on whole pixels, smooth pictures between them.
    // Anything but the three names is refused, a `true` from before there were three as much as a
    // misspelt one, rather than guessed at.
    const pixelSnap: TPixelSnap = game_options.pixelSnap ?? (smooth ? 'off' : 'screen');
    if (!PIXEL_SNAPS.includes(pixelSnap)) {
        throw new Error(`[NacatamalOn] createGame: pixelSnap must be ${PIXEL_SNAPS.map((name) => `'${name}'`).join(', ')}, got ${String(game_options.pixelSnap)}.`);
    }
    const pixelAspect = game_options.pixelAspect ?? game_options.style?.pixelAspect ?? DEFAULT_GAME_OPTIONS.pixelAspect!;
    if (!(typeof pixelAspect === 'number' && Number.isFinite(pixelAspect) && pixelAspect > 0)) {
        throw new Error(`[NacatamalOn] createGame: pixelAspect must be a number above 0 (1 for square pixels, 8 / 7 for the NES and the SNES), got ${String(game_options.pixelAspect)}.`);
    }
    const msaa = game_options.msaa || DEFAULT_GAME_OPTIONS.msaa;
    const scaling = game_options.scaling ?? DEFAULT_GAME_OPTIONS.scaling;
    const keep = game_options.keep ?? DEFAULT_GAME_OPTIONS.keep;
    const pauseOnBlur = game_options.pauseOnBlur ?? DEFAULT_GAME_OPTIONS.pauseOnBlur;
    const pixelRatio = game_options.pixelRatio ?? DEFAULT_GAME_OPTIONS.pixelRatio!;
    if (pixelRatio !== 'device' && !(Number.isFinite(pixelRatio) && pixelRatio > 0)) {
        throw new Error(`[NacatamalOn] createGame: pixelRatio must be a number above 0 or 'device', got ${String(pixelRatio)}.`);
    }
    const fullscreenScaling = game_options.fullscreenScaling ?? DEFAULT_GAME_OPTIONS.fullscreenScaling!;
    // No default: left out, the page says where the game goes (see `TGameOptions.align`).
    const align = game_options.align;
    if (align !== undefined && !CANVAS_ALIGNS.includes(align)) {
        throw new Error(`[NacatamalOn] createGame: align must be ${CANVAS_ALIGNS.map((name) => `'${name}'`).join(', ')}, got ${String(align)}.`);
    }
    // A copy, since the default is every game's.
    const actions = game_options.actions ?? [...DEFAULT_GAME_OPTIONS.actions!];
    // A game that says nothing about keeping the player's controls does not keep them.
    const actionsPersist = game_options.actionsPersist;
    // A game that names no layers says them by number.
    const physicsLayers = cleanLayerNames(game_options.physicsLayers);
    const contextMenu = game_options.contextMenu ?? DEFAULT_GAME_OPTIONS.contextMenu!;
    const debug = game_options.debug ?? DEFAULT_GAME_OPTIONS.debug!;
    // No screen effects is none.
    const post = game_options.post;
    const banner = game_options.banner ?? DEFAULT_GAME_OPTIONS.banner!;
    const splash = game_options.splash ?? DEFAULT_GAME_OPTIONS.splash!;
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
        smoothScaling,
        pixelSnap,
        pixelAspect,
        msaa,
        scaling,
        keep,
        pauseOnBlur,
        pixelRatio,
        fullscreenScaling,
        align,
        actions,
        actionsPersist,
        physicsLayers,
        contextMenu,
        debug,
        post,
        style,
        banner,
        splash,
        step
    };

}