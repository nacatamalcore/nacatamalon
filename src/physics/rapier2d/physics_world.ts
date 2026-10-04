import { useUpdate } from '../../hooks/loop/use_update';
import { useSceneUnmount } from '../../hooks/scene/use_scene_unmount';
import { createGameSignal } from '../../signal/create_game_signal';
import { ALL_LAYERS } from '../layers';
import { placementOf } from '../../box';
import type { TGameObject } from '../../hooks/spawn/use_spawn';
import type { TGameSignal } from '../../signal';
import { loadRapier2D } from './load_rapier';
import type { TRapierModule } from './load_rapier';
import type { ColliderDesc, EventQueue, RigidBodyDesc, World } from '@dimforge/rapier2d-compat';
import type { TBodyOptions, TPhysicsBodyHandle2d, TPhysicsWorldHandle2d, TPhysicsWorldOptions2d } from './types';
import { worldPose2d, writeWorldPose2d } from './world_pose';

type TBodyEntry = {
    box: TGameObject;
    rapierBodyHandle: number;
    rapierColliderHandle: number;
    impulseQueue: Array<{ x: number; y: number; type: 'impulse' | 'force' | 'linear' | 'angular' }>;
    /**
     * Whether this collider asked Rapier to report its contacts. False until someone reads
     * `onEnter`/`onExit` (or the collider is a sensor, which is pointless without them),
     * see `TPhysicsBodyHandle2d.onEnter` for why the opt-in is a property read.
     */
    wantsEvents: boolean;
    /**
     * Created on first read, so a body nobody listens to allocates nothing.
     */
    onEnter: TGameSignal<TGameObject> | null;
    onExit: TGameSignal<TGameObject> | null;
    /**
     * The public handle `createBody` returned, kept so `bodyOf` can hand back **the same
     * object**, not a second one wrapping the same entry. It matters because `onEnter`/`onExit`
     * are lazily-created-on-read: two handles would each believe they owned the signal, and a
     * listener connected through one would never hear a contact reported through the other.
     *
     * Assigned right after construction; never null once the map holds the entry.
     */
    handle: TPhysicsBodyHandle2d;
    /**
     * Whether the body has left the world, because its object was destroyed. Once true nothing
     * reaches Rapier through this entry again: a push from a handle somebody kept is dropped, and
     * a materialization still waiting for the WebAssembly never happens.
     */
    removed: boolean;
};

const FIXED_TIMESTEP = 1 / 60;
const MAX_FRAMES_PER_STEP = 5;

