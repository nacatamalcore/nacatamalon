import { useUpdate } from '../../hooks/loop/use_update';
import { useSceneUnmount } from '../../hooks/scene/use_scene_unmount';
import { createGameSignal } from '../../signal/create_game_signal';
import { ALL_LAYERS } from '../layers';
import type { TGameObject } from '../../hooks/spawn/use_spawn';
import type { TGameSignal } from '../../signal';
import { fromB3, loadBox3D, toB3 } from './load_box3d';
import type { TB3Quat } from './load_box3d';
import { createCharacter, MOVER_CATEGORY } from './character_body';
import type { TBox3dModule } from './load_box3d';
import { worldPoseOf, writeWorldPose } from './world_pose';
import { DEFAULT_RAY_DISTANCE } from './types';
import type { TPhysicsBodyType, TPhysicsBodyHandle3d, TPhysicsWorldHandle3d, TColliderSurface3d, TPhysicsWorldOptions3d } from './types';

// Body/world/shape ids are Embind handles; derive their types off the module so no Embind
// internals leak into this file's imports.
type TWorldId = ReturnType<TBox3dModule['b3CreateWorld']>;
type TBodyId = ReturnType<TBox3dModule['b3CreateBody']>;
type TShapeId = ReturnType<TBox3dModule['b3CreateBoxShape']>;

type TVec3 = { x: number; y: number; z: number };

/**
 * Every number in a spec is **already resolved**: scale multiplied in, the author's units
 * converted to the backend's. That is the rule that keeps `materialize` free of policy: it
 * calls box3d and nothing else, so the scale and unit decisions all live in one place per
 * shape, next to the warning that fires when they cannot be honoured.
 *
 * `offset` follows the same rule and is therefore **scaled** here, unlike the format's
 * `PhysicsBody3DRecord.offset`. Hull and mesh are the exception and say so: box3d scales those
 * two itself, so their offset is baked into the point copy *before* scaling instead.
 */
type TBodySpec = {
    material?: TColliderSurface3d;
    box: TGameObject;
    offset: TVec3;
    /**
     * Leaves this body out of every character's mover query (see `MOVER_CATEGORY`). Only a
     * character's own presence proxy sets it, so that the capsule positioning the character
     * does not also block it. An authored collider never does: being walked into is the point.
     */
    hiddenFromMovers?: boolean;
    /**
     * Suppresses the transform writeback for this body.
     *
     * A body normally *is* the authority on where its box is, and `drainMoves` copies its
     * settled position onto the transform. A character's proxy is the exact inverse: it is
     * driven from the solved capsule every step, and letting it write back would mean the box's
     * placement makes a round trip through the simulation and comes back shifted by the
     * character's offset. It still carries the object, because that is what a trigger it walks
     * into is handed.
     */
    driven?: boolean;
} & (
    | { kind: 'box'; type: TPhysicsBodyType; half: [number, number, number] }
    | { kind: 'sphere'; type: TPhysicsBodyType; radius: number }
    /**
     * `halfSegment` is the distance from the centre to each cap centre, already converted.
     */
    | { kind: 'capsule'; type: TPhysicsBodyType; radius: number; halfSegment: number }
    /**
     * A convex hull over `positions` (flat `[x,y,z, …]`, the offset already baked in). `scale`
     * is handed to box3d rather than multiplied in, because a hull is scaled by the backend.
     */
    | { kind: 'hull'; type: TPhysicsBodyType; positions: Float32Array; scale: TVec3 }
    /**
     * The triangles themselves, same convention as `'hull'`, plus the index buffer.
     */
    | { kind: 'mesh'; type: TPhysicsBodyType; positions: Float32Array; indices: Uint16Array | Uint32Array; scale: TVec3 }
);

/**
 * Something asked of a body before its WASM shape existed. Replayed in order at
 * materialization, which is what makes a velocity set and an impulse queued in the same tick
 * still resolve the way the caller wrote them.
 */
type TPendingAction = { kind: 'impulse' | 'force' | 'torque' | 'linear' | 'angular'; v: TVec3 };

type TBodyEntry = {
    spec: TBodySpec;
    id: TBodyId | null;              // null until the WASM world exists
    shape: TShapeId | null;
    pending: TPendingAction[];       // actions requested before materialization
    /**
     * Whether this body asked box3d to report its *contacts*. False until someone reads
     * `onEnter`/`onExit`: see `TPhysicsBodyHandle3d.onEnter` for why the opt-in is a property read.
     * Sensor reporting is separate and not opt-in; see `sensorsPresent`.
     */
    wantsEvents: boolean;
    /**
     * Created on first read, so a body nobody listens to allocates nothing.
     */
    onEnter: TGameSignal<TGameObject> | null;
    onExit: TGameSignal<TGameObject> | null;
    destroyed: boolean;
    /**
     * The WASM-side hull/mesh data backing a `'hull'`/`'mesh'` shape, held so it can be freed.
     * box3d allocates these outside the body, so destroying the body does not release them, and
     * a level reloaded a hundred times would leak its collision mesh a hundred times.
     */
    geometryData: { kind: 'hull' | 'mesh'; handle: unknown } | null;
};

/**
 * A character's capsule stands on Y and never rolls, so its proxy is placed unrotated. Hoisted
 * because it is written every substep, per character.
 */
