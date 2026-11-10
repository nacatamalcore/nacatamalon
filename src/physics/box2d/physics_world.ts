import { useUpdate } from '../../hooks/loop/use_update';
import { useCleanup } from '../../hooks/scene/use_cleanup';
import { createGameSignal } from '../../signal/create_game_signal';
import { ALL_LAYERS } from '../layers';
import { resolveLayers } from '../layer_names';
import type { TPhysicsLayer } from '../layer_names';
import { placementOf } from '../../box';
import type { TGameObject } from '../../hooks/spawn/use_spawn';
import type { TGameSignal } from '../../signal';
import { trackPendingWork } from '../../loaders/pending_work';
import type { TBodyOptions, TPhysicsBodyHandle2d, TPhysicsWorldHandle2d, TPhysicsWorldOptions2d } from './types';
import type { TCharacterBody2d } from '../character/t_character_body_2d';
import { worldPose2d, writeWorldPose2d } from './world_pose';
import { physicsStepOf } from '../step_length';
import { getActiveBox, getActiveGame } from '../../store';
import { rootOf } from '../../box/root_of';
import { gameOfBox } from '../../box/box_game';
import { firstTimeIn } from '../../utils/first_time_in';
import type { TRuntimeStore } from '../../store/types/t_runtime_store';
import { nameOfMap } from '../../gameobjects/tilemap/get_tilemap';
import { sceneTilemaps } from '../../gameobjects/tilemap/scene_tilemaps';
import { tilemapPlacement } from '../../gameobjects/tilemap/tile_queries';
import { tileRevisionOf } from '../../gameobjects/tilemap/tile_revision';
import type { TTilemap } from '../../gameobjects/tilemap/types/t_tilemap';
import { tileShapes } from './tile_shapes';
import type { TJoint2d, TJointHandle2d } from './t_joint_2d';
import { loadBox2D, SHAPE_LEDGE, SHAPE_SENSOR } from './load_box2d';
import type { TBox2d } from './load_box2d';
import { createCharacter2d } from './character_body_2d';
import type { TCharacterOptions2d, TLedge } from './character_body_2d';
import { createSoftBodies } from './soft_body_2d';

/**
 * Each object's body, in whichever world it was put: what `getPhysicsBody2d` reads. An object does
 * not know its world, and a game reaching for its body should not have to name one, so the body is
 * found by the object alone, while the scene is built or in any frame after. Weak, so an object
 * gone is forgotten.
 *
 * @internal
 */
export const bodyOfObject2d = new WeakMap<TGameObject, TPhysicsBodyHandle2d>();

type TBodyEntry = {
    box: TGameObject;
    /**
     * The body in the simulation, or -1 until the WebAssembly has landed.
     */
    body: number;
    /**
     * Its shapes: one, or several for a polygon of more corners than one shape holds.
     */
    shapes: number[];
    still: boolean;
    /**
     * Whether the simulation moves it. Two bodies of which neither moves (a trigger and a wall, a
     * platform and the floor) are not news when they overlap: nothing happened between them.
     */
    moving: boolean;
    impulseQueue: Array<{ x: number; y: number; type: 'impulse' | 'linear' | 'angular' }>;
    /**
     * The push asked for with `applyForce` in one frame, all its calls added up, and which frame. The
     * simulation forgets a force once it has stepped, so the world hands it again before every step
     * of the next frame. See `applyForces`.
     */
    force: { x: number; y: number };
    forceFrame: number;
    /**
     * Whether it is being pushed, and so kept awake: see `applyForces`.
     */
    pushing: boolean;
    /**
     * Created on first read, so a body nobody listens to allocates nothing.
     */
    onEnter: TGameSignal<TGameObject> | null;
    onExit: TGameSignal<TGameObject> | null;
    /**
     * The public handle `createBody` returned, kept so `getPhysicsBody2d` can hand back **the same
     * object**, not a second one wrapping the same entry. It matters because `onEnter`/`onExit`
     * are lazily-created-on-read: two handles would each believe they owned the signal, and a
     * listener connected through one would never hear a contact reported through the other.
     *
     * Assigned right after construction; never null once the map holds the entry.
     */
    handle: TPhysicsBodyHandle2d;
    /**
     * Whether the body has left the world, because its object was destroyed. Once true nothing
     * reaches the simulation through this entry again: a push from a handle somebody kept is dropped,
     * and a materialization still waiting for the WebAssembly never happens.
     */
    removed: boolean;
};

const MAX_FRAMES_PER_STEP = 5;
/**
 * The least a box's half side or a circle's radius is, in pixels. Something drawn at no size (a sprite
 * that pops in from a scale of 0) still has a body the simulation can weigh; at 0 it has no mass, and
 * its numbers go to nothing a step later.
 */
const LEAST_SIZE = 0.05;
/**
 * How many times the solver goes over the contacts and joints in one step. Four is Box2D's own advice:
 * stacks stand and joints hold, for little.
 */
const SUBSTEPS = 4;
/**
 * Every layer, as a map's shapes are: on all of them, meeting all of them.
 */
const EVERY_LAYER = 0xffff;
/**
 * The most corners one shape holds. A polygon with more is cut into pieces of one body.
 */
const MOST_CORNERS = 8;
/**
 * How fast a motor can speed up what it turns or slides, at `strength` 1: enough for a hinge to lift a
 * bar of its own weight, and a slider a platform against the default gravity. Radians and pixels a
 * second, each second.
 */
const HINGE_PULL = 50;
const SLIDER_PULL = 1000;

