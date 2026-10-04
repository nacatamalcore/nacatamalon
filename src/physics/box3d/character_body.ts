import { fromB3, toB3 } from './load_box3d';
import type { TBox3dModule } from './load_box3d';
import type { TGameObject } from '../../hooks/spawn/use_spawn';
import { worldPoseOf, writeWorldPosition } from './world_pose';

/**
 * What a character's mover query *is*, as a collision category: the bit that lets a body opt out
 * of being walked into without opting out of anything else.
 *
 * A character is solved by queries, so it has no shape in the world, which means nothing in the
 * world can notice it: a trigger volume reports no visitor and a crate feels no shove. The world
 * therefore gives each character a kinematic capsule that follows it (see `addCharacter`), and
 * that capsule must be invisible to the very query that positions it, or the character finds
 * itself on the first step and locks in place.
 *
 * **The exclusion has to be by mask, not by category**, and that is forced rather than chosen.
 * The proxy's category must stay inside the authored 16-layer range or no door could ever filter
 * for it (an authored `collidesWith` is 16 bits wide and could never match a reserved high bit).
 * So instead every *ordinary* shape's mask is widened by this bit ("yes, a character may walk
 * into me") and the proxy's is not. Measured: box3d's query filter is mutual, so dropping the
 * bit from one side is enough.
 *
 * Bit 62 because the format caps at 16 layers while box3d's filter is 64 bits wide, so this is a
 * bit no authored collider can ever be on, and reserving it costs the project nothing.
 */
export const MOVER_CATEGORY = 1n << 62n;

/**
 * A kinematic character: the thing that separates "boxes that fall" from "somebody walks here".
 *
 * A character is deliberately **not a dynamic body**. A dynamic capsule steered by forces fights
 * its own momentum and friction: it slides on slopes, tips over, skates after you let go of the
 * stick, and catches on the seam between two floor tiles. Every engine solves this the same way
 * and so does this one: the character is a capsule moved by *queries* against the world
 * (`b3World_CollideMover` + `b3SolvePlanes`, Box2D v3's mover primitives), resolved to a position
 * that does not overlap anything, then written onto the box's transform.
 *
 * Set {@link TCharacterBody.velocity}, and the world advances it on its own fixed step. Gravity is applied for you (set `gravity: 0` for a
 * flyer), because a controller that falls is what "character" means to nearly everyone asking
 * for one.
 *
 * @category Physics
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TCharacterBody = {
    /**
     * Metres per second, **mutable in place**: write into it from a `useUpdate` and the next
     * step uses it. This is the whole steering surface: horizontal components walk, a positive
     * `y` jumps, and gravity pulls `y` down between steps.
     *
     * **Re-assert it every frame, not once.** The controller *clips* this vector against whatever
     * the character is touching, which is what makes a wall stop you and what keeps gravity from
     * accumulating while you stand still. The same clipping eats a walk that was set once: on a
     * slope, the part of the velocity pointing into the surface is removed every step, so a
     * "set and forget" walk decays within a second and the character slides back down.
     */
    velocity: { x: number; y: number; z: number };
    /**
     * Whether a surface flat enough to stand on is underfoot, decided from the contact planes of
     * the step just taken (`normal.y >= cos(slopeLimit)`), so a wall never counts and a ramp
     * steeper than the limit slides you off instead of letting you climb it.
     */
    readonly isGrounded: boolean;
    /**
     * Places the character without consulting the world: spawning, respawning, a cutscene. The
     * ordinary way to move is {@link TCharacterBody.velocity}; this is the escape hatch, and it
     * *can* put you inside a wall, which is why it is not the ordinary way.
     */
    setPosition: (x: number, y: number, z: number) => void;
    /**
     * Stops driving the object, which keeps whatever placement it last had.
     */
    destroy: () => void;
};