/**
 * Opens a Rapier2D world for the scene being built, and hands back the way to put bodies in it.
 *
 * **Not a door of its own, and that is deliberate.** The scene declares its simulation with the
 * engine's `usePhysicsWorld2d`, and this is what the provider opens when the engine asks. A game
 * that opened one here instead would get a *second* world, with its own gravity and its own
 * bodies, colliding with nothing in the scene: reach the scene's own with `getPhysicsWorld2d()`.
 *
 * The world is stepped at a fixed rate every frame and every body is written back onto its object
 * afterwards. Loading the WebAssembly is deferred, so bodies can be registered before Rapier is
 * ready and their pushes are queued until it is.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const usePhysicsWorld = (options: TPhysicsWorldOptions2d = {}): TPhysicsWorldHandle2d => {
    let rapier: TRapierModule | null = null;
    let world: World | null = null;
    let events: EventQueue | null = null;
    let accumulator = 0;
    const bodies = new Map<string, TBodyEntry>();
    /**
     * Collider handle → the body that owns it. Rapier reports a contact as a pair of *collider*
     * handles and nothing else, so without this index an event cannot be turned back into the
     * two boxes the game actually cares about.
     */
    const byCollider = new Map<number, TBodyEntry>();

    // Start WASM load, but don't block.
    const readyPromise = loadRapier2D().then((r) => {
        rapier = r;
        // Pixels per second squared with +y DOWN, which is the way a placement's y grows here, so
        // earth-ish is a positive nine hundred. The scene always says, since the engine hands the
        // world's record over; this is only what a world with nothing said would fall at.
        world = new r.World({ x: options.gravity?.x ?? 0, y: options.gravity?.y ?? 900 });
        // `autoDrain: true` clears the queue before each `world.step`, which is exactly why
        // `stepWorld` drains after every substep rather than once per frame.
        events = new r.EventQueue(true);

        // Flush any queued impulses on all bodies.
        for (const entry of bodies.values()) {
            flushImpulses(entry);
        }
    }).catch((error) => {
        // Without this the failure is invisible: every body stays frozen at its authored
        // transform and the scene looks merely "wrong" rather than broken.
        console.error('[NacatamalOn] Rapier2D failed to initialize, so physics is inert.', error);
    });

    const flushImpulses = (entry: TBodyEntry) => {
        if (!rapier || !world) return;
        const body = world.getRigidBody(entry.rapierBodyHandle);
        if (!body) return;

        for (const q of entry.impulseQueue) {
            if (q.type === 'impulse') {
                body.applyImpulse({ x: q.x, y: q.y }, true);
            } else if (q.type === 'force') {
                // `true` wakes it: a force on a sleeping body does nothing otherwise.
                body.addForce({ x: q.x, y: q.y }, true);
            } else if (q.type === 'linear') {
                body.setLinvel({ x: q.x, y: q.y }, true);
            } else {
                body.setAngvel(q.x, true);
            }
        }
        entry.impulseQueue = [];
    };

    const writebackBody = (entry: TBodyEntry) => {
        if (!rapier || !world) return;
        // Destroyed this frame and still waiting for the sweep: its body is gone at the end of the
        // frame, and until then nothing is written onto an object that is already dead.
        if (entry.box.destroyed) return;
        // The placement the object really has, the same one `createBody` asked for: reading
        // `box.transform` alone would skip every object placed by what it draws, which here is most
        // of them, and the body would simulate perfectly with nothing on screen moving.
        if (placementOf(entry.box) === null) return;

        const body = world.getRigidBody(entry.rapierBodyHandle);
        if (!body) return;

        // Fixed bodies never move, so writing back would only fight the author's transform.
        if (body.bodyType() === rapier.RigidBodyType.Fixed) return;

        const pos = body.translation();
        // World in, local out: Rapier reports a world pose and the box stores one relative to its
        // parent. Identity for a root-level box, which is most of them.
        // Straight across, with no bridge between two origins: this engine places a picture by its
        // MIDDLE (`anchor` is 0.5 unless somebody says otherwise) and Rapier positions a body by its
        // centre, so the two already agree. The other engine's adapter adds half a size here because
        // there a placement is the top-left corner.
        writeWorldPose2d(entry.box, pos.x, pos.y, body.rotation());
    };

    /**
     * Turn one frame's contacts into signal emissions.
     *
     * Rapier hands back a pair of collider handles plus whether the touch started or stopped;
     * both sides are notified, each receiving the *other* box, which is the payload a game
     * can act on. A side with no signal simply is not notified: only the body that opted in
     * pays, and Rapier reports the pair as long as **either** collider asked (verified: one
     * flag is enough, it is an OR).
     */
    const drainEvents = () => {
        if (!events) return;

        // Read out of the queue first and announced afterwards: whoever hears one can end the scene
        // (a door that changes the room), which frees this world and its queue on the spot, and
        // Rapier is still inside its own drain at that moment.
        const heard: [number, number, boolean][] = [];
        events.drainCollisionEvents((handleA: number, handleB: number, started: boolean) => {
            heard.push([handleA, handleB, started]);
        });

        for (const [handleA, handleB, started] of heard) {
            if (!world) return;
            const a = byCollider.get(handleA);
            const b = byCollider.get(handleB);
            // A collider this world did not create, or one already torn down mid-frame.
            if (!a || !b) continue;
            // Destroyed earlier in this frame: its body is still in the world until the sweep, but
            // a contact with something already dead is not news to anyone.
            if (a.box.destroyed || b.box.destroyed) continue;

            if (started) {
                a.onEnter?.emit(b.box);
                b.onEnter?.emit(a.box);
            } else {
                a.onExit?.emit(b.box);
                b.onExit?.emit(a.box);
            }
        }
    };

    const stepWorld = (dt: number) => {
        if (!rapier || !world) return;

        accumulator += dt;
        const steps = Math.min(Math.floor(accumulator / FIXED_TIMESTEP), MAX_FRAMES_PER_STEP);

        for (let i = 0; i < steps; i++) {
            world.step(events ?? undefined);
            // Drained per substep, not once after the loop: the queue auto-clears on the next
            // `step`, so batching would silently discard every contact but the last substep's,
            // and a fast bullet's entire hit can live in an earlier one.
            drainEvents();
            // A listener may have ended the scene, and this world with it.
            if (!world) return;
        }

        accumulator -= steps * FIXED_TIMESTEP;

        // Writeback all bodies to their box transforms.
        for (const entry of bodies.values()) {
            writebackBody(entry);
        }
    };

    const createBody = (box: TGameObject, options: TBodyOptions): TPhysicsBodyHandle2d => {
        // The placement the object really has, which in this engine is as often its picture's as its
        // own: `createSprite({ transform })` is how nearly every scene here is written, and asking for
        // `box.transform` alone would refuse almost all of them.
        if (placementOf(box) === null) {
            throw new Error(`[NacatamalOn] '${box.name}' has a collider and is nowhere: give it a placement, or something to draw, so the simulation has somewhere to write back to.`);
        }

        // The simulated shape is the authored shape times the object's scale. What the document
        // keeps is the authored (unscaled) value, which the engine wrote down before calling here:
        // the scale is already on the placement beside it, so writing it in twice would apply it
        // twice on the way back in.
        // WORLD scale and, below, world position: a group that moves or scales what is under it moves
        // and scales what they collide with too. See `world_pose.ts`.
        const pose = worldPose2d(box);
        const shape = scaleCollider(options, pose.scaleX, pose.scaleY);

        const bodyEntry: TBodyEntry = {
            box,
            rapierBodyHandle: -1,
            rapierColliderHandle: -1,
            impulseQueue: [],
            // A sensor exists only to report overlaps, so it never waits to be asked.
            wantsEvents: options.sensor === true,
            onEnter: null,
            onExit: null,
            // Filled in below, once the handle this entry describes actually exists.
            handle: null as unknown as TPhysicsBodyHandle2d,
            removed: false,
        };

        const materialize = () => {
            if (!rapier || !world || bodyEntry.removed) return;

            // Re-read at materialization rather than reusing `pose`: WASM loads async, so a box moved
            // between scene init and this moment would otherwise start at where it used to be.
            const start = worldPose2d(box);
            const bodyDesc = createBodyDesc(rapier, options.type, start.x, start.y, start.angle);
            const body = world.createRigidBody(bodyDesc);
            bodyEntry.rapierBodyHandle = body.handle;

            const colliderDesc = createColliderDesc(rapier, shape);
            // A polygon whose points enclose no area has no shape to collide with. Said, and the body
            // is kept without one, rather than failing in the middle of building it with no message.
            if (colliderDesc === null) {
                console.warn(`[NacatamalOn] usePhysicsBody2d: the polygon of '${box.name}' encloses no area, so it has no collider.`);
                flushImpulses(bodyEntry);
                return;
            }
            // Applied here rather than in `createColliderDesc` because the opt-in can arrive at any
            // point before materialization: WASM loads async, so a `body.onEnter` read during scene
            // init routinely runs before this collider exists.
            if (bodyEntry.wantsEvents) colliderDesc.setActiveEvents(rapier.ActiveEvents.COLLISION_EVENTS);

            const collider = world.createCollider(colliderDesc, body);
            bodyEntry.rapierColliderHandle = collider.handle;
            byCollider.set(collider.handle, bodyEntry);

            flushImpulses(bodyEntry);
        };

        /**
         * Return the named signal, creating it (and switching Rapier's reporting on) the first
         * time it is asked for. Handles both sides of the async gap: before materialization the
         * flag is remembered for the descriptor, after it the live collider is updated in place.
         */
        const ensureSignal = (which: 'onEnter' | 'onExit'): TGameSignal<TGameObject> => {
            if (!bodyEntry.wantsEvents) {
                bodyEntry.wantsEvents = true;
                if (rapier && world && bodyEntry.rapierColliderHandle >= 0) {
                    const collider = world.getCollider(bodyEntry.rapierColliderHandle);
                    if (collider) collider.setActiveEvents(rapier.ActiveEvents.COLLISION_EVENTS);
                }
            }

            const existing = bodyEntry[which];
            if (existing) return existing;

            const signal = createGameSignal<TGameObject>();
            bodyEntry[which] = signal;
            return signal;
        };

        if (rapier && world) {
            materialize();
        } else {
            readyPromise.then(materialize);
        }

        bodies.set(box.id, bodyEntry);

        /**
         * Takes the body out of the world when its object is destroyed.
         *
         * Hung on the object's own cleanups, which `destroy` runs, children first, for the object
         * and everything under it. Without it a destroyed object kept its body: an invisible wall
         * where the sprite used to be, a ball falling forever, and two maps that only grew.
         *
         * When the whole scene ends, these run before the world's own teardown (the world lives on
         * the scene's root, and a root's children are torn down before it), and if the world is
         * already gone there is nothing to take out of it.
         */
        const remove = (): void => {
            if (bodyEntry.removed) return;
            bodyEntry.removed = true;
            if (bodies.get(box.id) === bodyEntry) bodies.delete(box.id);
            byCollider.delete(bodyEntry.rapierColliderHandle);
            if (!world) return;
            const body = world.getRigidBody(bodyEntry.rapierBodyHandle);
            // Removing the body removes its collider with it.
            if (body) world.removeRigidBody(body);
        };
        box.cleanups.push(remove);

        const handle: TPhysicsBodyHandle2d = {
            get onEnter() { return ensureSignal('onEnter'); },
            get onExit() { return ensureSignal('onExit'); },

            // A handle kept past its object's destruction pushes nothing.
            applyImpulse: (x: number, y: number) => {
                if (bodyEntry.removed) return;
                if (rapier && world) {
                    const body = world.getRigidBody(bodyEntry.rapierBodyHandle);
                    if (body) body.applyImpulse({ x, y }, true);
                } else {
                    bodyEntry.impulseQueue.push({ x, y, type: 'impulse' });
                }
            },

            applyForce: (x: number, y: number) => {
                if (bodyEntry.removed) return;
                if (rapier && world) {
                    const body = world.getRigidBody(bodyEntry.rapierBodyHandle);
                    if (body) body.addForce({ x, y }, true);
                } else {
                    bodyEntry.impulseQueue.push({ x, y, type: 'force' });
                }
            },

            setLinearVelocity: (vx: number, vy: number) => {
                if (bodyEntry.removed) return;
                if (rapier && world) {
                    const body = world.getRigidBody(bodyEntry.rapierBodyHandle);
                    if (body) body.setLinvel({ x: vx, y: vy }, true);
                } else {
                    // Queued like a push: a velocity set while the object is built, which is where
                    // a moving platform sets its own, used to be dropped before Rapier had loaded.
                    bodyEntry.impulseQueue.push({ x: vx, y: vy, type: 'linear' });
                }
            },

            setAngularVelocity: (w: number) => {
                if (bodyEntry.removed) return;
                if (rapier && world) {
                    const body = world.getRigidBody(bodyEntry.rapierBodyHandle);
                    if (body) body.setAngvel(w, true);
                } else {
                    bodyEntry.impulseQueue.push({ x: w, y: 0, type: 'angular' });
                }
            },

            setLayers: (layer: number, collidesWith?: number) => {
                if (bodyEntry.removed) return;
                const mask = collidesWith ?? shape.collidesWith ?? ALL_LAYERS;
                // Kept on the shape as well as applied, so a body still waiting for the WebAssembly
                // is built on the new layers when it lands.
                shape.layer = layer;
                shape.collidesWith = mask;
                if (box.physics?._type === 'physics2d') {
                    box.physics.layer = layer;
                    box.physics.collidesWith = mask;
                }
                if (world && bodyEntry.rapierColliderHandle >= 0) {
                    world.getCollider(bodyEntry.rapierColliderHandle)?.setCollisionGroups(collisionGroupsOf(layer, mask));
                }
            },

            destroy: remove,
        };

        bodyEntry.handle = handle;
        return handle;
    };

    // Register update callback.
    useUpdate((dt) => {
        stepWorld(dt);
    });

    // Cleanup on scene unmount.
    useSceneUnmount(() => {
        bodies.clear();
        byCollider.clear();
        // The event queue holds WASM memory of its own and is not owned by the world, so
        // freeing the world alone would leak it once per scene change.
        if (events) events.free();
        if (world) world.free();
        events = null;
        world = null;
    });

    return {
        // Spread rather than copy field by field. The explicit version silently dropped every
        // option it did not know about: `sensor` was added to the type, typechecked clean, and
        // did nothing at runtime, which reads as "sensors are broken" rather than "one line is
        // missing". `shape` last so it wins over anything the caller passed.
        addCircle: (box, opts) => createBody(box, { ...opts, shape: 'circle' }),
        addRect: (box, opts) => createBody(box, { ...opts, shape: 'rect' }),
        addPolygon: (box, opts) => createBody(box, { ...opts, shape: 'polygon' }),
        bodyOf: (box) => bodies.get(box.id)?.handle ?? null,
    };
};

