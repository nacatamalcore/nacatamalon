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
 * How fast a retro body may go, in pixels per second on each axis on its own: a platformer's
 * character runs at one speed and falls at another.
 *
 * @category Physics
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TRetroMaxSpeed = { x: number; y: number };

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
    collider: TRetroCollider2d;
    /**
     * How much of its speed it keeps when something stops it, `0` to `1`. The body's own, and not
     * mixed with what it hit: a ball at `1` comes off every wall as fast as it arrived.
     */
    bounce: number;
    /**
     * Pixels per second squared slowing each axis towards stopping, `0` for none: the slide of
     * a character who lets go of the pad.
     */
    drag: number;
    /**
     * The fastest it goes on each axis, or `null` for no limit.
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
};
