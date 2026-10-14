import type { MOTION_EASES } from '../motion_eases';

/**
 * The name of a curve a motion moves along between two keys: one of the engine's easing curves,
 * `'linear'` for the same speed all the way.
 *
 * @category Animation
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TMotionEase = keyof typeof MOTION_EASES;

/**
 * One key of a track: the value it has at a moment.
 *
 * @category Animation
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TMotionKey = {
    /**
     * When, in seconds from the start of the motion.
     */
    t: number;
    /**
     * What the value is then. A number moves towards the next key; `true` or `false` (whether
     * something is seen) holds until the next key, since there is nothing between the two.
     */
    v: number | boolean;
    /**
     * The curve of the stretch that **arrives** at this key, from the one before. Default `'linear'`.
     * Ignored on the first key, which nothing arrives at.
     */
    ease?: TMotionEase;
};

/**
 * One value moved over time: which box, which part of it, which field, and its keys.
 *
 * A box is named the way the scene document names it, by its id, so the track and the box an editor
 * shows are the same one whatever the box is called. The name is kept beside it for reading and as a
 * second way in: a copy of a reusable box has another id each time it is placed.
 *
 * @category Animation
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TMotionTrack = {
    /**
     * The box, by its id in the scene document. Empty for a track of a screen effect (`post`).
     */
    box: string;
    /**
     * Its name, for reading, and to find it by when no box has that id.
     */
    name?: string;
    /**
     * One of its components, by id, when the field is the component's (a sprite's tint, a camera's
     * zoom). Absent for the box's own placement.
     */
    component?: string;
    /**
     * One of the game's screen effects (its post chain), by its name, when the field is the
     * effect's: `uniforms.strength`, or `enabled`. A screen effect belongs to the game and not to a
     * box, so such a track names no box.
     */
    post?: string;
    /**
     * The field, as a path of dots: `x`, `scaleY`, `rotation` on the box; `zoom` or `transform.x` on
     * a camera; `tint.a`, `visible`, `width` on a picture or a text; `uniforms.amount` on a picture
     * with a material (its own value, or its material's until it has one).
     */
    path: string;
    /**
     * In order of time, at least one.
     */
    keys: TMotionKey[];
};

/**
 * Something that happens at a moment of a motion, once each time it is played past.
 *
 * - `sound` plays a sound, music or song a box carries, by the box and the component's id.
 * - `scene` changes to another scene, covered by a transition if one is given.
 * - `mark` only has a name: a behaviour listens for it with `on(name, …)` on the motion it plays.
 *
 * @category Animation
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TMotionEvent =
    | { t: number; kind: 'sound'; box: string; name?: string; component: string }
    | { t: number; kind: 'scene'; scene: string; transition?: TMotionTransition }
    | { t: number; kind: 'mark'; name: string };

/**
 * The cover a `scene` event changes under: one of the engine's transitions, by name, and how long it
 * takes in milliseconds.
 *
 * @category Animation
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TMotionTransition = {
    type: 'fade' | 'wipe' | 'iris' | 'pixelate';
    ms?: number;
};

/**
 * A `.motion` file: values of a scene moved over time by keys, and what happens on the way. What an
 * editor's motion panel writes, and what `useMotion` (or a `motion` component) plays.
 *
 * Movement placed by hand lives here rather than in a behaviour: a camera sweeping a field, a logo
 * coming in, a menu opening. Movement that answers the game (a ball's flight, an enemy chasing) is a
 * behaviour's, with `useTween` or the update.
 *
 * @category Animation
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TMotionDoc = {
    format: typeof MOTION_FORMAT;
    version: number;
    /**
     * How long it lasts, in seconds. A key after it is never reached.
     */
    duration: number;
    /**
     * Whether it starts again from the beginning once it ends. Default `false`.
     */
    loop?: boolean;
    tracks: TMotionTrack[];
    events: TMotionEvent[];
};

/**
 * What a `.motion` file says it is, checked on the way in.
 *
 * @category Animation
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const MOTION_FORMAT = 'nacatamalon-motion';

/**
 * The version of the format written today. A file with a higher one is read anyway, and warned about.
 *
 * @category Animation
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const MOTION_VERSION = 1;
