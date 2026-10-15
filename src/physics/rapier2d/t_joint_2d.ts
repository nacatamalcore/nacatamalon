/**
 * A point of the world, in pixels.
 */
type TPoint = { x: number; y: number };

/**
 * A motor on a joint: keeps it turning (a hinge) or sliding (a slider) at a speed, as hard as it can.
 */
type TJointMotor = {
    /**
     * Radians per second for a hinge, pixels per second for a slider. Negative the other way.
     */
    speed: number;
    /**
     * How hard it holds that speed against what resists it. `1` by default; more for a heavy load.
     */
    strength?: number;
};

/**
 * How two bodies are joined, or one body to a point of the world.
 *
 * Every point is **a point of the world** where the scene lays the bodies out, not one measured on
 * either body: a bridge's planks are pinned where they meet, a pendulum where its nail is.
 *
 * - `'hinge'`: pinned together at `at`, each free to turn about it: the planks of a bridge, a door, a
 *   pendulum, a windmill with a `motor`. `limits` bounds the turn, in radians either side of where
 *   it started.
 * - `'rope'`: never further apart than `length` (their distance at the start, by default), and free
 *   to come closer: a hanging lamp, a grappling hook. Tied at `atA` and `atB`, their centres by default.
 * - `'spring'`: pulled back to `length` apart: a platform that bounces, a car's suspension. Said as
 *   how many times a second it bounces, `frequency` (2 by default), and how soon it settles,
 *   `damping` (0 bounces for ever, 1 settles without a bounce; 0.3 by default), so a heavy crate
 *   and a light one bounce alike.
 * - `'slider'`: free to move along `axis` only, through `at` (b's centre by default), without
 *   turning: a platform on a rail, a piston. `limits` bounds the travel, in pixels from where it
 *   started.
 * - `'weld'`: held as they are now, as one: pieces that move together and still collide apart.
 *
 * A hinge or a slider with `friction` slows down: its turning (or sliding) loses that much of itself
 * a second, whatever the bodies weigh, so it settles rather than swinging or rolling on for ever. `2`
 * calms a swing in a few seconds, `5` in about one. Nothing else in the world slows a joint down, so
 * without it a bridge sways as long as the game runs.
 *
 * `collide` says whether the two bodies collide with each other; `false` by default, since joined
 * pieces usually touch, and two planks of a bridge pushing each other apart is not a bridge.
 *
 * @category Physics
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TJoint2d = (
    | { type: 'hinge'; at: TPoint; limits?: [number, number]; motor?: TJointMotor; friction?: number }
    | { type: 'rope'; length?: number; atA?: TPoint; atB?: TPoint }
    | { type: 'spring'; length?: number; frequency?: number; damping?: number; atA?: TPoint; atB?: TPoint }
    | { type: 'slider'; axis: TPoint; at?: TPoint; limits?: [number, number]; motor?: TJointMotor; friction?: number }
    | { type: 'weld' }
) & { collide?: boolean };

/**
 * A joint once made: what lets it go before its bodies do.
 *
 * @category Physics
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TJointHandle2d = {
    /**
     * Lets the two bodies go: a rope cut, a hook let go of, a bridge's plank snapped off. A joint
     * also goes by itself when either of its objects is destroyed.
     */
    destroy: () => void;
};
