import { worldPose2d, writeWorldPose2d } from './world_pose';
import type { TGameObject } from '../../hooks/spawn/use_spawn';
import type { TTilemap } from '../../gameobjects/tilemap/types/t_tilemap';
import type { TTileDoc } from '../../loaders/tilemap/types/t_tilemap_doc';
import type { TCharacterBody2d, TCharacterShape2d } from '../character/t_character_body_2d';
import { readCharacterTiles, tilesUnder } from '../character/character_tiles';
import { SHAPE_LEDGE, SHAPE_PRESENCE } from './load_box2d';
import type { TBox2d } from './load_box2d';

/**
 * What a character in the simulation is: its size and how it falls, and how it climbs and pushes.
 *
 * @category Physics
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TCharacterOptions2d = TCharacterShape2d & {
    /**
     * The steepest slope it walks up, in radians. About 50° by default; steeper ones it slides down.
     */
    maxSlope?: number;
    /**
     * Whether walking into something the simulation moves pushes it. `true` by default.
     */
    pushes?: boolean;
    /**
     * How heavy it is: what it weighs on a bridge or a crate it stands on, and how heavy a thing it can
     * push at full pace. Left out, its size at the density of a crate (width times height).
     */
    mass?: number;
    /**
     * Its collision layer and what it collides with, as any body's.
     */
    layer?: number;
    collidesWith?: number;
};

/**
 * A ledge in the world: the top a character's feet have to be above for it to stand on it, its
 * bottom, and how far it reaches either side.
 *
 * @internal
 */
export type TLedge = { top: number; bottom: number; left: number; right: number };

const DEFAULT_MAX_FALL = 420;
const DEFAULT_MAX_SLOPE = (50 * Math.PI) / 180;
/**
 * How far above its feet the body that meets walls and ceilings floats, in pixels. The feet are held
 * by what is found under them instead, so a seam between two pieces of floor, or a bump this high or
 * lower, is walked over rather than tripped on.
 */
const LIFT = 4;
/**
 * How far below its feet a character walking down a slope is still pulled onto it, in pixels.
 */
const SNAP = 4;
/**
 * How close its feet have to be to a ledge's top to be standing on it, in pixels.
 */
const SKIN = 0.1;
/**
 * How round the corners of its body in the world are, in pixels.
 */
const CORNER = 1;
/**
 * A floor or a wall is a surface facing this much towards up or sideways: about 45°.
 */
const FACING = Math.SQRT1_2;
/**
 * How many times a move is solved against what is round it: moving out of one surface can push into
 * another (an inside corner, a step against a wall).
 */
const PASSES = 4;
const EVERY_LAYER = 0xffff;

