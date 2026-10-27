import { useUpdate } from '../../hooks/loop/use_update';
import { useCleanup } from '../../hooks/scene/use_cleanup';
import { createGameSignal } from '../../signal/create_game_signal';
import { ALL_LAYERS } from '../layers';
import { resolveLayers } from '../layer_names';
import type { TPhysicsLayer } from '../layer_names';
import { placementOf } from '../../box';
import type { TGameObject } from '../../hooks/spawn/use_spawn';
import type { TGameSignal } from '../../signal';
import { loadRapier2D } from './load_rapier';
import { trackPendingWork } from '../../loaders/pending_work';
import type { TRapierModule } from './load_rapier';
import type { ColliderDesc, EventQueue, RigidBodyDesc, World } from '@dimforge/rapier2d-compat';
import type { TBodyOptions, TPhysicsBodyHandle2d, TPhysicsWorldHandle2d, TPhysicsWorldOptions2d } from './types';
import type { TCharacterOptions2d } from './character_body_2d';
import type { TCharacterBody2d } from '../character/t_character_body_2d';
import { worldPose2d, writeWorldPose2d } from './world_pose';
import { physicsStepOf } from '../step_length';
import { getActiveBox, getActiveGame } from '../../store';
import { rootOf } from '../../box/root_of';
import { gameOfBox } from '../../box/box_game';
import { firstTimeIn } from '../../utils/first_time_in';
import type { TRuntimeStore } from '../../store/types/t_runtime_store';
import { sceneTilemaps } from '../../gameobjects/tilemap/scene_tilemaps';
import { tilemapPlacement } from '../../gameobjects/tilemap/tile_queries';
import { tileRevisionOf } from '../../gameobjects/tilemap/tile_revision';
import { tileShapes } from './tile_shapes';
import { createCharacter2d } from './character_body_2d';
import { createSoftBodies } from './soft_body_2d';
import type { TLedge } from './character_body_2d';
import type { TTilemap } from '../../gameobjects/tilemap/types/t_tilemap';
import type { Collider, ImpulseJoint, PhysicsHooks, RevoluteImpulseJoint, PrismaticImpulseJoint, RigidBody } from '@dimforge/rapier2d-compat';
import type { TJoint2d, TJointHandle2d } from './t_joint_2d';

