import type { TGameObject } from '../../hooks/spawn/use_spawn';
import type { TGameSignal } from '../../signal';
import type { TGeometry } from '../../geometry';
import type { TCharacterBody, TCharacterOptions } from './character_body';
// How a body moves is the engine's own word for it, the same one a scene writes down.
import type { TPhysicsBodyType } from '../types/t_physics';
export type { TPhysicsBodyType };

/**
 * What this adapter promises, said once and apart from the machinery that keeps it.
 *
 * The unit throughout is **the object**, never a bare placement: a body belongs to something in the
 * scene, `bodyOf` finds it by that something, and a contact hands over the other one. That is the
 * difference from the same adapter written against the other engine, where a body could be hung on
 * a transform with nothing around it, and a trigger could then only say where the thing it touched
 * was and not what it was.
 *
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */

/**
 * A runtime handle to one simulated body. Runtime only: the body lives in WASM
 * memory, so nothing here is serializable (the serializable form is the mesh's own
 * transform, which this body writes into).
 *
 * @category Physics
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TPhysicsBodyHandle3d = {
    /**
     * Fires when another body starts touching this one, receiving the **other** object.
     *
     * Reading this property is the opt-in: box3d reports contacts only for shapes that asked,
     * so a body nobody listens to costs nothing and allocates no signal. Verified against
     * box3d: for *contacts* one side asking is enough, so listening on the player alone still
     * reports the wall.
     */
    onEnter: TGameSignal<TGameObject>;
    /**
     * Fires when a body stops touching this one, the exit half of {@link TPhysicsBodyHandle3d.onEnter},
     * same opt-in-on-read rule.
     */
    onExit: TGameSignal<TGameObject>;
    /**
     * Applies an instantaneous impulse (mass·velocity) at the body's center, waking
     * it. Queued if the WASM world is still loading, then flushed on materialization.
     */
    applyImpulse: (x: number, y: number, z: number) => void;
    /**
     * Applies a continuous force (mass·acceleration) at the body's center. Unlike an impulse
     * this is meant to be applied every frame: one call is one frame's worth of push.
     */
    applyForce: (x: number, y: number, z: number) => void;
    /**
     * Applies a continuous torque about the body's center, the rotational sibling of
     * {@link TPhysicsBodyHandle3d.applyForce}.
     */
    applyTorque: (x: number, y: number, z: number) => void;
    /**
     * Sets the body's velocity outright, overriding whatever the solver had. This is how a
     * character walks: forces fight momentum and friction, a velocity set does not.
     */
    setLinearVelocity: (x: number, y: number, z: number) => void;
    /**
     * Sets the body's spin outright, the rotational sibling of `setLinearVelocity`.
     */
    setAngularVelocity: (x: number, y: number, z: number) => void;
    /**
     * Moves the body to another collision layer, and changes what it collides with, while the game
     * runs: a player who passes through enemies for a moment after being hit. The same two values
     * the body was created with (see the engine's `TPhysicsSurface`), and the same mutual rule: two
     * bodies meet only if each one's mask includes the other's layer.
     *
     * `collidesWith` left out keeps the mask the body already had. The object's physics record is
     * updated too, so a scene saved afterwards keeps the layers it is simulating with.
     */
    setLayers: (layer: number, collidesWith?: number) => void;
    /**
     * Removes this body from the simulation, freeing its WASM memory. The object stops being
     * driven and keeps whatever placement it last had. Safe to call twice; the world's own
     * teardown skips bodies already destroyed this way.
     */
    destroy: () => void;
};

/**
 * Optional surface tuning for a collider: how a contact resolves, and whether it resolves at
 * all. `restitution` is bounciness (0 = dead, 1 = elastic), `friction` resists sliding,
 * `density` (kg/m³) sets the body's mass from its volume, and `sensor` detects overlaps
 * without resolving them, which is a trigger volume. All optional; omitted fields keep Box3D's
 * defaults.
 *
 * The grouping mirrors the engine's `TPhysicsSurface`, which puts the same four together for the same
 * reason: they are the non-geometric half of a collider.
 *
 * @category Physics
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TColliderSurface3d = {
    restitution?: number;
    friction?: number;
    density?: number;
    sensor?: boolean;
    /**
     * Which collision layer this body is on (`0..15`) and which layers it collides with (a
     * bitmask): see the engine's `TPhysicsSurface`. Omitted means layer 0 against everything, which
     * is how every body behaved before layers existed.
     */
    layer?: number;
    collidesWith?: number;
};