/**
 * Opens a 2D world for the scene being built, and hands back the way to put bodies in it.
 *
 * **Not a door of its own, and that is deliberate.** The scene declares its simulation with the
 * engine's `usePhysicsWorld2d`, and this is what the provider opens when the engine asks. A game
 * that opened one here instead would get a *second* world, with its own gravity and its own
 * bodies, colliding with nothing in the scene: reach the scene's own with `getPhysicsWorld2d()`.
 *
 * The world is stepped at a fixed rate every frame and every body is written back onto its object
 * afterwards. Loading the WebAssembly is deferred, so bodies can be registered before it is ready
 * and their pushes are queued until it is.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const usePhysicsWorld = (options: TPhysicsWorldOptions2d = {}): TPhysicsWorldHandle2d => {
    let box2d: TBox2d | null = null;
    let world: number | null = null;
    let accumulator = 0;
    // Which frame this is, for the pushes asked for in it: see `applyForces`.
    let frame = 0;
    const gravityY = options.gravity?.y ?? 900;
    // 1/60, or exactly the game's own step when it has one: see `physicsStepOf`.
    const stepLength = physicsStepOf();
    const bodies = new Map<string, TBodyEntry>();
    /**
     * Shape → the body that owns it. The simulation reports a contact as a pair of shapes and nothing
     * else, so without this index an event cannot be turned back into the two boxes the game actually
     * cares about.
     */
    const byShape = new Map<number, TBodyEntry>();

    // Where the scene is, so its maps can be found: every map an object of this scene draws is part
    // of its world.
    const game = getActiveGame();
    const active = getActiveBox();
    const scene = active === null ? null : rootOf(active);
    /**
     * Each map in the world: the one still body holding its shapes, and what it was built from, so it
     * is built again when a cell changes or the map moves.
     */
    const maps = new Map<TTilemap, { body: number; revision: number; place: string; ledges: number[] }>();
    /**
     * Shape → the ledge it is. What decides whether something passes through it.
     */
    const ledges = new Map<number, TLedge>();
    /**
     * A character's shape → what it is standing on that the simulation moves. The solver leaves those
     * pairs alone: the character puts its own weight on them. See the character's move.
     */
    const standing = new Map<number, ReadonlySet<number>>();
    let warnedTurnedMap = false;

    /**
     * Where the feet of everything the simulation moves are, and how fast it falls, as each step
     * begins. The ledges' question below reads this and never the world: it is asked in the middle of
     * a step, where the world cannot be changed.
     */
    const feet = new Map<number, { bottom: number; vy: number }>();
    /**
     * The pairs a ledge held in the last step, and those it holds in this one. A pair that stopped
     * touching is not asked about, so it is gone from the next step's set: landing on the ledge again
     * is judged afresh, and from below it is not a landing.
     */
    let holding = new Set<string>();
    let held = new Set<string>();

    /**
     * What a ledge does to what the simulation moves: holds what lands on it from above, lets through
     * what comes from below or from the side. Asked of every contact with a ledge, every step. And what
     * a character stands on is left to the character's weight.
     */
    const presolve = (shapeA: number, shapeB: number): boolean => {
        if (standing.get(shapeA)?.has(shapeB) === true || standing.get(shapeB)?.has(shapeA) === true) return false;
        const ledgeA = ledges.get(shapeA);
        const ledge = ledgeA ?? ledges.get(shapeB);
        if (ledge === undefined) return true;
        const other = feet.get(ledgeA !== undefined ? shapeB : shapeA);
        // Not something the simulation moves: a character, which decides for itself, or another
        // piece of the level.
        if (other === undefined) return false;
        const pair = `${shapeA}:${shapeB}`;
        // Already standing on it: held while it has not sunk past half the ledge, since a body at
        // rest sits a little into what holds it.
        const resting = holding.has(pair) && other.bottom <= ledge.top + (ledge.bottom - ledge.top) / 2;
        // Landing: going down, with its bottom above the top as this step began (or within what
        // one step of falling covers). Going up passes.
        const landing = other.vy >= 0 && other.bottom <= ledge.top + 1 + other.vy * stepLength();
        if (resting || landing) {
            held.add(pair);
            return true;
        }
        return false;
    };

    // Whether the scene has ended: a scene can end before the WebAssembly lands, and its world must
    // then never be made, or it would be kept for ever (and the simulation holds 128 at most).
    let closed = false;

    // Start WASM load, but don't block.
    const readyPromise = loadBox2D().then((loaded) => {
        if (closed) return;
        // Pixels per second squared with +y DOWN, which is the way a placement's y grows here, so
        // earth-ish is a positive nine hundred. The scene always says, since the engine hands the
        // world's record over; this is only what a world with nothing said would fall at.
        const made = loaded.b2.nb_world_create(options.gravity?.x ?? 0, gravityY);
        if (made < 0) {
            console.error('[NacatamalOn] physics2d: there are already 128 2D worlds open, so this scene\'s physics is inert. A scene that is left has to be stopped for its world to go.');
            return;
        }
        box2d = loaded;
        world = made;
        loaded.presolvers.set(world, presolve);

        // Flush any queued impulses on all bodies.
        for (const entry of bodies.values()) {
            flushImpulses(entry);
        }
    }).catch((error) => {
        // Without this the failure is invisible: every body stays frozen at its authored
        // transform and the scene looks merely "wrong" rather than broken.
        console.error('[NacatamalOn] physics2d: the 2D physics failed to load, so physics is inert.', error);
    });
    // Remembered with the scene, for a host that moves the game itself and must not run a frame
    // before the world is there (see `pendingWorkOf`).
    trackPendingWork(readyPromise);

    const flushImpulses = (entry: TBodyEntry) => {
        if (box2d === null || world === null || entry.body < 0 || entry.removed) return;
        const b2 = box2d.b2;
        for (const q of entry.impulseQueue) {
            if (q.type === 'impulse') {
                b2.nb_body_impulse(entry.body, q.x, q.y, 1);
            } else if (q.type === 'linear') {
                b2.nb_body_set_velocity(entry.body, q.x, q.y);
            } else {
                b2.nb_body_set_spin(entry.body, q.x);
            }
        }
        entry.impulseQueue = [];
    };

    const writebackBody = (entry: TBodyEntry) => {
        if (box2d === null || world === null || entry.body < 0 || entry.removed) return;
        // Destroyed this frame and still waiting for the sweep: its body is gone at the end of the
        // frame, and until then nothing is written onto an object that is already dead.
        if (entry.box.destroyed) return;
        // The placement the object really has, the same one `createBody` asked for: reading
        // `box.transform` alone would skip every object placed by what it draws, which here is most
        // of them, and the body would simulate perfectly with nothing on screen moving.
        if (placementOf(entry.box) === null) return;
        // Still bodies never move, so writing back would only fight the author's transform.
        if (entry.still) return;
        const b2 = box2d.b2;
        // World in, local out: the simulation reports a world pose and the box stores one relative to
        // its parent. Identity for a root-level box, which is most of them. Straight across, with no
        // bridge between two origins: this engine places a picture by its MIDDLE and a body is placed
        // by its centre, so the two already agree.
        writeWorldPose2d(entry.box, b2.nb_body_x(entry.body), b2.nb_body_y(entry.body), b2.nb_body_angle(entry.body));
    };

    /**
     * How many shapes of each pair of bodies touch: a body made of several shapes (a polygon of many
     * corners) starts touching once and stops once, however many of its shapes the other meets on the
     * way. Keyed by the two objects' ids, in order.
     */
    const touching = new Map<string, { count: number; a: TBodyEntry; b: TBodyEntry }>();
    const pairKey = (a: TBodyEntry, b: TBodyEntry): string => (a.box.id < b.box.id ? `${a.box.id}|${b.box.id}` : `${b.box.id}|${a.box.id}`);

    /**
     * Turn one step's contacts into signal emissions.
     *
     * The simulation hands back pairs of shapes, and whether the touch started or stopped (a sensor's
     * the same, in a list of its own); both sides are notified, each receiving the *other* box, which
     * is the payload a game can act on. A side with no signal simply is not notified. A pair is told
     * when its first shape starts touching and when its last one stops, and two sensors that see each
     * other (each reports the other) are one touch.
     */
    const drainEvents = () => {
        if (box2d === null || world === null) return;
        // Read out of the simulation first and announced afterwards: whoever hears one can end the
        // scene (a door that changes the room), which closes this world on the spot.
        const count = box2d.b2.nb_world_events(world);
        if (count === 0) return;
        const heard = Array.from(box2d.output(count * 3).i32);

        for (let i = 0; i < count; i++) {
            if (world === null) return;
            const kind = heard[i * 3];
            const a = byShape.get(heard[i * 3 + 1]);
            const b = byShape.get(heard[i * 3 + 2]);
            // A shape this world did not make for a body (a map, a character), or one already gone.
            if (!a || !b || a === b) continue;
            // Destroyed earlier in this frame: its body is still in the world until the sweep, but
            // a contact with something already dead is not news to anyone.
            if (a.box.destroyed || b.box.destroyed) continue;
            if (!a.moving && !b.moving) continue;

            const key = pairKey(a, b);
            const pair = touching.get(key);
            if (kind === 1 || kind === 3) {
                if (pair !== undefined) {
                    pair.count++;
                    continue;
                }
                touching.set(key, { count: 1, a, b });
                a.onEnter?.emit(b.box);
                b.onEnter?.emit(a.box);
            } else {
                if (pair === undefined) continue;
                pair.count--;
                if (pair.count > 0) continue;
                touching.delete(key);
                a.onExit?.emit(b.box);
                b.onExit?.emit(a.box);
            }
        }
    };

    const dropMap = (map: TTilemap): void => {
        const entry = maps.get(map);
        if (entry === undefined) return;
        maps.delete(map);
        for (const shape of entry.ledges) ledges.delete(shape);
        // Taking the body out takes its shapes with it.
        if (box2d !== null && world !== null) box2d.b2.nb_body_destroy(entry.body);
    };

    /**
     * Builds one map into the world: one still body where the map is, its walls as boxes, its ledges
     * as boxes that only hold what lands on them, its slopes as their outlines.
     */
    const buildMap = (map: TTilemap, place: ReturnType<typeof tilemapPlacement>, key: string): void => {
        if (box2d === null || world === null) return;
        const b2 = box2d.b2;
        const body = b2.nb_body_create(world, 0, place.x, place.y, 0);
        const { scaleX: sx, scaleY: sy } = place;
        const shapes = tileShapes(map);
        const boxOf = (rect: { x: number; y: number; width: number; height: number }, flags: number): number =>
            b2.nb_shape_box(body, Math.abs(rect.width * sx) / 2, Math.abs(rect.height * sy) / 2, (rect.x + rect.width / 2) * sx, (rect.y + rect.height / 2) * sy, 0, 1, 0.5, 0, flags, EVERY_LAYER, EVERY_LAYER);
        for (const rect of shapes.solids) boxOf(rect, 0);
        const own: number[] = [];
        for (const rect of shapes.oneWays) {
            const shape = boxOf(rect, SHAPE_LEDGE);
            ledges.set(shape, {
                top: place.y + rect.y * sy,
                bottom: place.y + (rect.y + rect.height) * sy,
                left: place.x + rect.x * sx,
                right: place.x + (rect.x + rect.width) * sx,
            });
            own.push(shape);
        }
        for (const outline of shapes.slopes) {
            addPolygon(box2d, body, outline.map(([x, y]): [number, number] => [x * sx, y * sy]), 1, 0.5, 0, 0, EVERY_LAYER, EVERY_LAYER);
        }
        maps.set(map, { body, revision: tileRevisionOf(map), place: key, ledges: own });
    };

    /**
     * Keeps the world's maps the scene's maps: one that appears is built, one whose cells changed (a
     * brick broken with `setTile`) or that moved is built again, one that went is taken out.
     */
    const syncTilemaps = (): void => {
        if (box2d === null || world === null || game === null || scene === null) return;
        const seen = new Set<TTilemap>();
        for (const map of sceneTilemaps(game, scene)) {
            const place = tilemapPlacement(map);
            if (place.rotation !== 0) {
                // A turned map has no floor to stand on in any sense a platformer means.
                if (!warnedTurnedMap) {
                    warnedTurnedMap = true;
                    console.warn(`[NacatamalOn] physics2d: ${nameOfMap(map)} is turned, so it has no colliders: a map in a 2D world can be moved and scaled, not turned.`);
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

    const measureFeet = (): void => {
        feet.clear();
        if (box2d === null || world === null || ledges.size === 0) return;
        const b2 = box2d.b2;
        for (const entry of bodies.values()) {
            if (entry.body < 0 || entry.removed || entry.still || b2.nb_body_type(entry.body) !== 2) continue;
            const vy = b2.nb_body_vy(entry.body);
            for (const shape of entry.shapes) feet.set(shape, { bottom: b2.nb_shape_bottom(shape), vy });
        }
        softBodies.measureFeet(feet);
    };

    type TJointEntry = {
        a: TGameObject;
        b: TGameObject | null;
        spec: TJoint2d;
        joint: number;
        // The fixed point a joint to the world is tied to: a body of its own, since joints join bodies.
        pin: number;
        // The two bodies as the solver joins them: the second turns or slides against the first.
        bodies: [number, number] | null;
        // A slider's rail, measured on the body it is on.
        axis: { x: number; y: number } | null;
        removed: boolean;
    };
    const joints = new Set<TJointEntry>();
    /**
     * The characters of this world, whose bodies are carried to where they are before every step.
     */
    const characters = new Set<ReturnType<typeof createCharacter2d>>();
    const softBodies = createSoftBodies({ box2d: () => box2d, world: () => world, frame: () => frame });

    const liveBody = (box: TGameObject): number | null => {
        const entry = bodies.get(box.id);
        if (box2d === null || world === null || entry === undefined || entry.removed || entry.body < 0) return null;
        return box2d.b2.nb_body_valid(entry.body) !== 0 ? entry.body : null;
    };

    /**
     * A point of the world, measured on a body: where the body has it, whichever way it is turned.
     */
    const localOf = (b2: TBox2d['b2'], body: number, point: { x: number; y: number }): { x: number; y: number } => {
        const angle = -b2.nb_body_angle(body);
        const dx = point.x - b2.nb_body_x(body);
        const dy = point.y - b2.nb_body_y(body);
        return { x: dx * Math.cos(angle) - dy * Math.sin(angle), y: dx * Math.sin(angle) + dy * Math.cos(angle) };
    };

    const isMoving = (b2: TBox2d['b2'], body: number): boolean => b2.nb_body_type(body) === 2;

    /**
     * Makes a joint once both its bodies are in the world, which is not before the WebAssembly has
     * loaded, and not before an object built after the joint has its body. Asked again every step
     * until then.
     */
    const makeJoint = (entry: TJointEntry): void => {
        if (box2d === null || world === null || entry.joint >= 0 || entry.removed) return;
        const b2 = box2d.b2;
        const w = world;
        const bodyA = liveBody(entry.a);
        const ownB = entry.b === null ? null : liveBody(entry.b);
        if (bodyA === null || (entry.b !== null && ownB === null)) return;
        const spec = entry.spec;
        const centreA = { x: b2.nb_body_x(bodyA), y: b2.nb_body_y(bodyA) };
        const centreOf = (body: number) => ({ x: b2.nb_body_x(body), y: b2.nb_body_y(body) });
        // The point a joint to the world is tied to.
        const fixedAt = (point: { x: number; y: number }): number => {
            entry.pin = b2.nb_body_create(w, 0, point.x, point.y, 0);
            return entry.pin;
        };
        const collide = spec.collide === true ? 1 : 0;

        let joint: number;
        let first = bodyA;
        let second: number;
        switch (spec.type) {
            case 'hinge': {
                // `b` first: the second body's turn is measured against the first, and a motor and
                // limits are about how `a` turns. Limits are either side of where it starts.
                first = ownB ?? fixedAt(spec.at);
                second = bodyA;
                const local1 = localOf(b2, first, spec.at);
                const local2 = localOf(b2, second, spec.at);
                // Taken round to within half a turn: the simulation measures the turn from there, and
                // does not take it round itself.
                const turned = b2.nb_body_angle(second) - b2.nb_body_angle(first);
                const start = Math.atan2(Math.sin(turned), Math.cos(turned));
                const limits = spec.limits;
                const motor = spec.motor;
                // How hard it is to turn the two about the pin: what the motor's strength is measured by.
                const about = (body: number): number => {
                    if (!isMoving(b2, body)) return Infinity;
                    const at = { x: b2.nb_body_mass_x(body), y: b2.nb_body_mass_y(body) };
                    return b2.nb_body_inertia(body) + b2.nb_body_mass(body) * ((at.x - spec.at.x) ** 2 + (at.y - spec.at.y) ** 2);
                };
                const torque = motor === undefined ? 0 : (motor.strength ?? 1) * HINGE_PULL * reduced(about(first), about(second));
                joint = b2.nb_joint_hinge(
                    first, second, local1.x, local1.y, local2.x, local2.y, start,
                    limits !== undefined ? 1 : 0, limits?.[0] ?? 0, limits?.[1] ?? 0,
                    motor !== undefined ? 1 : 0, torque, motor?.speed ?? 0, collide,
                );
                break;
            }
            case 'rope':
            case 'spring': {
                const atA = spec.atA ?? centreA;
                const atB = spec.atB ?? (ownB !== null ? centreOf(ownB) : null);
                if (atB === null) {
                    console.warn(`[NacatamalOn] useJoint2d: a ${spec.type} from '${entry.a.name}' to the world needs \`atB\`, the point of the world it is tied to. It was not made.`);
                    entry.removed = true;
                    return;
                }
                second = ownB ?? fixedAt(atB);
                const length = spec.length ?? Math.hypot(atB.x - atA.x, atB.y - atA.y);
                const localA = localOf(b2, bodyA, atA);
                const localB = localOf(b2, second, atB);
                if (spec.type === 'rope') {
                    // A spring of no stiffness is no length at all, and the limit is the rope: only its
                    // longest holds.
                    joint = b2.nb_joint_distance(bodyA, second, localA.x, localA.y, localB.x, localB.y, length, 1, 0, 0, 1, 0, length, collide);
                } else {
                    // Said as how often it bounces and how soon it settles, which is what the simulation
                    // takes: a heavy crate bounces like a light one.
                    joint = b2.nb_joint_distance(bodyA, second, localA.x, localA.y, localB.x, localB.y, length, 1, spec.frequency ?? 2, spec.damping ?? 0.3, 0, 0, 0, collide);
                }
                break;
            }
            case 'slider': {
                const at = spec.at ?? (ownB !== null ? centreOf(ownB) : centreA);
                // Measured on the rail, which is `b` (or the world), with `a` sliding along it.
                first = ownB ?? fixedAt(at);
                second = bodyA;
                const length = Math.hypot(spec.axis.x, spec.axis.y) || 1;
                const axis = { x: spec.axis.x / length, y: spec.axis.y / length };
                const turn = -b2.nb_body_angle(first);
                const local = { x: axis.x * Math.cos(turn) - axis.y * Math.sin(turn), y: axis.x * Math.sin(turn) + axis.y * Math.cos(turn) };
                const local1 = localOf(b2, first, at);
                const local2 = localOf(b2, second, at);
                const limits = spec.limits;
                const motor = spec.motor;
                const massOf = (body: number): number => (isMoving(b2, body) ? b2.nb_body_mass(body) : Infinity);
                const force = motor === undefined ? 0 : (motor.strength ?? 1) * SLIDER_PULL * reduced(massOf(first), massOf(second));
                joint = b2.nb_joint_slider(
                    first, second, local1.x, local1.y, local2.x, local2.y, local.x, local.y,
                    b2.nb_body_angle(second) - b2.nb_body_angle(first),
                    limits !== undefined ? 1 : 0, limits?.[0] ?? 0, limits?.[1] ?? 0,
                    motor !== undefined ? 1 : 0, force, motor?.speed ?? 0, collide,
                );
                entry.axis = local;
                break;
            }
            case 'weld': {
                second = ownB ?? fixedAt(centreA);
                const local = localOf(b2, bodyA, centreOf(second));
                joint = b2.nb_joint_weld(bodyA, second, local.x, local.y, 0, 0, b2.nb_body_angle(second) - b2.nb_body_angle(bodyA), 0, 0, 0, collide);
                break;
            }
        }

        entry.bodies = [first, second];
        entry.joint = joint;
    };

    const removeJoint = (entry: TJointEntry): void => {
        if (entry.removed) return;
        entry.removed = true;
        joints.delete(entry);
        if (box2d === null || world === null) return;
        // Gone already when a body it joined was taken out of the world, which takes its joints along:
        // its slot is let go of all the same.
        if (entry.joint >= 0) box2d.b2.nb_joint_destroy(entry.joint);
        if (entry.pin >= 0) box2d.b2.nb_body_destroy(entry.pin);
    };

    const addJoint = (a: TGameObject, b: TGameObject | null, spec: TJoint2d): TJointHandle2d => {
        const entry: TJointEntry = { a, b, spec, joint: -1, pin: -1, bodies: null, axis: null, removed: false };
        joints.add(entry);
        makeJoint(entry);
        const destroy = (): void => removeJoint(entry);
        // Let go of when either of them is destroyed.
        a.cleanups.push(destroy);
        b?.cleanups.push(destroy);
        return { destroy };
    };

    /**
     * Hands the simulation the pushes the game asked for in the frame just gone. It forgets a force
     * once it has stepped, so this is asked before every step: a push asked for every frame pushes
     * steadily, and one the game stopped asking for is simply not handed over.
     */
    const applyForces = (): void => {
        if (box2d === null || world === null) return;
        const b2 = box2d.b2;
        for (const entry of bodies.values()) {
            if (entry.body < 0 || entry.removed) continue;
            const asked = entry.forceFrame === frame - 1;
            // Kept awake while it is pushed: a body pushed gently is slow, and one that falls asleep loses
            // its speed. It may sleep again once the game stops pushing.
            if (asked !== entry.pushing) {
                entry.pushing = asked;
                b2.nb_body_sleep(entry.body, asked ? 0 : 1);
            }
            // Woken: a force on a sleeping body does nothing otherwise.
            if (asked) b2.nb_body_force(entry.body, entry.force.x, entry.force.y, 1);
        }
    };

    /**
     * Slows what turns on a hinge, or slides on a slider, with `friction`: the two bodies' turning (or
     * sliding) against each other loses that much of itself a second. Done here rather than by the
     * solver, so the number means what it says whatever the bodies weigh. It never wakes anything up:
     * slowing down is what lets a body come to rest and sleep.
     */
    const brakeJoints = (step: number): void => {
        if (box2d === null) return;
        const b2 = box2d.b2;
        for (const entry of joints) {
            const spec = entry.spec;
            if (entry.bodies === null || entry.joint < 0 || b2.nb_joint_valid(entry.joint) === 0) continue;
            if ((spec.type !== 'hinge' && spec.type !== 'slider') || spec.friction === undefined || spec.friction <= 0) continue;
            const [first, second] = entry.bodies;
            const share = Math.min(1, spec.friction * step);
            if (spec.type === 'hinge') {
                // About the pin, where the joint holds them now: how hard each is to turn there. Read from
                // the joint and not from where it was made, since a pin between two bodies goes where
                // they go: a bridge's hinges hang far from where they were laid once it has broken.
                const lx = b2.nb_joint_anchor_x(entry.joint);
                const ly = b2.nb_joint_anchor_y(entry.joint);
                const angle = b2.nb_body_angle(first);
                const pin = {
                    x: b2.nb_body_x(first) + lx * Math.cos(angle) - ly * Math.sin(angle),
                    y: b2.nb_body_y(first) + lx * Math.sin(angle) + ly * Math.cos(angle),
                };
                const about = (body: number): number => {
                    if (!isMoving(b2, body)) return Infinity;
                    const at = { x: b2.nb_body_mass_x(body), y: b2.nb_body_mass_y(body) };
                    return b2.nb_body_inertia(body) + b2.nb_body_mass(body) * ((at.x - pin.x) ** 2 + (at.y - pin.y) ** 2);
                };
                const both = reduced(about(first), about(second));
                if (!Number.isFinite(both)) continue;
                const turn = (b2.nb_body_spin(second) - b2.nb_body_spin(first)) * share * both;
                if (isMoving(b2, second)) b2.nb_body_turn_impulse(second, -turn, 0);
                if (isMoving(b2, first)) b2.nb_body_turn_impulse(first, turn, 0);
            } else {
                if (entry.axis === null) continue;
                const angle = b2.nb_body_angle(first);
                const { x: ux, y: uy } = entry.axis;
                // The rail turns with the body it is on.
                const axis = { x: ux * Math.cos(angle) - uy * Math.sin(angle), y: ux * Math.sin(angle) + uy * Math.cos(angle) };
                const m1 = isMoving(b2, first) ? b2.nb_body_mass(first) : Infinity;
                const m2 = isMoving(b2, second) ? b2.nb_body_mass(second) : Infinity;
                const both = reduced(m1, m2);
                if (!Number.isFinite(both)) continue;
                const along = ((b2.nb_body_vx(second) - b2.nb_body_vx(first)) * axis.x + (b2.nb_body_vy(second) - b2.nb_body_vy(first)) * axis.y) * share * both;
                if (isMoving(b2, second)) b2.nb_body_impulse(second, -axis.x * along, -axis.y * along, 0);
                if (isMoving(b2, first)) b2.nb_body_impulse(first, axis.x * along, axis.y * along, 0);
            }
        }
    };

    const stepWorld = (dt: number) => {
        // Counted whether or not the simulation has loaded, so a push asked for meanwhile is the last
        // frame's.
        frame++;
        if (box2d === null || world === null) return;
        syncTilemaps();
        for (const entry of joints) makeJoint(entry);
        softBodies.beforeStep(frame);

        accumulator += dt;
        const length = stepLength();
        const steps = Math.min(Math.floor(accumulator / length), MAX_FRAMES_PER_STEP);

        for (let i = 0; i < steps; i++) {
            for (const character of characters) character.beforeStep(length);
            applyForces();
            softBodies.applyPushes(frame, length);
            brakeJoints(length);
            measureFeet();
            held = new Set();
            box2d.b2.nb_world_step(world, length, SUBSTEPS);
            holding = held;
            // Drained after every step, not once after the loop: a fast bullet's whole hit can begin
            // and end in an earlier one.
            drainEvents();
            // A listener may have ended the scene, and this world with it.
            if (world === null) return;
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
            throw new Error(`[NacatamalOn] physics2d: '${box.name}' has a collider and is nowhere: give it a placement, or something to draw, so the simulation has somewhere to write back to.`);
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
            body: -1,
            shapes: [],
            still: options.type === 'static',
            moving: options.type === 'dynamic',
            impulseQueue: [],
            force: { x: 0, y: 0 },
            forceFrame: -1,
            pushing: false,
            onEnter: null,
            onExit: null,
            // Filled in below, once the handle this entry describes actually exists.
            handle: null as unknown as TPhysicsBodyHandle2d,
            removed: false,
        };

        const materialize = () => {
            if (box2d === null || world === null || bodyEntry.removed) return;
            const b2 = box2d.b2;

            // Re-read at materialization rather than reusing `pose`: WASM loads async, so a box moved
            // between scene init and this moment would otherwise start at where it used to be.
            const start = worldPose2d(box);
            bodyEntry.body = b2.nb_body_create(world, bodyTypeOf(shape.type), start.x, start.y, start.angle);

            bodyEntry.shapes = createShapes(box2d, bodyEntry.body, shape);
            // A polygon whose points enclose no area has no shape to collide with. Said, and the body
            // is kept without one, rather than failing in the middle of building it with no message.
            if (bodyEntry.shapes.length === 0) {
                console.warn(`[NacatamalOn] usePhysicsBody2d: the polygon of '${box.name}' encloses no area, so it has no collider.`);
            }
            for (const made of bodyEntry.shapes) byShape.set(made, bodyEntry);

            flushImpulses(bodyEntry);
        };

        /**
         * Return the named signal, creating it the first time it is asked for.
         */
        const ensureSignal = (which: 'onEnter' | 'onExit'): TGameSignal<TGameObject> => {
            const existing = bodyEntry[which];
            if (existing) return existing;
            const signal = createGameSignal<TGameObject>();
            bodyEntry[which] = signal;
            return signal;
        };

        /**
         * Listens for one kind of contact. Set up while a scene or a piece is being built, the
         * listener leaves with it, like a pointer's; later, what is handed back stops it.
         */
        const listenContact = (which: 'onEnter' | 'onExit', listener: (other: TGameObject) => void): (() => void) => {
            const off = ensureSignal(which).connect(listener);
            getActiveBox()?.cleanups.push(off);
            return off;
        };

        if (box2d !== null && world !== null) {
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
            if (bodyOfObject2d.get(box) === bodyEntry.handle) bodyOfObject2d.delete(box);
            for (const made of bodyEntry.shapes) byShape.delete(made);
            // What it was touching is forgotten with it: it is not there to stop touching anything.
            for (const [key, pair] of touching) {
                if (pair.a === bodyEntry || pair.b === bodyEntry) touching.delete(key);
            }
            if (box2d === null || world === null || bodyEntry.body < 0) return;
            // Taking the body out takes its shapes with it.
            box2d.b2.nb_body_destroy(bodyEntry.body);
            bodyEntry.body = -1;
            bodyEntry.shapes = [];
        };
        box.cleanups.push(remove);

        // The names the game gave its layers, as it is when the body is made, for `setLayers`.
        const layerNames = getActiveGame()?.get('config').physicsLayers ?? [];
        const live = (): boolean => !bodyEntry.removed && box2d !== null && world !== null && bodyEntry.body >= 0;
        const handle: TPhysicsBodyHandle2d = {
            onEnter: (listener) => listenContact('onEnter', listener),
            onExit: (listener) => listenContact('onExit', listener),

            // A handle kept past its object's destruction pushes nothing.
            applyImpulse: (x: number, y: number) => {
                if (bodyEntry.removed) return;
                if (live()) box2d!.b2.nb_body_impulse(bodyEntry.body, x, y, 1);
                else bodyEntry.impulseQueue.push({ x, y, type: 'impulse' });
            },

            // Added to this frame's push, which the world hands the simulation before every step of the
            // next frame: asked for every frame, it pushes steadily at any refresh rate, and stops when
            // the game stops.
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
                if (live()) box2d!.b2.nb_body_set_velocity(bodyEntry.body, vx, vy);
                // Queued like a push: a velocity set while the object is built, which is where a
                // moving platform sets its own, would be dropped before the simulation had loaded.
                else bodyEntry.impulseQueue.push({ x: vx, y: vy, type: 'linear' });
            },

            setAngularVelocity: (w: number) => {
                if (bodyEntry.removed) return;
                if (live()) box2d!.b2.nb_body_set_spin(bodyEntry.body, w);
                else bodyEntry.impulseQueue.push({ x: w, y: 0, type: 'angular' });
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
                if (live()) {
                    for (const made of bodyEntry.shapes) box2d!.b2.nb_shape_filter(made, 1 << layer, mask);
                    // A body at rest would not look for what it no longer meets until something woke it.
                    if (!bodyEntry.still) box2d!.b2.nb_body_wake(bodyEntry.body);
                }
            },

            destroy: remove,
        };

        bodyEntry.handle = handle;
        bodyOfObject2d.set(box, handle);
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
            box2d: () => box2d,
            world: () => world,
            ledgeOf: (shape) => ledges.get(shape),
            ledges: () => ledges.entries(),
            standOn: (presence, under) => {
                if (under.size === 0) standing.delete(presence);
                else standing.set(presence, under);
            },
            tilemaps: () => [...maps.keys()],
            stepLength,
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
        characters.add(character);
        box.cleanups.push(() => {
            characters.delete(character);
            character.remove();
        });
        return character.body;
    };

    // Cleanup on scene unmount.
    useCleanup(() => {
        closed = true;
        joints.clear();
        characters.clear();
        touching.clear();
        softBodies.clear();
        standing.clear();
        for (const entry of bodies.values()) {
            if (bodyOfObject2d.get(entry.box) === entry.handle) bodyOfObject2d.delete(entry.box);
        }
        bodies.clear();
        byShape.clear();
        ledges.clear();
        maps.clear();
        if (box2d !== null && world !== null) {
            box2d.presolvers.delete(world);
            box2d.b2.nb_world_destroy(world);
        }
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
        addCharacter,
        addJoint,
        addSoftBody: softBodies.add,
    };
};

/**
 * Two things moved against each other as one: what each weighs (or how hard each is to turn) taken
 * together. Something that does not move counts as infinitely heavy, leaving the other.
 */
const reduced = (a: number, b: number): number =>
    !Number.isFinite(a) ? b : !Number.isFinite(b) ? a : (a * b) / (a + b);

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
 * Applied once, at creation. A box scaled later in the game does not resize its body, because a
 * shape is fixed once made, and rebuilding one per frame is not what this era's games need.
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
                `[NacatamalOn] physics2d: a circle collider cannot be scaled non-uniformly (${sx}x${sy}): ` +
                'that shape is an ellipse, which the 2D solver has no room for. Using the larger ' +
                'axis so the collider contains its art. Use a polygon if you need the real shape.',
            );
        }
        return { ...options, radius: options.radius * Math.max(Math.abs(sx), Math.abs(sy)) };
    }

    return { ...options, vertices: options.vertices.map(([vx, vy]): [number, number] => [vx * sx, vy * sy]) };
};