/**
 * Everything a character needs beyond its world: the capsule it occupies, how it treats slopes,
 * and where that capsule sits inside its box.
 *
 * `height` is the **total** height including the caps, the same convention `Collider3D`'s capsule
 * uses, so a 1.8 m person is `{ radius: 0.3, height: 1.8 }`.
 *
 * @category Physics
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TCharacterOptions = {
    radius: number;
    height: number;
    /**
     * The steepest surface that still counts as ground, in radians. Default ~50°. Anything steeper is a wall as far as {@link TCharacterBody.isGrounded} is
     * concerned, so you slide down it rather than stand on it.
     */
    slopeLimit?: number;
    /**
     * Downward acceleration in m/s², applied every step. Defaults to the world's own gravity
     * magnitude so a character falls at the same rate as everything around it. `0` for a flyer
     * or a top-down game.
     */
    gravity?: number;
    /**
     * Where the capsule's centre sits relative to the box's origin, in local units before scale
     * which is the same field a collider carries, and needed for the same reason: a character model
     * from a glTF almost always has its origin at its **feet**, so a capsule centred on the
     * origin would bury the character's legs in the floor.
     */
    offset?: [number, number, number];
    /**
     * The collision layer the character's **presence proxy** is on, and which layers may see it
     * read exactly like a collider's (see the engine's `TPhysicsSurface`), because it is one.
     *
     * This is what a trigger volume filters on. A door that should open for the player and not
     * for a wandering crate puts the player on its own layer and collides with that alone,
     * rather than checking a name at runtime.
     *
     * The proxy is excluded from every mover query by its MASK (see `MOVER_CATEGORY`) rather than
     * by its category, so `layer` stays free to narrow who may notice it. Omitted means layer 0
     * against everything, the same default a collider has.
     */
    layer?: number;
    collidesWith?: number;
};

type TVec3 = { x: number; y: number; z: number };

/**
 * How many collide→solve passes one step takes. The solver resolves the planes it was given, but
 * moving out of one surface can push into another (an inside corner, a step against a wall), so
 * the planes are re-gathered and solved again. Four is enough for the corners a level has and
 * cheap enough to run every substep; the loop also exits early once the remaining motion is
 * negligible, which is the common case.
 */
const SOLVE_PASSES = 4;

/**
 * Floats per plane in the buffer `b3World_CollideMover` hands back: normal, offset, point.
 */
const PLANE_FLOATS = 7;

/**
 * Beyond this much overlap box3d stops reporting a contact plane at all. **Measured**, not
 * documented: a mover sunk ~0.25 into a floor gets back zero planes and would then fall straight
 * through it.
 *
 * Nothing here needs to correct for that, because the algorithm never gets there: every step
 * begins by solving out of whatever shallow overlap the last one left. It is recorded because it
 * is the failure mode of any change that lets the character move a long way between solves,
 * a larger fixed step, or skipping the solve on a frame.
 */
export const MAX_REPORTED_OVERLAP = 0.25;

const dot = (a: TVec3, b: TVec3): number => a.x * b.x + a.y * b.y + a.z * b.z;

/**
 * Removes the component of `v` that points into any plane it is already resting against, which is what
 * turns "walking into a wall" into "sliding along it", and what stops gravity accumulating into
 * a bottomless downward velocity while standing still.
 *
 * Done here rather than with box3d's own `b3ClipVector`, which was measured to clip only planes
 * whose `push` field the solver filled in, and the solver fills it in WASM-side, on a copy
 * Embind never gives back. The arithmetic is three lines; the round trip is not available.
 */
const clipVelocity = (v: TVec3, planes: TCollisionPlane[]): void => {
    for (const p of planes) {
        const into = dot(v, p.plane.normal);
        if (into >= 0) continue;
        v.x -= p.plane.normal.x * into;
        v.y -= p.plane.normal.y * into;
        v.z -= p.plane.normal.z * into;
    }
};

/**
 * One contact plane in the shape `b3SolvePlanes` wants. `pushLimit` is left effectively infinite:
 * limiting the push is how you build a character that can be crushed, and nothing asks for that
 * yet.
 */