/**
 * The world a scene declared, and the factory for bodies in it. Deliberately narrow (box + sphere for now); more shapes and queries land
 * when a concrete case needs them, not before.
 *
 * @category Physics
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TPhysicsWorldHandle3d = {
    /**
     * Adds a box collider whose full extents are `size` (metres, halved internally to
     * Box3D's half-extents), positioned and turned from where the object is.
     */
    addBox: (box: TGameObject, opts: { type: TPhysicsBodyType; size: [number, number, number] } & TColliderOptions3d) => TPhysicsBodyHandle3d;
    /**
     * Adds a sphere collider of `radius` (metres), positioned from where the object is.
     */
    addSphere: (box: TGameObject, opts: { type: TPhysicsBodyType; radius: number } & TColliderOptions3d) => TPhysicsBodyHandle3d;
    /**
     * Adds a capsule collider standing on Y: a cylinder with hemispherical caps, and what a
     * character should use: a box catches on floor seams and step lips, a capsule rides over
     * them.
     *
     * `height` is the **total** height including the caps (see `TCollider3d`), which is not how
     * Box3D states it, because it wants two cap centres. The conversion happens here, and a `height`
     * below `radius * 2` clamps to a sphere rather than inverting the shape.
     */
    addCapsule: (box: TGameObject, opts: { type: TPhysicsBodyType; radius: number; height: number } & TColliderOptions3d) => TPhysicsBodyHandle3d;
    /**
     * Adds the **convex hull** of a geometry's vertices: the collider for a prop whose silhouette
     * matters but whose hollows do not. Cheap to collide against and valid for a dynamic body,
     * which is what separates it from `addMesh`.
     *
     * Reads the shape's corners, so it works on an imported glTF as well as on a
     * primitive. A model still loading has no positions yet and produces an empty body rather
     * than throwing, which is the same deferral every other shape already survives.
     */
    addHull: (box: TGameObject, opts: { type: TPhysicsBodyType; geometry: TGeometry } & TColliderOptions3d) => TPhysicsBodyHandle3d;
    /**
     * Adds the geometry's **actual triangles**, concave and all. This is level geometry:
     * terrain, a room, a track.
     *
     * Static or kinematic only. A triangle mesh is a surface with no interior, so a dynamic body
     * made of one has nothing to be pushed out of; `'dynamic'` is clamped to `'static'` with a
     * warning rather than silently falling through the world.
     */
    addMesh: (box: TGameObject, opts: { type: TPhysicsBodyType; geometry: TGeometry } & TColliderOptions3d) => TPhysicsBodyHandle3d;
    /**
     * Adds a **kinematic character**: a capsule moved by queries rather than by forces, and the
     * thing that makes a world walkable. See {@link TCharacterBody} for why it is not a body.
     *
     * It is advanced by this world's own fixed step, like everything else here, so nothing has to
     * be called per frame: write into `velocity` whenever, and the character walks.
     */
    addCharacter: (box: TGameObject, opts: TCharacterOptions) => TCharacterBody;
    /**
     * Fires a ray and returns the **closest** thing it hits, or `null` for a clean miss, and the
     * first query on this surface that is not about creating something.
     *
     * A ray is how a game asks a question it cannot answer from its own state: what is under the
     * cursor, is there ground beneath these feet, can the guard see the player, what did this gun
     * shoot. All four are the same call.
     *
     * `direction` need not be normalized: its length is ignored and `maxDistance` is what
     * decides how far the ray reaches. That is Unity's shape rather than Box3D's (which takes a
     * single translation vector meaning both at once), because "which way" and "how far" are
     * separate thoughts and combining them is how a ray silently ends up 0.3 m long.
     *
     * Returns `null` while the WASM runtime is still loading, exactly as every other call here
     * defers: a ray cast on the first frame of a scene is not an error, it is early.
     */
    raycast: (
        origin: { x: number; y: number; z: number },
        direction: { x: number; y: number; z: number },
        opts?: TRaycastOptions,
    ) => TRaycastHit | null;

    /**
     * The body already registered for the box with this `id`, or `null` if it has none.
     *
     * The lookup a **document-driven** scene needs, and the reason it exists: when a collider
     * comes from a `SceneDoc` the provider builds it, so the handle `addBox` returned went there
     * and the game never saw it. A script attached to that same box has the box and nothing else
     * and this is how it gets from there to `onEnter`. Pass the script's `self` straight in; a
     * code-authored scene keeps its handle and never needs this.
     *
     * `null` is a normal answer during a scene's first frames: bodies are registered as their
     * boxes are built, so a script listed above its own collider asks too early. Look it up in
     * `useUpdate` rather than caching it at init.
     */
    bodyOf: (box: TGameObject) => TPhysicsBodyHandle3d | null;
};

/**
 * How far a ray reaches and what it is allowed to hit.
 *
 * `collidesWith` is a layer bitmask read exactly like a body's own (see the engine's `TPhysicsSurface`)
 * so a ground check that should ignore enemies, or a cursor pick that should ignore scenery,
 * is the same vocabulary the colliders are already authored in rather than a second one.
 *
 * @category Physics
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TRaycastOptions = {
    /**
     * Metres. Defaults to {@link DEFAULT_RAY_DISTANCE}.
     */
    maxDistance?: number;
    /**
     * Which layers the ray can hit. Defaults to all of them.
     */
    collidesWith?: number;
};

/**
 * What a ray found: which object, where, and how far along.
 *
 * `box` is the very object handed to `addBox`/`addSphere` and the rest, so a hit is immediately
 * usable ("move this", "damage that") without a lookup table of your own.
 *
 * @category Physics
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TRaycastHit = {
    box: TGameObject;
    /**
     * Where the ray met the surface, in world metres.
     */
    point: { x: number; y: number; z: number };
    /**
     * The surface normal there, unit length and pointing out of the shape.
     */
    normal: { x: number; y: number; z: number };
    /**
     * Metres from `origin` to `point`.
     */
    distance: number;
};

/**
 * How far a ray reaches when nothing says otherwise.
 *
 * Finite rather than infinite because the backend takes a translation vector, not a direction:
 * there is no "infinity" to hand it. A kilometre is far beyond any level this engine's retro
 * scope builds, so it reads as unlimited while staying a number the solver can use.
 *
 * @category Physics
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const DEFAULT_RAY_DISTANCE = 1000;

/**
 * What every `add*` takes beyond its own dimensions: the surface, plus where the shape sits
 * inside the object.
 *
 * `offset` is in the box's local units *before* its scale, matching
 * `TPhysicsBody3d.offset`, and it exists for glTF, which puts a model's origin at its
 * feet while a collider is centred on that origin. Omitted means centred.
 *
 * @category Physics
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TColliderOptions3d = TColliderSurface3d & { offset?: [number, number, number] };

/**
 * Options for the world. `gravity` is metres/second² (the engine's 3D unit is one
 * metre); it defaults to Earth on -Y.
 *
 * @category Physics
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TPhysicsWorldOptions3d = { gravity?: { x: number; y: number; z: number } };