let warnedNonUniform = false;

/**
 * Applies the box's `transform.scale` to a collider's geometry.
 *
 * A collider is authored in **local units**, exactly like a sprite's `width`/`height`, and the
 * transform's scale multiplies it. That is not a convention invented here, it is what the
 * renderer already does: `computeMvp` builds the quad from `(sprite.width * scaleX)`, so a
 * sprite at scale 2 draws twice as wide from the same `transform.x`. A collider that ignored
 * scale would therefore be visibly wrong the moment anything was scaled, and the editor's
 * outline (which is drawn through the same transform) would be drawing a lie.
 *
 * Applied once, at creation. A box scaled later in the game does not resize its body, because Rapier
 * colliders are fixed shapes, and rebuilding one per frame is not what this era's games need.
 *
 * A circle has one radius, so a non-uniform scale cannot be represented: it would be an
 * ellipse. The larger axis wins, so the collider **contains** its art rather than sitting
 * inside it: a body that stops slightly early is visible and debuggable, one that lets art
 * overlap is not.
 */
const scaleCollider = (options: TBodyOptions, sx: number, sy: number): TBodyOptions => {
        if (sx === 1 && sy === 1) return options;

        if (options.shape === 'rect') {
                return { ...options, width: options.width * sx, height: options.height * sy };
        }

        if (options.shape === 'circle') {
                if (sx !== sy && !warnedNonUniform) {
                        warnedNonUniform = true;
                        console.warn(
                                `[NacatamalOn] A circle collider cannot be scaled non-uniformly (${sx}x${sy}): ` +
                                'that shape is an ellipse, which the 2D solver has no room for. Using the larger ' +
                                'axis so the collider contains its art. Use a polygon if you need the real shape.',
                        );
                }
                return { ...options, radius: options.radius * Math.max(Math.abs(sx), Math.abs(sy)) };
        }

        return { ...options, vertices: options.vertices.map(([vx, vy]): [number, number] => [vx * sx, vy * sy]) };
};

