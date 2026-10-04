import type { TGameObject } from '../../hooks/spawn/use_spawn';
import type { TGameSignal } from '../../signal';
// How a body moves is the engine's own word for it, the same one a scene writes down.
import type { TPhysicsBodyType } from '../types/t_physics';
export type { TPhysicsBodyType };

/**
 * The non-geometric properties of a collider: how it responds to a contact, and whether it
 * resolves the contact at all.
 *
 * @category Physics
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TColliderSurface2d = {
    /**
     * How much approach speed survives as separation speed, 0..1.
     *
     * Careful: restitution belongs to the **pair**, not to this body. Rapier combines the two
     * colliders' values, by default by averaging them, so a ball asking for `0.8` landing on a
     * floor that never set one (and is therefore `0`) bounces at `0.4`. Set both sides.
     */
    restitution?: number;
    friction?: number;
    density?: number;
    /**
     * Make this a **sensor**: it detects overlaps but never resolves them, so things pass
     * straight through. This is the trigger volume (a checkpoint, a pickup, a damage zone)
     * and it is the case `onEnter`/`onExit` exist for.
     *
     * A sensor enables collision events on creation without waiting to be asked, unlike a solid
     * body: a sensor that reports nothing does nothing at all, so there is no configuration in
     * which the opt-in would be the right default.
     */
    sensor?: boolean;
    /**
     * Which collision layer this body is on (`0..15`) and which layers it collides with (a
     * bitmask): see the engine's `TPhysicsSurface`. The relationship is **mutual**: a bullet listing
     * "walls" passes straight through unless walls also list "bullets". Omitted means layer 0
     * against everything, which is how every body behaved before layers existed.
     */
    layer?: number;
    collidesWith?: number;
};

/**
 * Circular shape options.
 *
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TCircleShapeOptions = {
    shape: 'circle';
    radius: number;
} & TColliderSurface2d;

/**
 * Rectangular shape options.
 *
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TRectShapeOptions = {
    shape: 'rect';
    width: number;
    height: number;
} & TColliderSurface2d;

/**
 * Polygonal shape options.
 *
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TPolygonShapeOptions = {
    shape: 'polygon';
    vertices: Array<[number, number]>;
} & TColliderSurface2d;

/**
 * Union of all shape options.
 *
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TShapeOptions = TCircleShapeOptions | TRectShapeOptions | TPolygonShapeOptions;

/**
 * Body creation options, combined with a shape.
 *
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TBodyOptions = {
    type: TPhysicsBodyType;
} & TShapeOptions;

/**
 * World initialization options.
 *
 * @category Physics
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TPhysicsWorldOptions2d = {
    gravity?: {
        x: number;
        y: number;
    };
};

/**
 * Handle to a physics body registered in the world.
 *
 * @category Physics
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TPhysicsBodyHandle2d = {
    /**
     * Fires when another body starts touching this one, carrying **the other body's box**.
     * The engine's own signal, so connect it with `useSignal` and the disconnect rides
     * the box's teardown:
     *
     * ```ts
     * const bullet = usePhysicsCircle(sprite, { world, type: 'dynamic', radius: 3 });
     * useSignal(bullet.onEnter, (other) => { if (other.name.startsWith('tank')) destroy(other); });
     * ```
     *
     * **Reading this property is the opt-in.** Rapier reports contacts only for colliders that
     * asked for them, and asking has a cost the rest of a scene should not pay, so the flag is
     * set the first time you touch `onEnter`/`onExit`, not when the body is created. The upshot
     * is that you never configure anything, and a pile of a thousand event-less crates stays as
     * cheap as it was before this existed.
     *
     * Only one of the two bodies needs to have opted in for the contact to be reported, which is
     * why a bullet can listen for hits against walls that know nothing about it.
     */
    readonly onEnter: TGameSignal<TGameObject>;

    /**
     * Fires when another body stops touching this one, carrying the other body's box. Same
     * opt-in-by-reading rule as `onEnter`.
     *
     * Note that a body coming to rest **on** another never emits this: it is still touching.
     */
    readonly onExit: TGameSignal<TGameObject>;

    /**
     * Apply an instantaneous impulse (momentum change) at the body's center.
     */
    applyImpulse: (x: number, y: number) => void;

    /**
     * Apply a continuous force (acceleration) each frame.
     */
    applyForce: (x: number, y: number) => void;

    /**
     * Set the linear velocity directly.
     */
    setLinearVelocity: (vx: number, vy: number) => void;

    /**
     * Set the angular velocity (rotation speed).
     */
    setAngularVelocity: (w: number) => void;

    /**
     * Moves the body to another collision layer, and changes what it collides with, while the game
     * runs: a player who passes through enemies for a moment after being hit, a ball that stops
     * meeting the pegs once it has bounced. The same two values the body was created with (see the
     * engine's `TPhysicsSurface`), and the same mutual rule: two bodies meet only if each one's mask
     * includes the other's layer.
     *
     * `collidesWith` left out keeps the mask the body already had. The object's physics record is
     * updated too, so a scene saved afterwards keeps the layers it is simulating with.
     */
    setLayers: (layer: number, collidesWith?: number) => void;

    /**
     * Takes the body out of the simulation and leaves the object where it is, still drawn and
     * still running its code: a coin that stops colliding while it plays its pick-up animation.
     * Destroying the object does this on its own. Safe to call twice, and a push through this handle
     * afterwards does nothing.
     */
    destroy: () => void;
};

/**
 * The physics world interface returned by usePhysicsWorld.
 *
 * @category Physics
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TPhysicsWorldHandle2d = {
    /**
     * Register a circular rigid body on an object.
     */
    addCircle: (box: TGameObject, options: { type: TPhysicsBodyType } & TColliderSurface2d & { radius: number }) => TPhysicsBodyHandle2d;

    /**
     * Register a rectangular rigid body on an object.
     */
    addRect: (box: TGameObject, options: { type: TPhysicsBodyType } & TColliderSurface2d & { width: number; height: number }) => TPhysicsBodyHandle2d;

    /**
     * Register a polygonal rigid body on an object.
     */
    addPolygon: (box: TGameObject, options: { type: TPhysicsBodyType } & TColliderSurface2d & { vertices: Array<[number, number]> }) => TPhysicsBodyHandle2d;

    /**
     * The body already registered for `box`, or `null` if it has none.
     *
     * **This is how a game reaches a body, whichever way the scene was written**, and the reason
     * it exists at all: a collider is declared with the engine's `usePhysicsBody2d`, which hands
     * back the record and never the simulated handle, because the record is what the scene keeps
     * and the handle is this adapter's. Something holding the object and nothing else gets from
     * there to `setLinearVelocity` or `onEnter` through here.
     *
     * Returns **the same handle** the body was created with, so a listener connected here and one
     * connected at creation share the one signal (see `TBodyEntry.handle`).
     *
     * `null` is a normal answer during the first frames of a scene: bodies are registered as their
     * objects are built, so a behaviour running before its own collider would ask too early.
     * Look it up in `useUpdate` rather than caching it at init.
     */
    bodyOf: (box: TGameObject) => TPhysicsBodyHandle2d | null;
};