const IDENTITY_ROTATION: TB3Quat = [0, 0, 0, 1];

const FIXED_STEP = 1 / 60;
const MAX_FRAME = 0.25;             // clamp dt so a stall can't spiral the accumulator

const bodyTypeOf = (b3: TBox3dModule, type: TPhysicsBodyType) =>
    type === 'dynamic' ? b3.b3BodyType.b3_dynamicBody
    : type === 'kinematic' ? b3.b3BodyType.b3_kinematicBody
    : b3.b3BodyType.b3_staticBody;

/**
 * A shape handle reduced to a Map key. box3d reports a contact as a pair of *shape* ids, and
 * an id is a `{ index1, world0, generation }` record, a fresh object each time, so it cannot
 * be a key by identity. The generation is part of the key on purpose: it is what stops a
 * recycled slot from resolving to the destroyed body that used to hold it.
 */
const shapeKey = (id: { index1: number; generation: number }): string => `${id.index1}:${id.generation}`;

/**
 * Creates a physics world for the running scene and steps it every frame, syncing each
 * body's simulated pose back onto the object it belongs to. This is the whole integration
 * seam: it runs entirely on the engine's public hooks (`useUpdate` to advance the
 * simulation, `useSceneUnmount` to free the WASM world and bodies when the scene
 * leaves), so nothing in the engine itself knows physics exists.
 *
 * Because the WASM runtime loads asynchronously, the world and any bodies added before
 * it is ready are created lazily and materialized on load; stepping and writeback are
 * no-ops until then, so a scene never blocks on it. Stepping uses a **fixed timestep
 * accumulator** (variable render dt fed in fixed increments) so the simulation is
 * deterministic and frame-rate independent. After each frame's steps, every dynamic
 * body's place and facing are written onto the object, the facing as a whole turn rather
 * than as three angles, because three cannot hold the solver's answer without losing some
 * of it.
 *
 * **Not a door.** A scene says it wants a world with the engine's `usePhysicsWorld3d`, and
 * the provider calls this. Opening one here instead would be a second gravity with a second
 * set of bodies in it, colliding with nothing that is in the scene.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const usePhysicsWorld = (options: TPhysicsWorldOptions3d = {}): TPhysicsWorldHandle3d => {
    const gravity = options.gravity ?? { x: 0, y: -9.81, z: 0 };

    let b3: TBox3dModule | null = null;
    let world: TWorldId | null = null;
    let disposed = false;
    let accumulator = 0;
    /**
     * Characters are stepped by this world's loop rather than by their own `useUpdate`, so they
     * see the world exactly as the solver left it. Registering a second `useUpdate` would leave
     * the order between the two undefined, and a character that queries a half-stepped world
     * walks through things every few frames.
     */
    const characters: ((dt: number) => void)[] = [];
    const entries: TBodyEntry[] = [];
    /**
     * Shape key → the body that owns it. box3d reports an event as a pair of shape ids and
     * nothing else, so without this index an event cannot be turned back into the two objects
     * the game actually cares about.
     */
    const byShape = new Map<string, TBodyEntry>();
    /**
     * Body → entry, the sibling of `byShape`. Contacts arrive as shape ids and move events as
     * **body** ids, so the two lookups are genuinely different keys rather than a duplication.
     */
    const byBody = new Map<string, TBodyEntry>();
    /**
     * Box id → its public handle, for `bodyOf`. Holds the **handle**, not the entry, and
     * deliberately the same object the body was created with: `onEnter`/`onExit` are created
     * lazily on first read, so a second handle over the same entry would each believe it owned
     * the signal and a listener attached through one would never hear the other's contacts.
     */
    const byBoxId = new Map<string, TPhysicsBodyHandle3d>();

    /**
     * Whether any sensor exists in this world yet.
     *
     * Measured against box3d, and the reason this flag exists at all: sensor events are **not**
     * an OR the way contact events are. The *visitor* shape must have `enableSensorEvents`, so
     * a trigger volume that sets the flag on itself alone reports nothing, and silently, which is
     * the worst possible way for a doorway to not work. So the first sensor to appear turns
     * reporting on for every shape already created, and every later shape is born with it.
     * Worlds with no sensors pay nothing.
     */
    let sensorsPresent = false;

    // Reusable WASM-backed buffers. Created once with the world and freed on unmount: refilling
    // costs nothing on the JS side, while recreating them per frame would allocate in WASM
    // every frame.
    let eventsBuffer: ReturnType<TBox3dModule['createEventsBuffer']> | null = null;
    let contactEvent: ReturnType<TBox3dModule['createContactTouchEvent']> | null = null;
    let sensorEvent: ReturnType<TBox3dModule['createSensorTouchEvent']> | null = null;
    let moveEvent: ReturnType<TBox3dModule['createBodyMoveEvent']> | null = null;

    const applyAction = (mod: TBox3dModule, id: TBodyId, action: TPendingAction): void => {
        switch (action.kind) {
            case 'impulse': mod.b3Body_ApplyLinearImpulseToCenter(id, toB3(action.v), true); break;
            case 'force':   mod.b3Body_ApplyForceToCenter(id, toB3(action.v), true); break;
            case 'torque':  mod.b3Body_ApplyTorque(id, toB3(action.v), true); break;
            case 'linear':  mod.b3Body_SetLinearVelocity(id, toB3(action.v)); break;
            case 'angular': mod.b3Body_SetAngularVelocity(id, toB3(action.v)); break;
        }
    };

    /**
     * The collision filter a body's layers ask for, at creation and again when `setLayers` changes
     * them.
     */
    const filterOf = (spec: TBodySpec): { categoryBits: bigint; maskBits: bigint; groupIndex: number } => ({
        categoryBits: 1n << BigInt(spec.material?.layer ?? 0),
        // Widened by the mover bit unless this body opted out: a character walks by querying, and a
        // shape whose mask does not accept the query is a shape the character passes straight
        // through. See `MOVER_CATEGORY` for why the opt-out has to live on this side.
        maskBits: spec.hiddenFromMovers
            ? BigInt(spec.material?.collidesWith ?? ALL_LAYERS)
            : BigInt(spec.material?.collidesWith ?? ALL_LAYERS) | MOVER_CATEGORY,
        groupIndex: 0,
    });

    const materialize = (entry: TBodyEntry): void => {
        if (!b3 || world === null || entry.destroyed) return;
        // In WORLD space: the solver knows one world, while `transform` is relative to the box's
        // parent. A body under a group created from its local numbers simulates perfectly, at the
        // wrong place (see `world_pose.ts`).
        const pose = worldPoseOf(entry.spec.box);

        const def = b3.b3DefaultBodyDef();
        def.type = bodyTypeOf(b3, entry.spec.type);
        def.position = toB3(pose.position);
        // The engine's rotation rule, both halves of it: a `quaternion` is authoritative, and
        // otherwise the Euler fields are, composed `rotateY · rotateX · rotateZ`, the same
        // 'yxz' order `transformForward` and the 3D pipeline use.
        //
        // Only the first half used to be implemented, and the gap was invisible from inside the
        // adapter: the viewport's rotate gizmo writes a quaternion, so dragging a body around
        // always worked. Typing an angle into the inspector's Rot X/Y/Z writes Euler and leaves
        // `quaternion` null, so a ramp tilted by hand rendered tilted and collided flat.
        const [qx, qy, qz, qw] = pose.quaternion;
        def.rotation = [qx, qy, qz, qw];
        const id = b3.b3CreateBody(world, def);

        const shapeDef = b3.b3DefaultShapeDef();
        const mat = entry.spec.material;
        if (mat) {
            if (mat.density !== undefined) shapeDef.density = mat.density;
            // baseMaterial may be a copy on read (Embind), so mutate then write it back.
            const bm = shapeDef.baseMaterial;
            if (mat.restitution !== undefined) bm.restitution = mat.restitution;
            if (mat.friction !== undefined) bm.friction = mat.friction;
            shapeDef.baseMaterial = bm;
            if (mat.sensor) shapeDef.isSensor = true;
        }

        // Layers. box3d's filter is 64-bit (`bigint`), while the format caps at 16 layers
        // because Rapier2D's `u32` packs membership and mask into one word, so the widening
        // here is free and the narrowing lives in the format, deliberately.
        // Untouched shapes keep box3d's all-ones default, which already includes the mover bit.
        if (entry.spec.hiddenFromMovers || (mat && (mat.layer !== undefined || mat.collidesWith !== undefined))) {
            shapeDef.filter = filterOf(entry.spec);
        }
        // Every event flag defaults to false in box3d, so both of these are real opt-ins.
        shapeDef.enableContactEvents = entry.wantsEvents;
        shapeDef.enableSensorEvents = sensorsPresent;

        const shape = createShape(b3, id, shapeDef, entry);

        entry.id = id;
        entry.shape = shape;
        byShape.set(shapeKey(shape), entry);
        byBody.set(shapeKey(id), entry);

        if (mat?.sensor) enableSensorReporting();

        for (const action of entry.pending) applyAction(b3, id, action);
        entry.pending.length = 0;
    };

    /**
     * Turns sensor reporting on across the world, retrofitting every shape that already exists.
     * Verified against box3d: `b3Shape_EnableSensorEvents` after creation is honoured, so a
     * body created before the trigger it will later walk into still reports the overlap.
     */
    const enableSensorReporting = (): void => {
        if (sensorsPresent || !b3) return;
        sensorsPresent = true;
        for (const entry of entries) {
            if (entry.shape !== null) b3.b3Shape_EnableSensorEvents(entry.shape, true);
        }
    };

    /**
     * Copies the step's results onto the transforms the renderer reads, but only for the bodies
     * that actually moved.
     *
     * Box3D hands back a **move event per moved body** (`getBodyMoveEventAt`), which is both
     * cheaper and more correct than asking every body where it is. Cheaper because a settled
     * scene reports nothing: measured, a cube dropped on a floor stops appearing in the list
     * entirely once it sleeps, so a hundred stacked crates cost a hundred WASM calls a frame
     * while they settle and **zero** afterwards. More correct because the old sweep rewrote a
     * sleeping body's transform every frame from a value that was not changing, which quietly
     * takes ownership of a transform the game may want to move itself.
     *
     * Static bodies never appear here at all, so the type check the sweep needed is gone with it.
     * Kinematic bodies do appear, and were measured to report exactly what `b3Body_GetPosition`
     * would have said.
     *
     * Note the rotation shape: a move event carries a **flat** `{x, y, z, w}`, while
     * `b3Body_GetRotation` returns `{ v, s }`. Same quaternion, two layouts, and reading the
     * wrong one yields `undefined`s rather than an error.
     */
    const drainMoves = (): void => {
        if (!b3 || !eventsBuffer || !moveEvent) return;

        for (let i = 0; i < b3.getNumBodyMoveEvents(eventsBuffer); i++) {
            b3.getBodyMoveEventAt(moveEvent, eventsBuffer, i);
            const entry = byBody.get(shapeKey(moveEvent.bodyId));
            // A body destroyed mid-step is still in this step's events.
            if (!entry || entry.destroyed) continue;
            // Its object was destroyed this frame and the body goes at the sweep: nothing is
            // written onto an object that is already dead.
            if (entry.spec.box.destroyed) continue;
            // A driven body follows its transform rather than deciding it (see `TBodySpec.driven`).
            if (entry.spec.driven) continue;

            const p = moveEvent.position;
            const r = moveEvent.rotation;
            // World in, local out: the solver reports a world pose, the box stores one relative to
            // its parent. For a root-level box the conversion is the identity.
            writeWorldPose(entry.spec.box, fromB3(p), [r[0], r[1], r[2], r[3]]);
        }
    };

    /**
     * Turns one step's events into signal emissions.
     *
     * box3d keeps contacts and sensors in **separate lists**; the public surface deliberately
     * does not inherit that split, because `onEnter` means the same thing whichever kind of
     * overlap produced it: merging here is exactly the sort of backend shape the adapter
     * boundary exists to absorb. Both sides are notified, each receiving the *other* object.
     */
    const drainEvents = (): void => {
        if (!b3 || world === null || !eventsBuffer || !contactEvent || !sensorEvent) return;

        b3.getEvents(eventsBuffer, world);

        // Read out of the buffer first and announced afterwards: whoever hears one can end the scene
        // (a door that changes the room), which frees this world and its buffer on the spot.
        const heard: [TBodyEntry | undefined, TBodyEntry | undefined, boolean][] = [];
        const emit = (a: TBodyEntry | undefined, b: TBodyEntry | undefined, started: boolean): void => {
            heard.push([a, b, started]);
        };
        const announce = (a: TBodyEntry | undefined, b: TBodyEntry | undefined, started: boolean): void => {
            // A shape this world did not create, or one already torn down mid-step.
            if (!a || !b) return;
            // Destroyed earlier in this frame: its body is still in the world until the sweep, but
            // a contact with something already dead is not news to anyone.
            if (a.spec.box.destroyed || b.spec.box.destroyed) return;
            if (started) {
                a.onEnter?.emit(b.spec.box);
                b.onEnter?.emit(a.spec.box);
            } else {
                a.onExit?.emit(b.spec.box);
                b.onExit?.emit(a.spec.box);
            }
        };

        for (let i = 0; i < b3.getNumContactBeginEvents(eventsBuffer); i++) {
            b3.getContactBeginEventAt(contactEvent, eventsBuffer, i);
            emit(byShape.get(shapeKey(contactEvent.shapeIdA)), byShape.get(shapeKey(contactEvent.shapeIdB)), true);
        }
        for (let i = 0; i < b3.getNumContactEndEvents(eventsBuffer); i++) {
            b3.getContactEndEventAt(contactEvent, eventsBuffer, i);
            emit(byShape.get(shapeKey(contactEvent.shapeIdA)), byShape.get(shapeKey(contactEvent.shapeIdB)), false);
        }
        for (let i = 0; i < b3.getNumSensorBeginEvents(eventsBuffer); i++) {
            b3.getSensorBeginEventAt(sensorEvent, eventsBuffer, i);
            emit(byShape.get(shapeKey(sensorEvent.sensorShapeId)), byShape.get(shapeKey(sensorEvent.visitorShapeId)), true);
        }
        for (let i = 0; i < b3.getNumSensorEndEvents(eventsBuffer); i++) {
            b3.getSensorEndEventAt(sensorEvent, eventsBuffer, i);
            emit(byShape.get(shapeKey(sensorEvent.sensorShapeId)), byShape.get(shapeKey(sensorEvent.visitorShapeId)), false);
        }

        for (const [a, b, started] of heard) {
            if (disposed) return;
            announce(a, b, started);
        }
    };

    // Kick off the async WASM load; create the world (and any queued bodies) when ready.
    loadBox3D().then((mod) => {
        if (disposed) return;
        b3 = mod;
        const wd = mod.b3DefaultWorldDef();
        wd.gravity = toB3(gravity);
        world = mod.b3CreateWorld(wd);
        eventsBuffer = mod.createEventsBuffer();
        contactEvent = mod.createContactTouchEvent();
        sensorEvent = mod.createSensorTouchEvent();
        moveEvent = mod.createBodyMoveEvent();
        for (const entry of entries) materialize(entry);
    }).catch((error) => {
        // Without this the failure is invisible: every body stays frozen at its authored
        // transform and the scene reads as merely "wrong" rather than broken. Same guard the
        // 2D adapter already has.
        console.error('[NacatamalOn] Box3D failed to initialize, so physics is inert.', error);
    });

    useUpdate((dt) => {
        if (!b3 || world === null) return;
        accumulator = Math.min(accumulator + dt, MAX_FRAME);
        while (accumulator >= FIXED_STEP) {
            b3.b3World_Step(world, FIXED_STEP, 4);
            // Drained per substep, not once after the loop: `getEvents` reports the step that
            // just ran, so batching would silently discard every contact but the last one, and
            // a fast projectile's entire hit can live in an earlier substep.
            drainEvents();
            // A listener may have ended the scene, and this world with it.
            if (disposed) return;
            // After the solver, before the writeback: a character reads the world's *settled*
            // positions, which is the only moment its query answers the question it is asking.
            for (const advance of characters) advance(FIXED_STEP);
            // Per substep like the contact events, and for the same reason: `getEvents` reports
            // the step that just ran, so a body that moved in an earlier substep and settled in
            // a later one would otherwise never have its motion written anywhere.
            drainMoves();
            accumulator -= FIXED_STEP;
        }
    });

    useSceneUnmount(() => {
        disposed = true;
        if (!b3 || world === null) return;
        for (const entry of entries) {
            if (entry.id !== null && !entry.destroyed) b3.b3DestroyBody(entry.id);
            freeGeometryData(b3, entry);
        }
        // The buffers hold WASM memory of their own and are not owned by the world, so freeing
        // the world alone would leak them once per scene change.
        if (eventsBuffer) b3.destroyEventsBuffer(eventsBuffer);
        eventsBuffer = null;
        moveEvent = null;
        b3.b3DestroyWorld(world);
        world = null;
        entries.length = 0;
        byShape.clear();
        byBody.clear();
        byBoxId.clear();
    });

    /**
     * Registers a body and hands back **both** its public handle and its internal entry.
     *
     * Every authoring call wants only the handle, which is what `add` returns. `addCharacter` is
     * the one caller that needs the entry as well, because it drives its proxy's WASM body
     * directly every step, and a handle deliberately exposes no way to teleport a body, since
     * for anything a game authors that would be reaching past the simulation.
     */
    const addEntry = (spec: TBodySpec): { body: TPhysicsBodyHandle3d; entry: TBodyEntry } => {
        const entry: TBodyEntry = {
            spec, id: null, shape: null, pending: [],
            // A sensor exists only to report overlaps, so it never waits to be asked.
            wantsEvents: spec.material?.sensor === true,
            onEnter: null, onExit: null, destroyed: false, geometryData: null,
        };
        entries.push(entry);
        materialize(entry);        // immediate if the world is already up, else deferred

        const act = (kind: TPendingAction['kind'], x: number, y: number, z: number): void => {
            if (entry.destroyed) return;
            const action: TPendingAction = { kind, v: { x, y, z } };
            if (b3 && entry.id !== null) applyAction(b3, entry.id, action);
            else entry.pending.push(action);
        };

        /**
         * Returns the named signal, creating it (and switching box3d's contact reporting on)
         * the first time it is asked for. Handles both sides of the async gap: before
         * materialization the flag is remembered for the descriptor, after it the live shape is
         * updated in place.
         */
        const ensureSignal = (which: 'onEnter' | 'onExit'): TGameSignal<TGameObject> => {
            if (!entry.wantsEvents) {
                entry.wantsEvents = true;
                if (b3 && entry.shape !== null) b3.b3Shape_EnableContactEvents(entry.shape, true);
            }
            const existing = entry[which];
            if (existing) return existing;

            const signal = createGameSignal<TGameObject>();
            entry[which] = signal;
            return signal;
        };

        const body: TPhysicsBodyHandle3d = {
            get onEnter() { return ensureSignal('onEnter'); },
            get onExit() { return ensureSignal('onExit'); },
            applyImpulse: (x, y, z) => act('impulse', x, y, z),
            applyForce: (x, y, z) => act('force', x, y, z),
            applyTorque: (x, y, z) => act('torque', x, y, z),
            setLinearVelocity: (x, y, z) => act('linear', x, y, z),
            setAngularVelocity: (x, y, z) => act('angular', x, y, z),
            setLayers: (layer, collidesWith) => {
                if (entry.destroyed) return;
                const mask = collidesWith ?? spec.material?.collidesWith ?? ALL_LAYERS;
                // Kept on the spec as well as applied, so a body still waiting for the WebAssembly
                // is built on the new layers when it lands.
                spec.material = { ...spec.material, layer, collidesWith: mask };
                if (spec.box.physics?._type === 'physics3d') {
                    spec.box.physics.layer = layer;
                    spec.box.physics.collidesWith = mask;
                }
                // `true` re-tests the contacts it is already in, so a body leaving a layer stops
                // touching what it was resting on instead of waiting for the next contact.
                if (b3 && entry.shape !== null) b3.b3Shape_SetFilter(entry.shape, filterOf(spec), true);
            },
            destroy: () => {
                if (entry.destroyed) return;
                entry.destroyed = true;
                if (entry.shape !== null) byShape.delete(shapeKey(entry.shape));
                if (entry.id !== null) byBody.delete(shapeKey(entry.id));
                if (b3 && entry.id !== null) b3.b3DestroyBody(entry.id);
                if (b3) freeGeometryData(b3, entry);
                entry.id = null;
                entry.shape = null;
                const at = entries.indexOf(entry);
                if (at >= 0) entries.splice(at, 1);
                if (byBoxId.get(spec.box.id) === body) {
                    byBoxId.delete(spec.box.id);
                }
            },
        };

        // The proxy shares its box with the character it follows, so it must not take over that
        // box's entry: `bodyOf` on a character's box should find the character's collider if it
        // has one, never the invisible capsule standing in for it.
        if (!spec.driven) byBoxId.set(spec.box.id, body);

        // Destroying the object takes its body out of the world. `destroy` runs an object's
        // cleanups, children first, for it and everything under it; before this hook a destroyed
        // object kept its body, an invisible wall where it used to be. The world's own teardown
        // already skips bodies destroyed this way.
        spec.box.cleanups.push(body.destroy);

        return { body, entry };
    };

    const add = (spec: TBodySpec): TPhysicsBodyHandle3d => addEntry(spec).body;

    /**
     * The surface half of `opts`, or `undefined` when the caller tuned nothing.
     *
     * The **guard is derived from the object**, not spelled out again beside it. Listing the
     * fields twice is how `sensor` was once added to the type, typechecked clean and did nothing
     * at runtime (the 2D adapter carries the same scar), and `layer`/`collidesWith` repeated
     * it exactly: colliders simply ignored their layers while every signature agreed. Now adding
     * a field to `TColliderSurface3d` needs one edit here and the guard follows it.
     */
    const materialOf = (opts: TColliderSurface3d): TColliderSurface3d | undefined => {
        const material: TColliderSurface3d = {
            restitution: opts.restitution,
            friction: opts.friction,
            density: opts.density,
            sensor: opts.sensor,
            layer: opts.layer,
            collidesWith: opts.collidesWith,
        };
        return Object.values(material).every((v) => v === undefined) ? undefined : material;
    };

    return {
        addBox: (box, opts) => {
            const [sx, sy, sz] = scaleOf(box);
            return add({
                kind: 'box', type: opts.type,
                half: [(opts.size[0] * sx) / 2, (opts.size[1] * sy) / 2, (opts.size[2] * sz) / 2],
                offset: scaledOffset(opts.offset, [sx, sy, sz]),
                box, material: materialOf(opts),
            });
        },
        addSphere: (box, opts) => {
            const [sx, sy, sz] = scaleOf(box);
            if ((sx !== sy || sy !== sz) && !warnedNonUniform) {
                warnedNonUniform = true;
                console.warn(
                    `[NacatamalOn] A sphere collider cannot be scaled non-uniformly (${sx}x${sy}x${sz}): ` +
                    'that shape is an ellipsoid, which this solver has no room for. Using the largest ' +
                    'axis so the collider contains its art.',
                );
            }
            return add({
                kind: 'sphere', type: opts.type,
                radius: opts.radius * Math.max(Math.abs(sx), Math.abs(sy), Math.abs(sz)),
                offset: scaledOffset(opts.offset, [sx, sy, sz]),
                box, material: materialOf(opts),
            });
        },
        addCapsule: (box, opts) => {
            const [sx, sy, sz] = scaleOf(box);
            // The radius spans X/Z and the height spans Y, so the two axes scale by different
            // factors, and a non-uniform X/Z would need an elliptical cross-section, which this
            // shape has no room for. Largest of the two wins, so the collider contains its art.
            const radial = Math.max(Math.abs(sx), Math.abs(sz));
            if (sx !== sz && !warnedNonUniform) {
                warnedNonUniform = true;
                console.warn(
                    `[NacatamalOn] A capsule collider cannot be scaled non-uniformly across X/Z ` +
                    `(${sx} vs ${sz}), because its cross-section is a circle. Using the larger axis so the ` +
                    'collider contains its art.',
                );
            }
            return add({
                kind: 'capsule', type: opts.type,
                radius: opts.radius * radial,
                halfSegment: halfSegmentOf(opts.radius * radial, opts.height * Math.abs(sy)),
                offset: scaledOffset(opts.offset, [sx, sy, sz]),
                box, material: materialOf(opts),
            });
        },
        addHull: (box, opts) => add({
                kind: 'hull', type: opts.type,
                // Baked into the points rather than passed alongside them: box3d applies `scale`
                // to a hull itself, so an offset given separately would land in a different
                // space depending on the scale. Baked pre-scale, it scales with the shape, which is the
                // same thing the analytic shapes get by pre-multiplying.
                positions: offsetPositions(opts.geometry.positions ?? EMPTY_POSITIONS, opts.offset),
                scale: vec3(scaleOf(box)),
                offset: { x: 0, y: 0, z: 0 },
                box, material: materialOf(opts),
            }),
        addCharacter: (box, opts) => {
            const { body, step, centre, mover } = createCharacter({
                b3: () => b3,
                world: () => world,
                box,
                options: opts,
                // A character falls at the same rate as everything around it unless told
                // otherwise, taking the magnitude, since the controller's own axis is down.
                worldGravity: Math.hypot(gravity.x, gravity.y, gravity.z),
            });

            // The character's **presence** in the world: a kinematic capsule of the same
            // dimensions, teleported onto the solved centre after every step.
            //
            // Solving by query is what makes a character walk properly, and it comes at the price
            // of the character not existing: nothing in the world can see a position that was
            // never given a shape. So a trigger volume reported no visitor, a crate felt no
            // shove, and the only way to notice a player was to go looking for one. This is the
            // cheapest thing that fixes all of it at once: the proxy is `driven` (it never writes
            // back, because the solver owns the transform) and it carries the object, so a door the
            // character walks into is handed the character's own box.
            //
            // It is `hiddenFromMovers`, because otherwise the very first step would find the
            // capsule inside itself and the character would never move.
            const { entry: proxy } = addEntry({
                kind: 'capsule',
                type: 'kinematic',
                radius: mover.radius,
                halfSegment: Math.max(0, (mover.center2.y - mover.center1.y) / 2),
                box,
                offset: { x: 0, y: 0, z: 0 },
                material: { layer: opts.layer ?? 0, collidesWith: opts.collidesWith ?? ALL_LAYERS },
                hiddenFromMovers: true,
                driven: true,
            });

            const advance = (dt: number): void => {
                step(dt);
                // Teleported rather than given a velocity: the solver has already decided where
                // the character is, and a kinematic body asked to travel there would arrive a
                // step late and disagree with what is on screen.
                if (b3 && proxy.id !== null && !proxy.destroyed) {
                    b3.b3Body_SetTransform(proxy.id, toB3(centre), IDENTITY_ROTATION);
                }
            };
            characters.push(advance);
            // A destroyed character stops walking, as its proxy stops colliding (`addEntry` hangs
            // that one on the same cleanups).
            box.cleanups.push(() => {
                const at = characters.indexOf(advance);
                if (at >= 0) characters.splice(at, 1);
            });

            return body;
        },

        raycast: (origin, direction, opts = {}) => {
            if (!b3 || world === null) return null;

            // A zero direction has no ray in it. Returning null rather than throwing keeps this
            // usable straight from an input handler, where a drag of zero pixels is routine.
            const length = Math.hypot(direction.x, direction.y, direction.z);
            if (length === 0) return null;

            const distance = opts.maxDistance ?? DEFAULT_RAY_DISTANCE;
            const scale = distance / length;
            const translation = toB3({
                x: direction.x * scale, y: direction.y * scale, z: direction.z * scale,
            });

            // `categoryBits` is left at all-ones, which is what the RAY is, and every shape's own mask
            // is then tested against. Only `maskBits` narrows what it may hit, so a ray ignores
            // nothing unless asked. box3d's filter is 64-bit; the format's 16 layers widen freely.
            const filter = b3.b3DefaultQueryFilter();
            if (opts.collidesWith !== undefined) filter.maskBits = BigInt(opts.collidesWith);

            const result = b3.b3World_CastRayClosest(world, toB3(origin), translation, filter);
            if (!result.hit) return null;

            // The shape→body map the contact events already keep. A hit on a body mid-teardown
            // resolves to nothing, which is a miss rather than a half-filled result.
            const entry = byShape.get(shapeKey(result.shapeId));
            if (!entry) return null;

            return {
                box: entry.spec.box,
                // Copied out: these are Embind views, and holding one past the next WASM call is
                // how a "hit" quietly becomes whatever the next query wrote there.
                point: fromB3(result.point),
                normal: fromB3(result.normal),
                distance: result.fraction * distance,
            };
        },

        bodyOf: (box) => byBoxId.get(box.id) ?? null,
        addMesh: (box, opts) => {
            // A triangle mesh is a surface, not a solid: it has no inside for the solver to push
            // a body out of, so every engine restricts it to non-dynamic bodies. Clamping with a
            // warning beats letting it through to fall through the world at runtime.
            let type = opts.type;
            if (type === 'dynamic') {
                console.warn(
                    '[NacatamalOn] A triangle-mesh collider cannot be dynamic: a mesh is a surface with ' +
                    'no interior, so the solver has nothing to push out of. Falling back to static; use a ' +
                    'hull or a primitive for a body that has to move.',
                );
                type = 'static';
            }
            return add({
                kind: 'mesh', type,
                positions: offsetPositions(opts.geometry.positions ?? EMPTY_POSITIONS, opts.offset),
                indices: opts.geometry.indices ?? EMPTY_INDICES,
                scale: vec3(scaleOf(box)),
                offset: { x: 0, y: 0, z: 0 },
                box, material: materialOf(opts),
            });
        },
    };
};

