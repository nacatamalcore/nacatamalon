import type { TPhysicsBodyType } from './t_physics';

/**
 * The shape a retro body collides with, **centred on where the object is**, like every flat collider
 * of this engine (see `TCollider2d` for why centred).
 *
 * Two shapes and no turning, and that is the point of the retro half: a box that stays square to the
 * screen and a ball are what the games of the era collided with, and two of each meet with a few
 * comparisons a frame and the same answer on every machine. The object can still be drawn turned;
 * what it collides with does not turn with it.
 *
 * @category Physics
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TRetroCollider2d =
    | { shape: 'rect'; width: number; height: number }
    | { shape: 'circle'; radius: number };

/**
 * How fast a retro body may go, in pixels per second: one number for its whole speed, whichever way
 * it goes (a ship seen from above), or one for each axis on its own (a platformer's character runs
 * at one speed and falls at another).
 *
 * @category Physics
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TRetroMaxSpeed = number | { x: number; y: number };

/**
 * How much of its speed a retro body keeps when something stops it, `0` to `1`: one number for every
 * way, or one for each axis (a ball that keeps all its speed off the walls and half off the floor).
 *
 * @category Physics
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TRetroBounce = number | { x: number; y: number };

/**
 * Which sides of a retro body stop what comes against them. A platform with only `up` is one you
 * jump through from below and stand on from above.
 *
 * @category Physics
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TRetroSides = { up: boolean; down: boolean; left: boolean; right: boolean };

/**
 * What a retro body does at the edges of its world: goes on past them (`'pass'`), is stopped by them
 * like by a wall (`'stop'`), or comes back in by the opposite edge (`'wrap'`), as the ships and rocks
 * of the old space games did.
 *
 * @category Physics
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TRetroBounds = 'pass' | 'stop' | 'wrap';

/**
 * A retro collider on an object: what it is, how it moves, and what it is made of.
 *
 * **The retro half of physics.** Bodies that never turn, moved in pixels a fixed step at a time and
 * stopped against each other axis by axis, the way the old games did: nothing to load, the same
 * result on every machine. It lives in the same place on the object as a collider of the full
 * simulation (`physics`), because an object has one body, whichever half moves it. It is installed
 * apart (`installRetroPhysics2d()` from `nacatamalon/retro-physics2d`) and the two can run in one game:
 * each moves its own bodies, and the two halves do not collide with each other.
 *
 * Every field is required, as on the full simulation's surface: this is the written-down truth of a
 * scene, and an absent value would mean "whatever the reader does".
 *
 * Where it is is **not** here: the object owns that, as it does for every component.
 *
 * @category Physics
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TRetroBody2d = {
    _type: 'retro-body-2d';
    id: string;
    name: string;
    /**
     * `'static'` never moves; `'dynamic'` moves by its speed, falls and is pushed; `'kinematic'`
     * moves by its speed, pushes and is never pushed: a lift, a platform on rails.
     */
    body: TPhysicsBodyType;
    /**
     * What it collides with, read every step: give it a new one at any moment (a hero a mushroom
     * makes big, `record.collider = { shape: 'rect', width: 14, height: 28 }`), or scale the object.
     * A dynamic body standing when its size changes keeps its feet where they were, so it grows up
     * from the floor and shrinks down to it, and it comes out of any solid tile it grew into.
     */
    collider: TRetroCollider2d;
    /**
     * Whether it is simulated: off, it neither moves nor stops anything, and touches nothing, until it
     * is on again. The object stays where it is, and the game can move it.
     */
    enabled: boolean;
    /**
     * How much of its speed it keeps when something stops it, `0` to `1`, for every way or for each
     * axis. The body's own, and not mixed with what it hit: a ball at `1` comes off every wall as fast
     * as it arrived.
     */
    bounce: TRetroBounce;
    /**
     * Pixels per second squared slowing each axis towards stopping, `0` for none: the slide of
     * a character who lets go of the pad.
     */
    drag: number;
    /**
     * The fastest it goes, whole or on each axis, or `null` for no limit.
     */
    maxSpeed: TRetroMaxSpeed | null;
    /**
     * How much of the world's gravity pulls it: `1` all of it, `0` none (a bullet, a scene seen
     * from above), `-1` upwards.
     */
    gravityScale: number;
    /**
     * How a push between two dynamic bodies is shared: the lighter one gives way more. Set directly,
     * because a retro body has no material to weigh.
     */
    mass: number;
    /**
     * Whether other dynamic bodies can push it. `false` is a body that still falls, moves and is
     * stopped by walls, but stands like a wall to the others: a player enemies cannot shove. What is
     * driven (`'kinematic'`) still pushes it.
     */
    pushable: boolean;
    /**
     * Which of its sides stop what comes against them. All four by default; only `up` makes a
     * platform to jump through from below and stand on from above.
     */
    solidSides: TRetroSides;
    /**
     * What it does at the edges of its world (`bounds` on the world): pass, stop, or wrap.
     */
    bounds: TRetroBounds;
    /**
     * How much of its own movement it gives to what stands on it, `0` to `1`: `1` carries a rider all
     * the way, `0` slides out from under it, like ice on rails.
     */
    carries: number;
    /**
     * Notices overlaps without stopping anything: a checkpoint, a pickup, a place that hurts.
     */
    sensor: boolean;
    /**
     * The layer it is on and a mask of the layers it collides with, both as on the full simulation's
     * surface (see `TPhysicsSurface`), and mutual in the same way.
     */
    layer: number;
    collidesWith: number;
};

/**
 * The retro simulation's settings for one scene: how hard things fall, in pixels per second squared
 * with +y down, like the full flat simulation's. Lives on the scene's root.
 *
 * @category Physics
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TRetroWorld2d = {
    _type: 'retro-world-2d';
    id: string;
    gravity: { x: number; y: number };
    /**
     * The world's edges, for bodies that stop or wrap at them, in the world's pixels; `null` for the
     * game's screen, from its top left corner.
     */
    bounds: { x: number; y: number; width: number; height: number } | null;
    /**
     * How fast its time goes: `1` as the game's, `0.5` in slow motion, `0` paused. Read every frame,
     * so changing it on the world `useRetroWorld2d` gave back slows the world from then on.
     */
    timeScale: number;
};
