import type { TSoftBody2d, TSoftBodyOptions2d } from './t_soft_body_2d';
import type { TJoint2d, TJointHandle2d } from './t_joint_2d';
import type { TCharacterOptions2d } from './character_body_2d';
import type { TCharacterBody2d } from '../character/t_character_body_2d';
import type { TGameObject } from '../../hooks/spawn/use_spawn';
// How a body moves is the engine's own word for it, the same one a scene writes down.
import type { TPhysicsBodyType } from '../types/t_physics';
import type { TPhysicsLayer } from '../layer_names';
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
     * Runs `listener` each time another body starts touching this one, with **the other body's
     * box**. Set up in a scene or a piece, it leaves with it:
     *
     * ```ts
     * const bullet = usePhysicsBody2d(self, { type: 'dynamic', shape: 'circle', radius: 3 });
     * bullet.onEnter((other) => { if (other.name.startsWith('tank')) destroy(other); });
     * ```
     *
     * **Listening is the opt-in.** The simulation reports contacts only for colliders that asked
     * for them, and asking has a cost the rest of a scene should not pay, so it is asked the first
     * time `onEnter` or `onExit` is called, not when the body is made. Nothing to configure, and a
     * pile of a thousand crates nobody listens to stays as cheap as it was.
     *
     * Only one of the two bodies needs to listen for the contact to be reported, which is why a
     * bullet can hear its hits against walls that know nothing about it.
     *
     * @returns What stops it sooner.
     */
    onEnter(listener: (other: TGameObject) => void): () => void;

    /**
     * Runs `listener` each time another body stops touching this one, with the other body's box.
     * Listening is the opt-in, as for `onEnter`.
     *
     * A body coming to rest **on** another never says this: it is still touching.
     *
     * @returns What stops it sooner.
     */
    onExit(listener: (other: TGameObject) => void): () => void;

    /**
     * Apply an instantaneous impulse (momentum change) at the body's center.
     */
    applyImpulse: (x: number, y: number) => void;

    /**
     * Pushes it steadily for this frame: ask every frame for as long as it should push (a fan, a
     * thruster, wind), and it stops when the game stops asking. Several calls in one frame add up.
     * For one shove all at once, `applyImpulse`.
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
     * By number or by the names the game gave its layers (`physicsLayers`): `setLayers('ghost',
     * ['world'])`. `collidesWith` left out keeps the mask the body already had. The object's physics record is
     * updated too, so a scene saved afterwards keeps the layers it is simulating with.
     */
    setLayers: (layer: TPhysicsLayer, collidesWith?: number | readonly TPhysicsLayer[]) => void;

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

    /**
     * Makes `box` a platformer's character in this world: what `useCharacterBody2d` does for the
     * object being built.
     */
    addCharacter: (box: TGameObject, options: TCharacterOptions2d) => TCharacterBody2d;

    /**
     * Makes `box` a soft body in this world: what `useSoftBody2d` does for the object being built.
     */
    addSoftBody: (box: TGameObject, options: TSoftBodyOptions2d) => TSoftBody2d;

    /**
     * Joins two objects' bodies, or one to a point of the world when `b` is `null`, at any moment:
     * a hook thrown in the middle of a jump. `useJoint2d` does it while the scene is built. The
     * joint is made as soon as both bodies are in the world, and let go of when either object is.
     */
    addJoint: (a: TGameObject, b: TGameObject | null, joint: TJoint2d) => TJointHandle2d;
};