/**
 * An empty geometry, for a model whose vertices have not landed yet (see `addHull`).
 */
const EMPTY_POSITIONS = new Float32Array(0);
const EMPTY_INDICES = new Uint16Array(0);

const vec3 = ([x, y, z]: [number, number, number]): TVec3 => ({ x, y, z });

/**
 * The collider's offset in the box's local units, multiplied by the box's scale, because the
 * shape it displaces was scaled too, and an offset that did not scale with it would slide off
 * the art the moment the box was resized.
 */
const scaledOffset = (
    offset: [number, number, number] | undefined,
    [sx, sy, sz]: [number, number, number],
): TVec3 => (offset ? { x: offset[0] * sx, y: offset[1] * sy, z: offset[2] * sz } : { x: 0, y: 0, z: 0 });

/**
 * A copy of `positions` shifted by `offset`. Returns the original when there is nothing to shift
 * which is the common case, and one where copying a level's vertex buffer for no reason would be a
 * visible cost.
 */
const offsetPositions = (positions: Float32Array, offset?: [number, number, number]): Float32Array => {
    if (!offset || (offset[0] === 0 && offset[1] === 0 && offset[2] === 0)) return positions;
    const out = new Float32Array(positions.length);
    for (let i = 0; i < positions.length; i += 3) {
        out[i] = positions[i] + offset[0];
        out[i + 1] = positions[i + 1] + offset[1];
        out[i + 2] = positions[i + 2] + offset[2];
    }
    return out;
};