/**
 * Map the adapter's body type onto Rapier's `RigidBodyType` enum.
 */
const rapierBodyType = (rapier: TRapierModule, type: string): number => {
    switch (type) {
        case 'static':
            return rapier.RigidBodyType.Fixed;
        case 'kinematic':
            // Velocity-based, not position-based: this adapter drives bodies through
            // `setLinearVelocity` (Rapier's `setLinvel`), and a KinematicPositionBased body
            // ignores that entirely: it only moves via `setNextKinematicTranslation`, which
            // nothing here exposes. Velocity-based is the variant the API can actually steer.
            return rapier.RigidBodyType.KinematicVelocityBased;
        default:
            return rapier.RigidBodyType.Dynamic;
    }
};

/**
 * Create a Rapier rigid body descriptor from type and transform.
 */
const createBodyDesc = (rapier: TRapierModule, type: string, x: number, y: number, rotation: number): RigidBodyDesc => {
    // Rapier's own enum, never hardcoded numbers: its ordering is Dynamic = 0, Fixed = 1,
    // which is the opposite of what "static first" intuition suggests.
    const desc = new rapier.RigidBodyDesc(rapierBodyType(rapier, type));
    desc.setTranslation(x, y);
    desc.setRotation(rotation);
    return desc;
};

/**
 * Whether a polygon's points enclose any area: at least three, and not all on one line. Checked
 * before Rapier sees them, because for such points `convexHull` hands back a description that only
 * fails later, inside `createCollider`, with a message that names no shape.
 */