/**
 * The engine's way a body moves as the simulation's number: 0 still, 1 moved by the game (by the
 * velocity it is given), 2 moved by the simulation.
 */
const bodyTypeOf = (type: string): number => (type === 'static' ? 0 : type === 'kinematic' ? 1 : 2);

/**
 * The outline round a set of points, clockwise on the screen, with no point inside it or on a side:
 * what a polygon collider is, whatever order its points were given in.
 */
const convexHull = (points: ReadonlyArray<readonly [number, number]>): Array<[number, number]> => {
    const sorted = [...points].map(([x, y]): [number, number] => [x, y]).sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    if (sorted.length < 3) return sorted;
    const cross = (o: [number, number], a: [number, number], b: [number, number]) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
    const lower: Array<[number, number]> = [];
    for (const point of sorted) {
        while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], point) <= 1e-9) lower.pop();
        lower.push(point);
    }
    const upper: Array<[number, number]> = [];
    for (let i = sorted.length - 1; i >= 0; i--) {
        const point = sorted[i];
        while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], point) <= 1e-9) upper.pop();
        upper.push(point);
    }
    upper.pop();
    lower.pop();
    return lower.concat(upper);
};

/**
 * Puts a polygon on a body: one shape when its outline has few enough corners, and otherwise a fan of
 * pieces from its first corner, each of no more than one shape holds. The pieces together are the
 * outline, so it collides as one. Empty when the points enclose no area.
 *
 * @internal
 */