type TBodyEntry = {
    box: TGameObject;
    rapierBodyHandle: number;
    rapierColliderHandle: number;
    impulseQueue: Array<{ x: number; y: number; type: 'impulse' | 'linear' | 'angular' }>;
    /**
     * The push asked for with `applyForce` in one frame, all its calls added up, and which frame.
     * Rapier keeps a force on a body from one step to the next until told otherwise, so asking for
     * one every frame would pile them up: the world hands it this frame's alone. See `stepWorld`.
     */
    force: { x: number; y: number };
    forceFrame: number;
    /**
     * Whether Rapier is holding a force of ours on the body, which has to be taken off once the game
     * stops asking.
     */
    pushing: boolean;
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
    // Which frame this is, for the pushes asked for in it: see `applyForces`.
    let frame = 0;
    const gravityY = options.gravity?.y ?? 900;
    // 1/60, or exactly the game's own step when it has one: see `physicsStepOf`.
    const stepLength = physicsStepOf();
    const bodies = new Map<string, TBodyEntry>();
    /**
     * Collider handle → the body that owns it. Rapier reports a contact as a pair of *collider*
     * handles and nothing else, so without this index an event cannot be turned back into the
     * two boxes the game actually cares about.
     */
    const byCollider = new Map<number, TBodyEntry>();

    // Where the scene is, so its maps can be found: every map an object of this scene draws is part
    // of its world.
    const game = getActiveGame();
    const active = getActiveBox();
    const scene = active === null ? null : rootOf(active);
    /**
     * Each map in the world: the one fixed body holding its colliders, and what it was built from,
     * so it is built again when a cell changes or the map moves.
     */
    const maps = new Map<TTilemap, { body: number; revision: number; place: string; ledges: number[] }>();
    /**
     * Collider handle → the ledge it is. What decides whether something passes through it.
     */
    const ledges = new Map<number, TLedge>();
    /**
     * Character collider handle → what it is standing on that the simulation moves. The solver leaves
     * those pairs alone: the character puts its own weight on them. See the character's move.
     */
    const standing = new Map<number, ReadonlySet<number>>();
    let warnedTurnedMap = false;

    // Start WASM load, but don't block.
    const readyPromise = loadRapier2D().then((r) => {
        rapier = r;
        // Pixels per second squared with +y DOWN, which is the way a placement's y grows here, so
        // earth-ish is a positive nine hundred. The scene always says, since the engine hands the
        // world's record over; this is only what a world with nothing said would fall at.
        world = new r.World({ x: options.gravity?.x ?? 0, y: gravityY });
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
    // Remembered with the scene, for a host that moves the game itself and must not run a frame
    // before the world is there (see `pendingWorkOf`).
    trackPendingWork(readyPromise);

    const flushImpulses = (entry: TBodyEntry) => {
        if (!rapier || !world) return;
        const body = world.getRigidBody(entry.rapierBodyHandle);
        if (!body) return;

        for (const q of entry.impulseQueue) {
            if (q.type === 'impulse') {
                body.applyImpulse({ x: q.x, y: q.y }, true);
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

    const dropMap = (map: TTilemap): void => {
        const entry = maps.get(map);
        if (entry === undefined) return;
        maps.delete(map);
        for (const handle of entry.ledges) ledges.delete(handle);
        const body = world?.getRigidBody(entry.body);
        // Removing the body removes its colliders with it.
        if (body) world?.removeRigidBody(body);
    };

    /**
     * Builds one map into the world: one fixed body where the map is, its walls as boxes, its ledges
     * as boxes that only hold what lands on them, its slopes as their outlines.
     */
    const buildMap = (map: TTilemap, place: ReturnType<typeof tilemapPlacement>, key: string): void => {
        if (!rapier || !world) return;
        const r = rapier;
        const body = world.createRigidBody(r.RigidBodyDesc.fixed().setTranslation(place.x, place.y));
        const { scaleX: sx, scaleY: sy } = place;
        const shapes = tileShapes(map);
        const boxOf = (rect: { x: number; y: number; width: number; height: number }) =>
            r.ColliderDesc.cuboid(Math.abs(rect.width * sx) / 2, Math.abs(rect.height * sy) / 2)
                .setTranslation((rect.x + rect.width / 2) * sx, (rect.y + rect.height / 2) * sy);
        for (const rect of shapes.solids) world.createCollider(boxOf(rect), body);
        const own: number[] = [];
        for (const rect of shapes.oneWays) {
            const collider = world.createCollider(boxOf(rect).setActiveHooks(r.ActiveHooks.FILTER_CONTACT_PAIRS), body);
            ledges.set(collider.handle, {
                top: place.y + rect.y * sy,
                bottom: place.y + (rect.y + rect.height) * sy,
                left: place.x + rect.x * sx,
                right: place.x + (rect.x + rect.width) * sx,
            });
            own.push(collider.handle);
        }
        for (const outline of shapes.slopes) {
            const desc = r.ColliderDesc.convexHull(new Float32Array(outline.flatMap(([x, y]) => [x * sx, y * sy])));
            if (desc !== null) world.createCollider(desc, body);
        }
        maps.set(map, { body: body.handle, revision: tileRevisionOf(map), place: key, ledges: own });
    };

    /**
     * Keeps the world's maps the scene's maps: one that appears is built, one whose cells changed (a
     * brick broken with `setTile`) or that moved is built again, one that went is taken out.
     */
    const syncTilemaps = (): void => {
        if (!rapier || !world || game === null || scene === null) return;
        const seen = new Set<TTilemap>();
        for (const map of sceneTilemaps(game, scene)) {
            const place = tilemapPlacement(map);
            if (place.rotation !== 0) {
                // A turned map has no floor to stand on in any sense a platformer means.
                if (!warnedTurnedMap) {
                    warnedTurnedMap = true;
                    console.warn(`[NacatamalOn] The map '${map.src}' is turned, so it has no colliders: a map in a 2D world can be moved and scaled, not turned.`);
                }
                continue;
            }
            seen.add(map);
            const key = `${place.x},${place.y},${place.scaleX},${place.scaleY}`;
            const entry = maps.get(map);
            if (entry !== undefined && entry.revision === tileRevisionOf(map) && entry.place === key) continue;
            dropMap(map);
            buildMap(map, place, key);
        }
        for (const map of [...maps.keys()]) {
            if (!seen.has(map)) dropMap(map);
        }
    };

    /**
     * The lowest point of a collider, wherever it is turned: how far down its feet reach.
     */
    const bottomOf = (collider: Collider): number => {
        const at = collider.translation();
        const angle = collider.rotation();
        const cos = Math.cos(angle);
        const sin = Math.sin(angle);
        const shape = collider.shape as { halfExtents?: { x: number; y: number }; radius?: number; vertices?: Float32Array };
        if (shape.halfExtents !== undefined) {
            return at.y + Math.abs(shape.halfExtents.x * sin) + Math.abs(shape.halfExtents.y * cos);
        }
        if (shape.vertices !== undefined) {
            let lowest = -Infinity;
            for (let i = 0; i < shape.vertices.length; i += 2) {
                lowest = Math.max(lowest, shape.vertices[i] * sin + shape.vertices[i + 1] * cos);
            }
            return at.y + lowest;
        }
        return at.y + (shape.radius ?? 0);
    };

    /**
     * Where the feet of everything the simulation moves are, and how fast it falls, as each step
     * begins. The filter below reads this and never the world: Rapier asks it in the middle of its
     * step, and reaching back into the world from there fails, quietly, as no contact at all.
     */
    const feet = new Map<number, { bottom: number; vy: number }>();
    /**
     * The pairs a ledge held in the last step, and those it holds in this one. A pair that stopped
     * touching is not asked about, so it is gone from the next step's set: landing on the ledge again
     * is judged afresh, and from below it is not a landing.
     */
    let holding = new Set<string>();
    let held = new Set<string>();
    const measureFeet = (): void => {
        feet.clear();
        if (!world || ledges.size === 0) return;
        for (const entry of bodies.values()) {
            const collider = world.getCollider(entry.rapierColliderHandle);
            const body = collider?.parent();
            if (!collider || !body || !body.isDynamic()) continue;
            feet.set(collider.handle, { bottom: bottomOf(collider), vy: body.linvel().y });
        }
    };

    /**
     * What a ledge does to what the simulation moves: holds what lands on it from above, lets through
     * what comes from below or from the side. Asked of every contact with a ledge, every step.
     */
    const hooks: PhysicsHooks = {
        filterContactPair: (colliderA, colliderB) => {
            if (!rapier) return null;
            if (standing.get(colliderA)?.has(colliderB) === true || standing.get(colliderB)?.has(colliderA) === true) {
                return rapier.SolverFlags.EMPTY;
            }
            const ledgeA = ledges.get(colliderA);
            const ledge = ledgeA ?? ledges.get(colliderB);
            if (ledge === undefined) return rapier.SolverFlags.COMPUTE_IMPULSE;
            const other = feet.get(ledgeA !== undefined ? colliderB : colliderA);
            // Not something the simulation moves: a character, which decides for itself, or another
            // piece of the level.
            if (other === undefined) return rapier.SolverFlags.EMPTY;
            const pair = `${colliderA}:${colliderB}`;
            // Already standing on it: held while it has not sunk past half the ledge, since a body at
            // rest sits a little into what holds it.
            const resting = holding.has(pair) && other.bottom <= ledge.top + (ledge.bottom - ledge.top) / 2;
            // Landing: going down, with its bottom above the top as this step began (or within what
            // one step of falling covers). Going up passes.
            const landing = other.vy >= 0 && other.bottom <= ledge.top + 1 + other.vy * stepLength();
            if (resting || landing) {
                held.add(pair);
                return rapier.SolverFlags.COMPUTE_IMPULSE;
            }
            return rapier.SolverFlags.EMPTY;
        },
        filterIntersectionPair: () => true,
    };

    type TJointEntry = {
        a: TGameObject;
        b: TGameObject | null;
        spec: TJoint2d;
        joint: ImpulseJoint | null;
        // The fixed point a joint to the world is tied to: a body of its own, since Rapier joins bodies.
        pin: RigidBody | null;
        // The two bodies as the solver joins them: the second turns or slides against the first.
        bodies: [RigidBody, RigidBody] | null;
        // A slider's rail, measured on the body it is on.
        axis: { x: number; y: number } | null;
        removed: boolean;
    };
    const joints = new Set<TJointEntry>();
    const softBodies = createSoftBodies({ rapier: () => rapier, world: () => world, frame: () => frame });

    const liveBody = (box: TGameObject): RigidBody | null => {
        const entry = bodies.get(box.id);
        if (!world || entry === undefined || entry.removed || entry.rapierBodyHandle < 0) return null;
        return world.getRigidBody(entry.rapierBodyHandle) ?? null;
    };

    /**
     * A point of the world, measured on a body: where the body has it, whichever way it is turned.
     */
    const localOf = (body: RigidBody, point: { x: number; y: number }): { x: number; y: number } => {
        const at = body.translation();
        const angle = -body.rotation();
        const dx = point.x - at.x;
        const dy = point.y - at.y;
        return { x: dx * Math.cos(angle) - dy * Math.sin(angle), y: dx * Math.sin(angle) + dy * Math.cos(angle) };
    };

    /**
     * Makes a joint once both its bodies are in the world, which is not before Rapier has loaded,
     * and not before an object built after the joint has its body. Asked again every step until then.
     */
    const makeJoint = (entry: TJointEntry): void => {
        if (!rapier || !world || entry.joint !== null || entry.removed) return;
        const r = rapier;
        const w = world;
        const bodyA = liveBody(entry.a);
        const ownB = entry.b === null ? null : liveBody(entry.b);
        if (bodyA === null || (entry.b !== null && ownB === null)) return;
        const spec = entry.spec;
        const centreA = bodyA.translation();
        // The point a joint to the world is tied to.
        const fixedAt = (point: { x: number; y: number }): RigidBody => {
            entry.pin = w.createRigidBody(r.RigidBodyDesc.fixed().setTranslation(point.x, point.y));
            return entry.pin;
        };

        let data;
        let bodyB: RigidBody;
        let first = bodyA;
        let second: RigidBody;
        switch (spec.type) {
            case 'hinge': {
                bodyB = ownB ?? fixedAt(spec.at);
                // `b` first: the solver measures the second body's turn against the first, and a
                // motor and limits are about how `a` turns.
                data = r.JointData.revolute(localOf(bodyB, spec.at), localOf(bodyA, spec.at));
                first = bodyB;
                second = bodyA;
                break;
            }
            case 'rope':
            case 'spring': {
                const atA = spec.atA ?? centreA;
                const atB = spec.atB ?? (ownB !== null ? ownB.translation() : null);
                if (atB === null) {
                    console.warn(`[NacatamalOn] A ${spec.type} from '${entry.a.name}' to the world needs \`atB\`, the point of the world it is tied to. It was not made.`);
                    entry.removed = true;
                    return;
                }
                bodyB = ownB ?? fixedAt(atB);
                const length = spec.length ?? Math.hypot(atB.x - atA.x, atB.y - atA.y);
                if (spec.type === 'rope') {
                    data = r.JointData.rope(length, localOf(bodyA, atA), localOf(bodyB, atB));
                } else {
                    // Said as how often it bounces and how soon it settles, which a game can tune by eye,
                    // and turned into the force the solver wants by the mass it moves: the two masses
                    // together, as one moving against the other, or the one that moves when the other
                    // cannot. So a heavy crate bounces like a light one.
                    const massOf = (body: RigidBody): number => (body.isDynamic() ? body.mass() : Infinity);
                    const ma = massOf(bodyA);
                    const mb = massOf(bodyB);
                    const mass = !Number.isFinite(ma) ? mb : !Number.isFinite(mb) ? ma : (ma * mb) / (ma + mb);
                    const omega = 2 * Math.PI * (spec.frequency ?? 2);
                    const moved = Number.isFinite(mass) ? mass : 1;
                    data = r.JointData.spring(length, moved * omega * omega, moved * 2 * (spec.damping ?? 0.3) * omega, localOf(bodyA, atA), localOf(bodyB, atB));
                }
                second = bodyB;
                break;
            }
            case 'slider': {
                const at = spec.at ?? (ownB !== null ? ownB.translation() : centreA);
                bodyB = ownB ?? fixedAt(at);
                const length = Math.hypot(spec.axis.x, spec.axis.y) || 1;
                const axis = { x: spec.axis.x / length, y: spec.axis.y / length };
                // Measured on the rail, which is `b` (or the world), with `a` sliding along it.
                const turn = -bodyB.rotation();
                const local = { x: axis.x * Math.cos(turn) - axis.y * Math.sin(turn), y: axis.x * Math.sin(turn) + axis.y * Math.cos(turn) };
                data = r.JointData.prismatic(localOf(bodyB, at), localOf(bodyA, at), local);
                entry.axis = local;
                first = bodyB;
                second = bodyA;
                break;
            }
            case 'weld': {
                bodyB = ownB ?? fixedAt(centreA);
                data = r.JointData.fixed(localOf(bodyA, bodyB.translation()), bodyB.rotation() - bodyA.rotation(), { x: 0, y: 0 }, 0);
                second = bodyB;
                break;
            }
        }

        const joint = w.createImpulseJoint(data, first, second, true);
        joint.setContactsEnabled(spec.collide === true);
        if ((spec.type === 'hinge' || spec.type === 'slider') && spec.limits !== undefined) {
            // Either side of where it started: a hinge between two bodies already turned apart
            // starts at that difference.
            const start = spec.type === 'hinge' ? bodyA.rotation() - first.rotation() : 0;
            (joint as RevoluteImpulseJoint | PrismaticImpulseJoint).setLimits(start + spec.limits[0], start + spec.limits[1]);
        }
        if ((spec.type === 'hinge' || spec.type === 'slider') && spec.motor !== undefined) {
            (joint as RevoluteImpulseJoint | PrismaticImpulseJoint).configureMotorVelocity(spec.motor.speed, spec.motor.strength ?? 1);
        }
        entry.bodies = [first, second];
        entry.joint = joint;
    };

    const removeJoint = (entry: TJointEntry): void => {
        if (entry.removed) return;
        entry.removed = true;
        joints.delete(entry);
        if (!world) return;
        // Gone already when a body it joined was taken out of the world: Rapier takes its joints along.
        if (entry.joint !== null && entry.joint.isValid()) world.removeImpulseJoint(entry.joint, true);
        if (entry.pin !== null) world.removeRigidBody(entry.pin);
    };

    const addJoint = (a: TGameObject, b: TGameObject | null, spec: TJoint2d): TJointHandle2d => {
        const entry: TJointEntry = { a, b, spec, joint: null, pin: null, bodies: null, axis: null, removed: false };
        joints.add(entry);
        makeJoint(entry);
        const destroy = (): void => removeJoint(entry);
        // Let go of when either of them is destroyed.
        a.cleanups.push(destroy);
        b?.cleanups.push(destroy);
        return { destroy };
    };

    /**
     * Hands Rapier the pushes the game asked for in the frame just gone, and takes off those it has
     * stopped asking for. Rapier keeps a force on until it is reset, so without this a push asked for
     * every frame would grow every frame.
     */
    const applyForces = (): void => {
        if (!world) return;
        for (const entry of bodies.values()) {
            const asked = entry.forceFrame === frame - 1;
            if (!asked && !entry.pushing) continue;
            const body = world.getRigidBody(entry.rapierBodyHandle);
            if (!body) continue;
            body.resetForces(false);
            // `true` wakes it: a force on a sleeping body does nothing otherwise.
            if (asked) body.addForce(entry.force, true);
            entry.pushing = asked;
        }
    };

    /**
     * Slows what turns on a hinge, or slides on a slider, with `friction`: the two bodies' turning (or
     * sliding) against each other loses that much of itself a second. Done here rather than by the
     * solver, so the number means what it says whatever the bodies weigh. It never wakes anything up:
     * slowing down is what lets a body come to rest and sleep.
     */
    const brakeJoints = (step: number): void => {
        for (const entry of joints) {
            const spec = entry.spec;
            if (entry.bodies === null || entry.joint === null || !entry.joint.isValid()) continue;
            if ((spec.type !== 'hinge' && spec.type !== 'slider') || spec.friction === undefined || spec.friction <= 0) continue;
            const [first, second] = entry.bodies;
            const share = Math.min(1, spec.friction * step);
            if (spec.type === 'hinge') {
                // About the pin, where the joint holds them now: how hard each is to turn there. Read from
                // the joint and not from where it was made, since a pin between two bodies goes where
                // they go: a bridge's hinges hang far from where they were laid once it has broken.
                const local = entry.joint.anchor1();
                const angle = first.rotation();
                const origin = first.translation();
                const pin = {
                    x: origin.x + local.x * Math.cos(angle) - local.y * Math.sin(angle),
                    y: origin.y + local.x * Math.sin(angle) + local.y * Math.cos(angle),
                };
                const about = (body: RigidBody): number => {
                    if (!body.isDynamic()) return Infinity;
                    const at = body.translation();
                    return body.principalInertia() + body.mass() * ((at.x - pin.x) ** 2 + (at.y - pin.y) ** 2);
                };
                const i1 = about(first);
                const i2 = about(second);
                const both = !Number.isFinite(i1) ? i2 : !Number.isFinite(i2) ? i1 : (i1 * i2) / (i1 + i2);
                if (!Number.isFinite(both)) continue;
                const turn = (second.angvel() - first.angvel()) * share * both;
                if (second.isDynamic()) second.applyTorqueImpulse(-turn, false);
                if (first.isDynamic()) first.applyTorqueImpulse(turn, false);
            } else {
                if (entry.axis === null) continue;
                const angle = first.rotation();
                const { x: ux, y: uy } = entry.axis;
                // The rail turns with the body it is on.
                const axis = { x: ux * Math.cos(angle) - uy * Math.sin(angle), y: ux * Math.sin(angle) + uy * Math.cos(angle) };
                const m1 = first.isDynamic() ? first.mass() : Infinity;
                const m2 = second.isDynamic() ? second.mass() : Infinity;
                const both = !Number.isFinite(m1) ? m2 : !Number.isFinite(m2) ? m1 : (m1 * m2) / (m1 + m2);
                if (!Number.isFinite(both)) continue;
                const v1 = first.linvel();
                const v2 = second.linvel();
                const along = ((v2.x - v1.x) * axis.x + (v2.y - v1.y) * axis.y) * share * both;
                if (second.isDynamic()) second.applyImpulse({ x: -axis.x * along, y: -axis.y * along }, false);
                if (first.isDynamic()) first.applyImpulse({ x: axis.x * along, y: axis.y * along }, false);
            }
        }
    };

    const stepWorld = (dt: number) => {
        // Counted whether or not Rapier has loaded, so a push asked for meanwhile is the last frame's.
        frame++;
        if (!rapier || !world) return;
        syncTilemaps();
        applyForces();
        for (const entry of joints) makeJoint(entry);
        softBodies.beforeStep(frame);

        accumulator += dt;
        const length = stepLength();
        world.timestep = length;
        const steps = Math.min(Math.floor(accumulator / length), MAX_FRAMES_PER_STEP);

        for (let i = 0; i < steps; i++) {
            brakeJoints(length);
            measureFeet();
            held = new Set();
            world.step(events ?? undefined, hooks);
            holding = held;
            // Drained per substep, not once after the loop: the queue auto-clears on the next
            // `step`, so batching would silently discard every contact but the last substep's,
            // and a fast bullet's entire hit can live in an earlier one.
            drainEvents();
            // A listener may have ended the scene, and this world with it.
            if (!world) return;
        }

        accumulator -= steps * length;

        // Writeback all bodies to their box transforms.
        for (const entry of bodies.values()) {
            writebackBody(entry);
        }
        softBodies.afterStep();
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
        const shape = scaleCollider(options, pose.scaleX, pose.scaleY, gameOfBox(box));

        const bodyEntry: TBodyEntry = {
            box,
            rapierBodyHandle: -1,
            rapierColliderHandle: -1,
            impulseQueue: [],
            force: { x: 0, y: 0 },
            forceFrame: -1,
            pushing: false,
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

        // The names the game gave its layers, as it is when the body is made, for `setLayers`.
        const layerNames = getActiveGame()?.get('config').physicsLayers ?? [];
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

            // Added to this frame's push, which the world hands Rapier when it next steps: asked for
            // every frame, it pushes steadily at any refresh rate, and stops when the game stops.
            applyForce: (x: number, y: number) => {
                if (bodyEntry.removed) return;
                if (bodyEntry.forceFrame !== frame) {
                    bodyEntry.force = { x: 0, y: 0 };
                    bodyEntry.forceFrame = frame;
                }
                bodyEntry.force.x += x;
                bodyEntry.force.y += y;
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

            setLayers: (given: TPhysicsLayer, givenMask?: number | readonly TPhysicsLayer[]) => {
                if (bodyEntry.removed) return;
                const resolved = resolveLayers({ layer: given, collidesWith: givenMask }, layerNames);
                const layer = resolved.layer ?? 0;
                const mask = resolved.collidesWith ?? shape.collidesWith ?? ALL_LAYERS;
                // Kept on the shape as well as applied, so a body still waiting for the WebAssembly
                // is built on the new layers when it lands.
                shape.layer = layer;
                shape.collidesWith = mask;
                if (box.physics?._type === 'physics-body-2d') {
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

    const addCharacter = (box: TGameObject, options: TCharacterOptions2d): TCharacterBody2d => {
        if (placementOf(box) === null) {
            throw new Error(`[NacatamalOn] useCharacterBody2d: '${box.name}' is nowhere: give it a placement, or something to draw, so the character has somewhere to be.`);
        }
        const character = createCharacter2d({
            rapier: () => rapier,
            world: () => world,
            ledgeOf: (handle) => ledges.get(handle),
            ledges: () => ledges.entries(),
            standOn: (character, under) => {
                if (under.size === 0) standing.delete(character);
                else standing.set(character, under);
            },
            tilemaps: () => [...maps.keys()],
            worldGravity: options.gravity ?? gravityY,
            box,
            options,
        });
        // Moved once the updates that set its speed are over: see `runMoves`.
        box.moveCallbacks.push((dt) => {
            // The world builds its maps when it steps; a character that moves before the first step
            // (a game whose frames are shorter than a step) still finds them.
            syncTilemaps();
            character.move(dt);
        });
        box.cleanups.push(character.remove);
        return character.body;
    };

    // Cleanup on scene unmount.
    useCleanup(() => {
        joints.clear();
        softBodies.clear();
        standing.clear();
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
        addCharacter,
        addJoint,
        addSoftBody: softBodies.add,
    };
};

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
 * overlap is not. Said once per game, `game` being the box's.
 */
const scaleCollider = (options: TBodyOptions, sx: number, sy: number, game: TRuntimeStore | undefined): TBodyOptions => {
        if (sx === 1 && sy === 1) return options;

        if (options.shape === 'rect') {
                return { ...options, width: options.width * sx, height: options.height * sy };
        }

        if (options.shape === 'circle') {
                if (sx !== sy && firstTimeIn(game, 'physics 2d: circle scaled unevenly')) {
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
        // 64-bit wide; see core's `LIMITS.PHYSICS_LAYERS`.
        if (options.layer !== undefined || options.collidesWith !== undefined) {
            colliderDesc.setCollisionGroups(collisionGroupsOf(options.layer ?? 0, options.collidesWith ?? ALL_LAYERS));
        }
    }

    return colliderDesc;
};