/**
 * Converts a capsule's **total** height (the format's, and the author's) into the distance from
 * its centre to each cap centre (Box3D's).
 *
 * Clamped at zero: a height under `radius * 2` describes a shape shorter than its own caps,
 * which is a sphere. Producing a negative segment instead would build an inverted capsule: a
 * shape the solver accepts and then behaves strangely with, which is far harder to diagnose than
 * a body that is simply rounder than expected.
 */
const halfSegmentOf = (radius: number, height: number): number => Math.max(0, height / 2 - radius);

/**
 * No rotation, in box3d's `{ vector, scalar }` quaternion layout.
 */
const IDENTITY_QUAT: TB3Quat = [0, 0, 0, 1];

/**
 * The 8 corners of a box with the given half-extents, offset, as a flat `[x,y,z, …]` array.
 */
const boxCorners = (half: [number, number, number], offset: TVec3): Float32Array => {
    const out = new Float32Array(24);
    let i = 0;
    for (const sx of [-1, 1]) {
        for (const sy of [-1, 1]) {
            for (const sz of [-1, 1]) {
                out[i++] = offset.x + half[0] * sx;
                out[i++] = offset.y + half[1] * sy;
                out[i++] = offset.z + half[2] * sz;
            }
        }
    }
    return out;
};