export const addPolygon = (
    box2d: TBox2d,
    body: number,
    vertices: ReadonlyArray<readonly [number, number]>,
    density: number,
    friction: number,
    bounce: number,
    flags: number,
    category: number,
    mask: number,
): number[] => {
    if (!enclosesArea(vertices)) return [];
    const hull = convexHull(vertices);
    if (hull.length < 3) return [];
    const pieces: Array<Array<[number, number]>> = [];
    if (hull.length <= MOST_CORNERS) {
        pieces.push(hull);
    } else {
        for (let i = 1; i < hull.length - 1; i += MOST_CORNERS - 2) {
            pieces.push([hull[0], ...hull.slice(i, Math.min(i + MOST_CORNERS - 1, hull.length))]);
        }
    }
    const made: number[] = [];
    for (const piece of pieces) {
        const input = box2d.input(piece.length * 2);
        piece.forEach(([x, y], i) => {
            input[i * 2] = x;
            input[i * 2 + 1] = y;
        });
        const shape = box2d.b2.nb_shape_polygon(body, piece.length, 0, density, friction, bounce, flags, category, mask);
        if (shape >= 0) made.push(shape);
    }
    return made;
};

/**
 * Whether a polygon's points enclose any area: at least three, and not all on one line.
 */
const enclosesArea = (vertices: ReadonlyArray<readonly [number, number]>): boolean => {
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
 * The shapes of one collider on its body, with its surface and its layers. A collider that says
 * nothing about layers is on every layer and meets every layer, as one always was before layers.
 */
const createShapes = (box2d: TBox2d, body: number, options: TBodyOptions): number[] => {
    const b2 = box2d.b2;
    const density = options.density ?? 1;
    const friction = options.friction ?? 0.5;
    const bounce = options.bounce ?? 0;
    const flags = options.sensor === true ? SHAPE_SENSOR : 0;
    const layered = options.layer !== undefined || options.collidesWith !== undefined;
    const category = layered ? 1 << (options.layer ?? 0) : EVERY_LAYER;
    const mask = layered ? (options.collidesWith ?? ALL_LAYERS) : EVERY_LAYER;

    if (options.shape === 'circle') {
        return [b2.nb_shape_circle(body, 0, 0, Math.max(Math.abs(options.radius), LEAST_SIZE), density, friction, bounce, flags, category, mask)];
    }
    if (options.shape === 'rect') {
        // Its size whichever way it is flipped: an object scaled by -1 to face the other way.
        const halfWidth = Math.max(Math.abs(options.width) / 2, LEAST_SIZE);
        const halfHeight = Math.max(Math.abs(options.height) / 2, LEAST_SIZE);
        return [b2.nb_shape_box(body, halfWidth, halfHeight, 0, 0, 0, density, friction, bounce, flags, category, mask)];
    }
    return addPolygon(box2d, body, options.vertices, density, friction, bounce, flags, category, mask);
};