type TCollisionPlane = {
    plane: { normal: TVec3; offset: number };
    pushLimit: number;
    push: number;
    clipVelocity: boolean;
};

/**
 * Reads the contact planes around `origin` out of box3d.
 *
 * The callback is invoked once per overlapping shape with a packed float buffer: `[nx, ny, nz,
 * offset, px, py, pz]` per plane, with the point relative to `origin` and `offset` the
 * penetration depth. All measured; the type declarations describe a buffer shape the binding
 * does not actually deliver.
 *
 * `skip` drops the character's own shape, which is why the character may have a body in the world
 * at all without immediately colliding with itself.
 */
const collectPlanes = (
    b3: TBox3dModule,
    world: Parameters<TBox3dModule['b3World_CollideMover']>[0],
    origin: TVec3,
    mover: { center1: TVec3; center2: TVec3; radius: number },
    filter: ReturnType<TBox3dModule['b3DefaultQueryFilter']>,
): TCollisionPlane[] => {
    const planes: TCollisionPlane[] = [];
    const capsule = { center1: toB3(mover.center1), center2: toB3(mover.center2), radius: mover.radius };
    b3.b3World_CollideMover(world, toB3(origin), capsule, filter, ((
        shape: Parameters<TBox3dModule['b3Shape_IsSensor']>[0],
        buffer: { count: number; data: Float32Array },
    ) => {
        // A sensor is not a surface. Measured: box3d reports sensor shapes to this query with
        // real contact planes, so without this a trigger volume is a **wall** to a character,
        // a doorway you cannot walk through, and the same volume every other body passes
        // straight into. The solid/trigger distinction has to be re-applied here because the
        // mover query is geometry, not simulation: it answers "what overlaps this capsule",
        // and only the caller knows which of those are meant to stop it.
        if (b3.b3Shape_IsSensor(shape)) return true;

        for (let i = 0; i < buffer.count; i++) {
            const at = i * PLANE_FLOATS;
            planes.push({
                plane: {
                    normal: { x: buffer.data[at], y: buffer.data[at + 1], z: buffer.data[at + 2] },
                    offset: buffer.data[at + 3],
                },
                pushLimit: Number.MAX_VALUE,
                push: 0,
                clipVelocity: true,
            });
        }
        return true;
    }) as never);
    return planes;
};

/**
 * Builds one character. Kept out of `physics_world.ts` because it is a solver in its own right:
 * everything else in that file hands a shape to box3d and reads a transform back, while this
 * *is* the loop.
 */