/**
 * Builds one character for a world: what `useCharacterBody2d` asks for.
 *
 * The character is moved by the game, not by the simulation: a capsule that asks the world where it
 * can go (walls, ceilings, crates), held up by what is found under its feet (floors, slopes, ledges).
 * Its body in the world is one the game moves, following it, so what is simulated (a crate, a bridge)
 * lands on it, and a trigger sees it. It is moved once a frame, after the updates that set its speed,
 * rather than with the world's own steps: what the game decides this frame is seen this frame.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const createCharacter2d = (deps: {
    box2d: () => TBox2d | null;
    world: () => number | null;
    ledgeOf: (shape: number) => TLedge | undefined;
    ledges: () => Iterable<[number, TLedge]>;
    standOn: (presence: number, under: ReadonlySet<number>) => void;
    tilemaps: () => readonly TTilemap[];
    stepLength: () => number;
    worldGravity: number;
    box: TGameObject;
    options: TCharacterOptions2d;
}): { body: TCharacterBody2d; move: (dt: number) => void; beforeStep: (length: number) => void; remove: () => void } => {
    const { box, options } = deps;
    const pose = worldPose2d(box);
    const halfWidth = Math.abs(options.width * pose.scaleX) / 2;
    const halfHeight = Math.abs(options.height * pose.scaleY) / 2;
    const shift = { x: (options.offset?.[0] ?? 0) * pose.scaleX, y: (options.offset?.[1] ?? 0) * pose.scaleY };
    const gravity = options.gravity ?? deps.worldGravity;
    const maxFall = options.maxFall ?? DEFAULT_MAX_FALL;
    const maxSlope = options.maxSlope ?? DEFAULT_MAX_SLOPE;
    const floorFacing = Math.cos(maxSlope);
    // How heavy it is on what it stands on: its mass if it says, or its size at the density of a crate.
    const weight = options.mass ?? (halfWidth * 2) * (halfHeight * 2);
    const layered = options.layer !== undefined || options.collidesWith !== undefined;
    const category = layered ? 1 << (options.layer ?? 0) : EVERY_LAYER;
    const mask = layered ? (options.collidesWith ?? EVERY_LAYER) : EVERY_LAYER;

    // The capsule: as wide as the character, from its head to LIFT above its feet. A squat character
    // floats less, and its capsule is as wide as its height allows.
    const lift = Math.min(LIFT, halfHeight / 2);
    const radius = Math.min(halfWidth, halfHeight - lift / 2);
    const capsuleOf = (at: { x: number; y: number }) => ({
        x1: at.x, y1: at.y - halfHeight + radius,
        x2: at.x, y2: at.y + halfHeight - lift - radius,
    });

    const centre = { x: pose.x + shift.x, y: pose.y + shift.y };
    const velocity = { x: 0, y: 0 };
    const state = {
        climbing: false,
        isOnGround: false,
        isOnCeiling: false,
        wallSide: null as 'left' | 'right' | null,
        isOnOneWay: false,
        isOnLadder: false,
        ground: undefined as TTileDoc | undefined,
        damage: 0,
    };
    // The ledges it is falling through, until its head is below their top.
    const dropping = new Set<number>();
    // Its body in the world, and that body's shape: -1 until the simulation has loaded.
    let presence = -1;
    let presenceShape = -1;
    let removed = false;
    // Whether it is touching a ladder, which is what keeps it climbing.
    let inLadder = false;
    // The facing of the ground it stood on last, for walking up a slope.
    let groundNormal: { x: number; y: number } | null = null;

    const build = (box2d: TBox2d, world: number): void => {
        presence = box2d.b2.nb_body_create(world, 1, centre.x, centre.y, 0);
        // Its corners rounded by a pixel, inside its size, and asked about every contact, so the solver
        // can be told to leave what it stands on alone.
        presenceShape = box2d.b2.nb_shape_box(presence, halfWidth, halfHeight, 0, 0, Math.min(CORNER, halfWidth / 2, halfHeight / 2), 1, 0.5, 0, SHAPE_PRESENCE, category, mask);
    };

    /**
     * What the tiles around it say, once it has moved: a ladder in front of it, harm, and the tile
     * under its feet.
     */
    const readTiles = (): void => {
        const tiles = readCharacterTiles(deps.tilemaps(), centre, halfWidth, halfHeight, state.isOnGround);
        state.isOnLadder = tiles.isOnLadder;
        state.damage = tiles.damage;
        state.ground = tiles.ground;
        inLadder = tiles.inLadder;
    };

    /**
     * The surfaces round the capsule at `at`, as [normalX, normalY, offset, shape] each, the normal
     * pointing at the character. Ledges are not among them: they are only floors, found under its feet.
     */
    const planesAt = (box2d: TBox2d, world: number, at: { x: number; y: number }): Float32Array => {
        const c = capsuleOf(at);
        const count = box2d.b2.nb_mover_collide(world, c.x1, c.y1, c.x2, c.y2, radius, category, mask, SHAPE_LEDGE, presenceShape);
        return Float32Array.from(box2d.output(count * 4).f32);
    };

    const shapeOfPlane = (planes: Float32Array, i: number): number => new Int32Array(planes.buffer, planes.byteOffset + (i * 4 + 3) * 4, 1)[0];

    const move = (dt: number): void => {
        const box2d = deps.box2d();
        const world = deps.world();
        if (removed || box2d === null || world === null || dt <= 0) return;
        if (presence < 0) build(box2d, world);
        const b2 = box2d.b2;

        if (!state.climbing) {
            velocity.y = Math.min(velocity.y + gravity * dt, maxFall);
        }
        // A belt carries what stands on it; a current or the wind, what is in it.
        const push = state.isOnGround ? state.ground?.push : tilesUnder(deps.tilemaps(), centre.x, centre.y, centre.x, centre.y).find((tile) => tile.push !== undefined)?.push;
        const desired = { x: (velocity.x + (push?.x ?? 0)) * dt, y: (velocity.y + (push?.y ?? 0)) * dt };
        // Standing, gravity is not pressed into the floor: staying on a floor that drops away (a slope
        // going down) is what the snap under its feet does.
        if (state.isOnGround && !state.climbing && velocity.y >= 0 && desired.y > 0) {
            desired.y = 0;
        }
        // Walking up a slope it stands on is walking along it: the part of the walk into the slope goes
        // along it instead, so it climbs as fast as the slope allows. Walking down, it walks off and the
        // snap brings it down onto the slope.
        if (state.isOnGround && !state.climbing && groundNormal !== null && desired.y >= 0) {
            const into = desired.x * groundNormal.x + desired.y * groundNormal.y;
            if (into < 0) {
                desired.x -= groundNormal.x * into;
                desired.y -= groundNormal.y * into;
            }
        }
        // Its vertical speed as it set off: what the ground and the ledges judge by.
        const setOff = desired.y;
        const wasOnGround = state.isOnGround;
        const feetBefore = centre.y + halfHeight;

        const head = centre.y - halfHeight;
        // Fallen through: a ledge it dropped through is solid again once it is wholly below it.
        for (const shape of dropping) {
            const ledge = deps.ledgeOf(shape);
            if (ledge === undefined || head > ledge.top) dropping.delete(shape);
        }

        // The move, against walls, ceilings and what the simulation moves: solved against what is round
        // it, swept so it cannot pass through something thin at speed, and solved again from there.
        const target = { x: centre.x + desired.x, y: centre.y + desired.y };
        let planes: Float32Array = new Float32Array(0);
        for (let pass = 0; pass < PASSES; pass++) {
            planes = planesAt(box2d, world, centre);
            const count = planes.length / 4;
            const input = box2d.input(count * 4);
            for (let i = 0; i < count; i++) {
                const nx = planes[i * 4];
                const ny = planes[i * 4 + 1];
                input[i * 4] = nx;
                input[i * 4 + 1] = ny;
                // Something it is a little inside of and walking away from is left by the walk alone, not
                // thrown out of as well: a step taken slowly off a wall stays the step the game asked for.
                const away = nx * desired.x + ny * desired.y > 0;
                input[i * 4 + 2] = away ? 0 : planes[i * 4 + 2];
                input[i * 4 + 3] = 1;
            }
            b2.nb_mover_solve(target.x - centre.x, target.y - centre.y, count);
            const solved = box2d.output(2).f32;
            const sx = solved[0];
            const sy = solved[1];
            const c = capsuleOf(centre);
            const fraction = b2.nb_mover_cast(world, c.x1, c.y1, c.x2, c.y2, radius, sx, sy, category, mask, SHAPE_LEDGE, presenceShape);
            centre.x += sx * fraction;
            centre.y += sy * fraction;
            if (Math.hypot(sx * fraction, sy * fraction) < 0.01) break;
        }
        planes = planesAt(box2d, world, centre);

        // What holds it up: the highest floor under its feet that it is falling onto, or that it stood
        // on and is still within reach of.
        let groundY = Infinity;
        let groundShape = -1;
        let onLedge = false;
        groundNormal = null;
        const feet = centre.y + halfHeight;
        if (setOff >= 0) {
            // A ledge holds what lands on it from above, and nothing else: not what jumps up into it, not
            // what climbs, not what is dropping through it.
            if (!state.climbing) {
                for (const [shape, ledge] of deps.ledges()) {
                    if (dropping.has(shape) || centre.x + halfWidth <= ledge.left || centre.x - halfWidth >= ledge.right) continue;
                    if (feetBefore <= ledge.top + SKIN * 2 && feet + (wasOnGround ? SNAP : 0) >= ledge.top && ledge.top < groundY) {
                        groundY = ledge.top;
                        groundShape = shape;
                        onLedge = true;
                    }
                }
            }
            // The rest is found by sweeping the soles of its feet down from inside the capsule.
            const top = feet - lift - 1;
            const reach = lift + 1 + (wasOnGround ? SNAP : Math.max(setOff, 0));
            const count = b2.nb_cast_segment(world, centre.x - halfWidth + CORNER, top, centre.x + halfWidth - CORNER, top, 0, reach, category, mask, SHAPE_LEDGE, presenceShape);
            const hits = box2d.output(count * 6);
            for (let i = 0; i < count; i++) {
                const fraction = hits.f32[i * 6];
                const y = hits.f32[i * 6 + 3];
                const nx = hits.f32[i * 6 + 4];
                const ny = hits.f32[i * 6 + 5];
                // Started inside it (a wall it walks along), or too steep to stand on.
                if (fraction <= 0 || -ny < floorFacing) continue;
                // Landing: its feet reached it. Standing: still within the snap.
                if (!wasOnGround && y > feet + 0.01) continue;
                if (y < groundY) {
                    groundY = y;
                    groundShape = hits.i32[i * 6 + 1];
                    onLedge = false;
                    groundNormal = { x: nx, y: ny };
                }
            }
        }
        state.isOnGround = Number.isFinite(groundY);
        state.isOnOneWay = state.isOnGround && onLedge;
        if (state.isOnGround) centre.y = groundY - halfHeight;
        if (groundShape >= 0 && !onLedge && groundNormal === null) groundNormal = { x: 0, y: -1 };

        state.isOnCeiling = false;
        state.wallSide = null;
        // Each obstacle's normal, pointing at the character: those it went against this frame, and not
        // one it is walking away from.
        for (let i = 0; i < planes.length / 4; i++) {
            const x = planes[i * 4];
            const y = planes[i * 4 + 1];
            if (x * desired.x + y * desired.y >= 0) continue;
            if (y >= FACING && setOff < 0) state.isOnCeiling = true;
            else if (x >= FACING) state.wallSide = 'left';
            else if (x <= -FACING) state.wallSide = 'right';
        }
        if ((state.isOnGround && velocity.y > 0) || (state.isOnCeiling && velocity.y < 0)) {
            velocity.y = 0;
        }

        // What it walks into that the simulation moves is pushed along at its pace, as hard as its weight
        // allows: a crate lighter than it goes as fast as it walks.
        if (options.pushes ?? true) {
            for (let i = 0; i < planes.length / 4; i++) {
                const x = planes[i * 4];
                const body = b2.nb_shape_body(shapeOfPlane(planes, i));
                if (body < 0 || b2.nb_body_type(body) !== 2 || Math.abs(x) < FACING) continue;
                // The normal points back at the character, so the push is the other way.
                const ahead = -Math.sign(x);
                const gap = (velocity.x - b2.nb_body_vx(body)) * ahead;
                if (velocity.x * ahead > 0 && gap > 0) {
                    b2.nb_body_impulse(body, gap * ahead * Math.min(b2.nb_body_mass(body), weight), 0, 1);
                }
            }
        }

        // What it stands on that the simulation moves (a plank of a bridge, a crate): its weight goes
        // on it, under each foot, and the solver is told not to push the two apart, which it would do
        // as if the character weighed nothing short of infinity. Standing, it does not press into the
        // floor (see above), so without this a bridge would not feel it, would come up under it, be
        // shoved back down, and the two would bounce off each other for ever.
        const under = new Set<number>();
        if (state.isOnGround && !state.climbing) {
            const sole = centre.y + halfHeight - 1;
            const sides = [centre.x - halfWidth + CORNER, centre.x, centre.x + halfWidth - CORNER];
            for (const x of sides) {
                if (b2.nb_cast_ray(world, x, sole, 0, SNAP + 1, category, mask, SHAPE_LEDGE, presenceShape) === 0) continue;
                const hit = box2d.output(6);
                const shape = hit.i32[1];
                const body = b2.nb_shape_body(shape);
                if (body < 0 || b2.nb_body_type(body) !== 2) continue;
                under.add(shape);
                if (gravity > 0) {
                    b2.nb_body_impulse_at(body, 0, (weight * gravity * dt) / sides.length, x, hit.f32[3], 1);
                }
            }
        }
        deps.standOn(presenceShape, under);

        readTiles();
        // Climbed out of the ladder, by its top or its side: no longer climbing.
        if (state.climbing && !inLadder) state.climbing = false;

        place();
    };

    /**
     * Writes where it is onto its object. Its body in the world follows at the world's next step (see
     * `beforeStep`).
     */
    const place = (): void => {
        writeWorldPose2d(box, centre.x - shift.x, centre.y - shift.y, 0);
    };

    /**
     * Before each step of the world: its body is sent to where the character is, arriving by the end
     * of the step, at the speed that takes, so what rests on it is carried rather than jumped from
     * under. A second step in the same frame finds it there already, and it stays.
     */
    const beforeStep = (length: number): void => {
        const box2d = deps.box2d();
        if (box2d !== null && deps.world() !== null && presence >= 0) box2d.b2.nb_body_move_to(presence, centre.x, centre.y, 0, length);
    };

    const remove = (): void => {
        if (removed) return;
        removed = true;
        if (presenceShape >= 0) deps.standOn(presenceShape, new Set());
        const box2d = deps.box2d();
        if (box2d !== null && deps.world() !== null && presence >= 0) box2d.b2.nb_body_destroy(presence);
        presence = -1;
        presenceShape = -1;
    };

    const body: TCharacterBody2d = {
        velocity,
        get climbing() { return state.climbing; },
        set climbing(value: boolean) { state.climbing = value; },
        get isOnGround() { return state.isOnGround; },
        get isOnCeiling() { return state.isOnCeiling; },
        get wallSide() { return state.wallSide; },
        get isOnOneWay() { return state.isOnOneWay; },
        get isOnLadder() { return state.isOnLadder; },
        get ground() { return state.ground; },
        get damage() { return state.damage; },
        dropThrough: () => {
            if (!state.isOnOneWay) return;
            const standing = centre.y + halfHeight;
            for (const [shape, ledge] of deps.ledges()) {
                if (Math.abs(ledge.top - standing) <= SKIN * 3 && centre.x + halfWidth > ledge.left && centre.x - halfWidth < ledge.right) {
                    dropping.add(shape);
                }
            }
            state.isOnGround = false;
            state.isOnOneWay = false;
        },
        setPosition: (x, y) => {
            centre.x = x + shift.x;
            centre.y = y + shift.y;
            // Put there at once, and still: a place given is not a move.
            const box2d = deps.box2d();
            if (box2d !== null && deps.world() !== null && presence >= 0) {
                box2d.b2.nb_body_set_transform(presence, centre.x, centre.y, 0);
                box2d.b2.nb_body_set_velocity(presence, 0, 0);
            }
            place();
        },
        destroy: remove,
    };

    return { body, move, beforeStep, remove };
};
