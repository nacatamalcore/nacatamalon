import { getColor } from "./color";
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
    background: /* @__PURE__ */ getColor('darkviolet'),
    renderer: 'AUTO',
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

/**
 * How many lights shine on one thing drawn: each model is lit by the eight that reach it most.
 *
 * Eight is not a number picked out of the air: it is what the hardware of this engine's era
 * offered, and it offered it per thing drawn, not per scene. The GameCube's GX had eight, each of
 * them free to be a sun, a lamp or a torch; the N64 did seven and an ambient; the fixed pipeline the
 * Dreamcast era was written against also stopped at eight. A level could hold dozens of torches,
 * because each model only saw the ones near it. Ambient lights do not count against it.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const MAX_LIGHTS = 8;

/**
 * How many lights a scene holds at a time, from which each model takes the eight that reach it
 * most (`MAX_LIGHTS`): enough for a long corridor of torches or a street of lamps. Past it the rest
 * are dropped in the order they were made, once, with a warning. Ambient lights do not count.
 *
 * What it costs is a block of the scene's lights sent once a frame (two kilobytes) and choosing each
 * model's eight on the way; what a corner of a model costs to light stays eight lights at most.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const MAX_SCENE_LIGHTS = 32;

/**
 * How many collision layers a scene has: **the smaller of the two backends**, not a number chosen
 * for taste.
 *
 * Rapier2D packs what a body is and what it hits into one 32-bit number, 16 bits each, so 16 is its
 * hard ceiling; the 3D side could carry far more. The format takes the smaller, because a scene
 * using layer 20 would simulate in three dimensions and collide wrongly in two without a word said,
 * which is the backend-dependent meaning `TPhysicsSurface` exists to prevent.
 *
 * Sixteen is also more than a game of this era uses: most projects name fewer than eight.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const PHYSICS_LAYERS = 16;

/**
 * As many colours as a palette may hold.
 *
 * Two hundred and fifty-six, which is more than any machine of the era ever showed at once, and the
 * ceiling exists because matching walks every colour for every pixel: a palette of ten thousand
 * would be a frame that never finishes rather than an error anybody could see.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const MAX_PALETTE_COLORS = 256;

/**
 * How far a stick or a trigger moves before it counts, when nothing says: the pad's, and an
 * action's. One number for both on purpose, so moving with the stick and moving through an action
 * start at the same place.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const DEFAULT_DEADZONE = 0.2;

/**
 * How far an analogue source travels before it counts as pressed, when the action does not say.
 *
 * A different number from the dead zone on purpose. One number for both would mean 0.5 as the floor
 * for a stick, which is very high: movement through actions would feel dead next to reading the
 * stick, which here sits right beside it.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const DEFAULT_ACTION_PRESS = 0.5;

/**
 * How far a press has to move, in pixels of the page, before it is a drag and no longer a click.
 * Measured on the page and not in the game's pixels, so a game shown four times its size does not
 * need the hand to travel four times as far. A finger gets more room: it shakes as it lands.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const DRAG_SLOP = { mouse: 4, pen: 4, touch: 10 } as const;