const enclosesArea = (vertices: Array<[number, number]>): boolean => {
    const [first] = vertices;
    if (vertices.length < 3 || first === undefined) {
        return false;
    }
    // Twice the area of a triangle made with the first point: any one away from zero is a real area.
    for (let i = 1; i < vertices.length - 1; i++) {
        const [ax, ay] = vertices[i];
        const [bx, by] = vertices[i + 1];
        if (Math.abs((ax - first[0]) * (by - first[1]) - (ay - first[1]) * (bx - first[0])) > 1e-9) {
            return true;
        }
    }
    return false;
};

/**
 * A layer and a mask as Rapier wants them: one 32-bit word, the membership in the high half and the
 * mask in the low one. That packing is why the format stops at 16 layers.
 */
const collisionGroupsOf = (layer: number, collidesWith: number): number =>
    (((1 << layer) << 16) | collidesWith) >>> 0;

/**
 * Create a Rapier collider descriptor from shape options.
 */
const createColliderDesc = (rapier: TRapierModule, options: TBodyOptions): ColliderDesc | null => {
    // Null for a polygon with no area (see `enclosesArea`), or when `convexHull` itself gives up: the
    // caller skips the collider and says so.
    let colliderDesc: ColliderDesc | null = null;

    if (options.shape === 'circle') {
        colliderDesc = rapier.ColliderDesc.ball(options.radius);
    } else if (options.shape === 'rect') {
        colliderDesc = rapier.ColliderDesc.cuboid(options.width / 2, options.height / 2);
    } else if (options.shape === 'polygon' && enclosesArea(options.vertices)) {
        colliderDesc = rapier.ColliderDesc.convexHull(new Float32Array(options.vertices.flat()));
    }

    if (colliderDesc) {
        if (options.restitution !== undefined) colliderDesc.setRestitution(options.restitution);
        if (options.friction !== undefined) colliderDesc.setFriction(options.friction);
        if (options.density !== undefined) colliderDesc.setDensity(options.density);
        // A sensor detects the overlap and declines to resolve it, so things pass through.
        if (options.sensor) colliderDesc.setSensor(true);

        // Collision layers. Rapier packs both halves into one u32 (membership in the high 16 bits,
        // the mask in the low 16) and tests them mutually: `((a >> 16) & b) && ((b >> 16) & a)`.
        // That 16-bit ceiling is why the format caps at 16 layers even though Box3D's filter is
        // 64-bit wide; see core's `PHYSICS_LAYERS`.
        if (options.layer !== undefined || options.collidesWith !== undefined) {
            colliderDesc.setCollisionGroups(collisionGroupsOf(options.layer ?? 0, options.collidesWith ?? ALL_LAYERS));
        }
    }

    return colliderDesc;
};