/**
 * Builds the WASM shape for one body, the single place a `TBodySpec` becomes box3d geometry.
 *
 * Split out of `materialize` when hull and mesh arrived, because those two allocate WASM data
 * that outlives the call and has to be handed back for freeing (`entry.geometryData`), which a
 * three-way conditional expression had no room to express.
 *
 * The one non-obvious branch is **an offset box**: `b3CreateBoxShape` takes half-extents and no
 * centre, so a box that must not sit on the origin is built as the convex hull of its own eight
 * corners. Identical shape, one indirection, and it only happens when an offset is actually
 * asked for, so the common centred box stays on the cheap analytic path.
 */
const createShape = (
    b3: TBox3dModule,
    id: TBodyId,
    shapeDef: ReturnType<TBox3dModule['b3DefaultShapeDef']>,
    entry: TBodyEntry,
): TShapeId => {
    const spec = entry.spec;
    const off = spec.offset;
    const centred = off.x === 0 && off.y === 0 && off.z === 0;

    if (spec.kind === 'box') {
        if (centred) return b3.b3CreateBoxShape(id, shapeDef, spec.half[0], spec.half[1], spec.half[2]);
        const hull = b3.b3CreateHull(boxCorners(spec.half, off));
        entry.geometryData = { kind: 'hull', handle: hull };
        return b3.b3CreateHullShape(id, shapeDef, hull);
    }

    if (spec.kind === 'sphere') {
        return b3.b3CreateSphereShape(id, shapeDef, { center: toB3(off), radius: spec.radius });
    }

    if (spec.kind === 'capsule') {
        return b3.b3CreateCapsuleShape(id, shapeDef, {
            center1: [off.x, off.y - spec.halfSegment, off.z],
            center2: [off.x, off.y + spec.halfSegment, off.z],
            radius: spec.radius,
        });
    }

    if (spec.kind === 'hull') {
        const hull = b3.b3CreateHull(spec.positions);
        entry.geometryData = { kind: 'hull', handle: hull };
        // The transformed variant is used even with no rotation, because it is the only one that
        // takes a `scale`: a hull is scaled by box3d, not by pre-multiplying its points.
        return b3.b3CreateTransformedHullShape(
            id, shapeDef, hull, { position: [0, 0, 0], quaternion: IDENTITY_QUAT }, toB3(spec.scale),
        );
    }

    const mesh = b3.b3CreateMesh(spec.positions, spec.indices);
    entry.geometryData = { kind: 'mesh', handle: mesh };
    return b3.b3CreateMeshShape(id, shapeDef, mesh, toB3(spec.scale));
};

/**
 * Frees a body's hull/mesh data. A no-op for the analytic shapes, which allocate nothing.
 */
const freeGeometryData = (b3: TBox3dModule, entry: TBodyEntry): void => {
    if (!entry.geometryData) return;
    if (entry.geometryData.kind === 'hull') b3.b3DestroyHull(entry.geometryData.handle as never);
    else b3.b3DestroyMesh(entry.geometryData.handle as never);
    entry.geometryData = null;
};

let warnedNonUniform = false;

/**
 * The box's scale, which multiplies its collider exactly as it multiplies its mesh.
 *
 * A collider is authored in **local units**; the transform scales it. Ignoring scale would let
 * a scaled model and its body disagree, and visibly, since the editor draws the collider outline
 * through that same transform. Applied once at creation: these are fixed shapes in WASM, and
 * rebuilding one per frame is not what this era's games need.
 */
const scaleOf = (box: TGameObject): [number, number, number] => {
    // The WORLD scale: a group that scales its children scales what they collide with too, exactly
    // as it scales what they draw.
    const s = worldPoseOf(box).scale;
    return [s.x, s.y, s.z];
};