export const createCharacter = (deps: {
    b3: () => TBox3dModule | null;
    world: () => Parameters<TBox3dModule['b3World_CollideMover']>[0] | null;
    box: TGameObject;
    options: TCharacterOptions;
    worldGravity: number;
}): {
    body: TCharacterBody;
    step: (dt: number) => void;
    /**
     * The capsule's solved **centre**, live and mutated in place, and not the box's origin, which is
     * this minus the configured offset. The world reads it to keep the presence proxy on top of
     * the character, and it must be the centre because that is what a capsule body is positioned
     * by; handing over the transform instead would place the proxy off by the offset on every
     * character that uses one.
     */
    centre: TVec3;
    /**
     * The capsule the mover solves, so the proxy can be built to exactly the same dimensions.
     */
    mover: { center1: TVec3; center2: TVec3; radius: number };
} => {
    const { box, options } = deps;
    const slopeLimit = options.slopeLimit ?? (50 * Math.PI) / 180;
    const minGroundNormalY = Math.cos(slopeLimit);
    const gravity = options.gravity ?? deps.worldGravity;
    const [ox, oy, oz] = options.offset ?? [0, 0, 0];

    // The capsule's own dimensions never change, so the mover is built once. Scale is read at
    // creation like every other shape's is: a character that resizes mid-walk is not a thing.
    // World scale and world position, for the same reason every other body reads them: the
    // character walks in the simulation's one global space, while its box stores a placement
    // relative to whatever it hangs from. See `world_pose.ts`.
    const pose = worldPoseOf(box);
    const sx = pose.scale.x;
    const sy = pose.scale.y;
    const sz = pose.scale.z;
    const radius = options.radius * Math.max(Math.abs(sx), Math.abs(sz));
    const halfSegment = Math.max(0, (options.height * Math.abs(sy)) / 2 - radius);
    const mover = {
        center1: { x: 0, y: -halfSegment, z: 0 },
        center2: { x: 0, y: halfSegment, z: 0 },
        radius,
    };

    // The offset separates where the capsule is from where the box's origin is. Everything below
    // solves the CAPSULE's centre; the transform gets the origin back at the end of each step.
    const shift = { x: ox * sx, y: oy * sy, z: oz * sz };
    const centre: TVec3 = {
        x: pose.position.x + shift.x,
        y: pose.position.y + shift.y,
        z: pose.position.z + shift.z,
    };

    const velocity: TVec3 = { x: 0, y: 0, z: 0 };
    let grounded = false;
    let destroyed = false;
    let filter: ReturnType<TBox3dModule['b3DefaultQueryFilter']> | null = null;

    const writeBack = (): void => {
        writeWorldPosition(box, {
            x: centre.x - shift.x,
            y: centre.y - shift.y,
            z: centre.z - shift.z,
        });
    };

    const step = (dt: number): void => {
        const b3 = deps.b3();
        const world = deps.world();
        if (destroyed || !b3 || world === null) return;
        if (!filter) {
            filter = b3.b3DefaultQueryFilter();
            // The query announces itself as a mover, which every ordinary shape's mask accepts
            // and a character's presence proxy's does not, including this character's own,
            // which sits exactly where the query is being asked from. Without the exclusion the
            // capsule finds itself, resolves out of itself, and the character cannot move.
            filter.categoryBits = MOVER_CATEGORY;
        }

        velocity.y -= gravity * dt;

        // What the character is *asking* for this step. The solver gives back how much of it was
        // actually available, and the rest is re-asked for after re-gathering planes, which is
        // what makes a slide along a wall reach the end of the wall rather than stopping at it.
        let remaining: TVec3 = { x: velocity.x * dt, y: velocity.y * dt, z: velocity.z * dt };
        grounded = false;

        for (let pass = 0; pass < SOLVE_PASSES; pass++) {
            const planes = collectPlanes(b3, world, centre, mover, filter);

            for (const p of planes) {
                if (p.plane.normal.y >= minGroundNormalY) grounded = true;
            }

            // Kept as `{ x, y, z }` for everything here that reads them; box3d gets its own arrays.
            const asked = planes.map((p) => ({ ...p, plane: { normal: toB3(p.plane.normal), offset: p.plane.offset } }));
            const solved = b3.b3SolvePlanes(toB3(remaining), asked as never);
            const delta = fromB3(solved.delta);
            centre.x += delta.x;
            centre.y += delta.y;
            centre.z += delta.z;
            remaining = {
                x: remaining.x - delta.x,
                y: remaining.y - delta.y,
                z: remaining.z - delta.z,
            };

            // Velocity has to lose what the geometry took, or the next step re-asks for a motion
            // the world already refused: a character pressed against a wall would build up
            // speed and shoot sideways the moment the wall ended.
            clipVelocity(velocity, planes);

            if (Math.abs(remaining.x) + Math.abs(remaining.y) + Math.abs(remaining.z) < 1e-6) break;
        }

        writeBack();
    };

    const body: TCharacterBody = {
        velocity,
        get isGrounded() { return grounded; },
        setPosition: (x, y, z) => {
            centre.x = x + shift.x;
            centre.y = y + shift.y;
            centre.z = z + shift.z;
            writeBack();
        },
        destroy: () => { destroyed = true; },
    };

    return { body, step, centre, mover };
};
