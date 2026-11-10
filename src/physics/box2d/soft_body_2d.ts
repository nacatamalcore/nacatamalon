import { placementOf } from '../../box';
import { worldPose2d, writeWorldPose2d } from './world_pose';
import type { TGameObject } from '../../hooks/spawn/use_spawn';
import type { TSoftBody2d, TSoftBodyOptions2d } from './t_soft_body_2d';
import type { TBox2d } from './load_box2d';

/**
 * A soft body as the simulation has it: each side a thin capsule, joined to the next by a hinge at the
 * corner they share. The outline touches all along, so nothing slips between two corners into it.
 *
 * Its shape is held by the body as a whole, not side by side: every step the shape it started as is
 * laid over where it is now, turned as it has turned, and each side is drawn towards its place in it,
 * as softly as `softness` says. A heap of them leans and squashes, and never folds inside out.
 */
type TMade = {
    /**
     * The sides, each a body with one capsule, in order: side `i` runs from corner `i` to the next.
     */
    sides: number[];
    shapes: number[];
    /**
     * Each side's length and, as it started, its middle measured from the middle of the whole and its
     * turn: the shape it is drawn back towards.
     */
    lengths: number[];
    restMiddles: Array<{ x: number; y: number }>;
    restAngles: number[];
    joints: number[];
    /**
     * The still bodies pinned corners are held to.
     */
    pins: number[];
    closed: boolean;
    /**
     * The area it started with, which it keeps.
     */
    area: number;
};

type TSoftEntry = {
    box: TGameObject;
    options: TSoftBodyOptions2d;
    made: TMade | null;
    /**
     * Where its corners are now, from the object's place. Rewritten in place every step.
     */
    outline: Array<{ x: number; y: number }>;
    velocity: { x: number; y: number };
    /**
     * The push asked for, and in which frame: a push lasts the frame it was asked in.
     */
    push: { x: number; y: number };
    pushFrame: number;
    kicks: Array<{ x: number; y: number }>;
    removed: boolean;
};

/**
 * How thick its outline is where it touches, in pixels: thin, so the outline drawn through the corners
 * is where it touches.
 */
const SKIN = 1.5;
/**
 * How fast its shape comes back, in radians a second, for each unit of `softness`.
 */
const SHAPE_PULL = 4;
/**
 * How fast it wins back the area it has lost (or gives back what it gained): this share of it a step.
 */
const AREA_RETURN = 0.2;

/**
 * The corners it starts with, in the world, measured from where its object is.
 */
const startingCorners = (options: TSoftBodyOptions2d, at: { x: number; y: number }): Array<{ x: number; y: number }> => {
    const corners: Array<{ x: number; y: number }> = [];
    if (options.shape === 'disk') {
        const count = Math.max(3, Math.round(options.corners ?? 16));
        for (let i = 0; i < count; i++) {
            const angle = (i / count) * Math.PI * 2;
            corners.push({ x: at.x + Math.cos(angle) * options.radius, y: at.y + Math.sin(angle) * options.radius });
        }
    } else if (options.shape === 'polygon') {
        for (const point of options.points) corners.push({ x: at.x + point.x, y: at.y + point.y });
    } else {
        const count = Math.max(2, Math.round(options.corners ?? 12));
        for (let i = 0; i < count; i++) {
            const t = i / (count - 1);
            corners.push({ x: at.x + options.to.x * t, y: at.y + options.to.y * t });
        }
    }
    return corners;
};

const signedArea = (points: ReadonlyArray<{ x: number; y: number }>): number => {
    let sum = 0;
    for (let i = 0; i < points.length; i++) {
        const a = points[i];
        const b = points[(i + 1) % points.length];
        sum += a.x * b.y - b.x * a.y;
    }
    return sum / 2;
};

const middleOf = (points: ReadonlyArray<{ x: number; y: number }>): { x: number; y: number } => {
    const sum = { x: 0, y: 0 };
    for (const point of points) {
        sum.x += point.x / points.length;
        sum.y += point.y / points.length;
    }
    return sum;
};

const wrap = (angle: number): number => Math.atan2(Math.sin(angle), Math.cos(angle));

/**
 * One step of a damped spring, solved at the end of the step rather than the start, so it holds at any
 * stiffness instead of flying apart: the speed something away from its place by `gap`, at `speed` over
 * the speed its place has, ends the step with.
 */
const settle = (speed: number, gap: number, pull: number, damping: number, step: number): number =>
    (speed + step * pull * pull * gap) / (1 + 2 * damping * pull * step + pull * pull * step * step);

/**
 * The soft bodies of one world: made once the simulation has loaded, pushed before each step, and
 * written back onto their objects after it.
 *
 * @internal
 */
export const createSoftBodies = (deps: { box2d: () => TBox2d | null; world: () => number | null; frame: () => number }) => {
    const entries = new Set<TSoftEntry>();

    const make = (entry: TSoftEntry): void => {
        const box2d = deps.box2d();
        const world = deps.world();
        if (entry.made !== null || entry.removed || box2d === null || world === null) return;
        const b2 = box2d.b2;
        const { options } = entry;
        const corners = startingCorners(options, worldPose2d(entry.box));
        if (corners.length < 2) {
            console.warn(`[NacatamalOn] useSoftBody2d: the shape of '${entry.box.name}' has no corners, so it has no body.`);
            entry.removed = true;
            return;
        }
        const closed = options.shape !== 'rope';
        const count = closed ? corners.length : corners.length - 1;
        const share = (options.mass ?? 1) / count;
        const friction = options.friction ?? 0.5;
        const bounce = options.bounce ?? 0;
        const middle = middleOf(corners);

        const sides: number[] = [];
        const shapes: number[] = [];
        const lengths: number[] = [];
        const restMiddles: Array<{ x: number; y: number }> = [];
        const restAngles: number[] = [];
        for (let i = 0; i < count; i++) {
            const from = corners[i];
            const to = corners[(i + 1) % corners.length];
            const length = Math.max(Math.hypot(to.x - from.x, to.y - from.y), SKIN);
            const angle = Math.atan2(to.y - from.y, to.x - from.x);
            const at = { x: (from.x + to.x) / 2, y: (from.y + to.y) / 2 };
            const side = b2.nb_body_create(world, 2, at.x, at.y, angle);
            shapes.push(b2.nb_shape_capsule(side, -length / 2, 0, length / 2, 0, SKIN, 1, friction, bounce, 0, 0xffff, 0xffff));
            b2.nb_body_set_mass(side, share, (share * length * length) / 12);
            sides.push(side);
            lengths.push(length);
            restMiddles.push({ x: at.x - middle.x, y: at.y - middle.y });
            restAngles.push(angle);
        }

        // Each corner a hinge between the two sides that meet there.
        const joints: number[] = [];
        const joins = closed ? count : count - 1;
        for (let i = 0; i < joins; i++) {
            const next = (i + 1) % count;
            joints.push(b2.nb_joint_hinge(sides[i], sides[next], lengths[i] / 2, 0, -lengths[next] / 2, 0, wrap(restAngles[next] - restAngles[i]), 0, 0, 0, 0, 0, 0, 0));
        }

        // A pinned corner is held where it starts by a hinge to a still point.
        const pins: number[] = [];
        for (const corner of options.pinned ?? []) {
            if (corner < 0 || corner >= corners.length) continue;
            const pin = b2.nb_body_create(world, 0, corners[corner].x, corners[corner].y, 0);
            pins.push(pin);
            // The side that starts at this corner, or for a rope's last corner the side that ends there.
            const starting = corner < count;
            const side = starting ? corner : corner - 1;
            const end = starting ? -lengths[side] / 2 : lengths[side] / 2;
            joints.push(b2.nb_joint_hinge(pin, sides[side], 0, 0, end, 0, wrap(restAngles[side]), 0, 0, 0, 0, 0, 0, 0));
        }

        entry.made = { sides, shapes, lengths, restMiddles, restAngles, joints, pins, closed, area: closed ? Math.abs(signedArea(corners)) : 0 };
        writeBack(entry);
    };

    /**
     * Where its corners are now: where each side starts, and for a rope where the last one ends.
     */
    const cornersOf = (box2d: TBox2d, made: TMade): Array<{ x: number; y: number }> => {
        const b2 = box2d.b2;
        const ends = made.sides.map((side, i) => {
            const angle = b2.nb_body_angle(side);
            const half = made.lengths[i] / 2;
            const at = { x: b2.nb_body_x(side), y: b2.nb_body_y(side) };
            return {
                from: { x: at.x - Math.cos(angle) * half, y: at.y - Math.sin(angle) * half },
                to: { x: at.x + Math.cos(angle) * half, y: at.y + Math.sin(angle) * half },
            };
        });
        const corners: Array<{ x: number; y: number }> = [];
        const count = ends.length;
        for (let i = 0; i < count; i++) {
            // Where a side starts and the one before it ends are the same corner, but for how far the
            // hinge gives: the middle of the two.
            const before = made.closed ? ends[(i + count - 1) % count] : i > 0 ? ends[i - 1] : null;
            const start = ends[i].from;
            corners.push(before === null ? start : { x: (start.x + before.to.x) / 2, y: (start.y + before.to.y) / 2 });
        }
        if (!made.closed) corners.push(ends[count - 1].to);
        return corners;
    };

    /**
     * Puts the object at the body's middle, and its corners around it.
     */
    const writeBack = (entry: TSoftEntry): void => {
        const box2d = deps.box2d();
        const made = entry.made;
        if (box2d === null || made === null || entry.removed) return;
        const b2 = box2d.b2;
        const corners = cornersOf(box2d, made);
        const count = corners.length;
        const middle = middleOf(corners);
        entry.outline.length = count;
        for (let i = 0; i < count; i++) {
            const point = entry.outline[i] ?? { x: 0, y: 0 };
            point.x = corners[i].x - middle.x;
            point.y = corners[i].y - middle.y;
            entry.outline[i] = point;
        }
        let vx = 0;
        let vy = 0;
        for (const side of made.sides) {
            vx += b2.nb_body_vx(side) / made.sides.length;
            vy += b2.nb_body_vy(side) / made.sides.length;
        }
        entry.velocity.x = vx;
        entry.velocity.y = vy;
        writeWorldPose2d(entry.box, middle.x, middle.y, 0);

        const polygon = entry.options.polygon;
        if (polygon !== undefined && !polygon.destroyed) {
            const points = polygon.points;
            points.length = count;
            for (let i = 0; i < count; i++) {
                const point = points[i] ?? { x: 0, y: 0 };
                point.x = entry.outline[i].x;
                point.y = entry.outline[i].y;
                points[i] = point;
            }
        }
    };

    const remove = (entry: TSoftEntry): void => {
        if (entry.removed) return;
        entry.removed = true;
        entries.delete(entry);
        const box2d = deps.box2d();
        const made = entry.made;
        entry.made = null;
        if (box2d === null || deps.world() === null || made === null) return;
        for (const joint of made.joints) box2d.b2.nb_joint_destroy(joint);
        for (const side of made.sides) box2d.b2.nb_body_destroy(side);
        for (const pin of made.pins) box2d.b2.nb_body_destroy(pin);
    };

    /**
     * Draws every side towards where the shape it started as puts it, laid over where the body is now
     * and turned as it has turned, and gives back the area it has lost. The body moving and turning as
     * a whole is left alone: only how far it is from its own shape is undone.
     */
    const holdShape = (box2d: TBox2d, entry: TSoftEntry, made: TMade, step: number): void => {
        const b2 = box2d.b2;
        const { options } = entry;
        const count = made.sides.length;
        const at = made.sides.map((side) => ({ x: b2.nb_body_x(side), y: b2.nb_body_y(side) }));
        const speeds = made.sides.map((side) => ({ x: b2.nb_body_vx(side), y: b2.nb_body_vy(side) }));
        const middle = middleOf(at);
        const speed = middleOf(speeds);

        // How it has turned, and how fast it turns, as a whole: the best fit of the shape it started as.
        let dot = 0;
        let cross = 0;
        let spin = 0;
        let reach = 0;
        for (let i = 0; i < count; i++) {
            const rest = made.restMiddles[i];
            const now = { x: at[i].x - middle.x, y: at[i].y - middle.y };
            dot += rest.x * now.x + rest.y * now.y;
            cross += rest.x * now.y - rest.y * now.x;
            spin += now.x * (speeds[i].y - speed.y) - now.y * (speeds[i].x - speed.x);
            reach += now.x * now.x + now.y * now.y;
        }
        const turn = Math.atan2(cross, dot);
        const turning = reach > 0 ? spin / reach : 0;
        const cos = Math.cos(turn);
        const sin = Math.sin(turn);

        const keepShape = made.closed && options.keepShape !== false;
        if (keepShape) {
            const pull = SHAPE_PULL * (options.softness ?? 5);
            const damping = options.damping ?? 1;
            for (let i = 0; i < count; i++) {
                const side = made.sides[i];
                if (b2.nb_body_type(side) !== 2) continue;
                const rest = made.restMiddles[i];
                const place = { x: middle.x + rest.x * cos - rest.y * sin, y: middle.y + rest.x * sin + rest.y * cos };
                const offset = { x: at[i].x - middle.x, y: at[i].y - middle.y };
                // The speed its place has: the body's, and the body's turn carrying it round.
                const carried = { x: speed.x - turning * offset.y, y: speed.y + turning * offset.x };
                const vx = carried.x + settle(speeds[i].x - carried.x, place.x - at[i].x, pull, damping, step);
                const vy = carried.y + settle(speeds[i].y - carried.y, place.y - at[i].y, pull, damping, step);
                b2.nb_body_set_velocity(side, vx, vy);
                const angleGap = wrap(made.restAngles[i] + turn - b2.nb_body_angle(side));
                b2.nb_body_set_spin(side, turning + settle(b2.nb_body_spin(side) - turning, angleGap, pull, damping, step));
            }
        }

        if (made.area > 0) {
            const corners = cornersOf(box2d, made);
            const signed = signedArea(corners);
            const area = Math.abs(signed);
            // The share of its area it is missing (or has too much of), pushed back out across its
            // outline, as air in a balloon pushes: each side straight out from where it faces.
            const missing = (made.area - area) / made.area;
            if (Math.abs(missing) < 1e-4) return;
            const out = AREA_RETURN * missing * Math.sqrt(made.area / Math.PI) / step;
            const facing = signed > 0 ? 1 : -1;
            for (let i = 0; i < count; i++) {
                const side = made.sides[i];
                if (b2.nb_body_type(side) !== 2) continue;
                const angle = b2.nb_body_angle(side);
                const normal = { x: Math.sin(angle) * facing, y: -Math.cos(angle) * facing };
                b2.nb_body_set_velocity(side, b2.nb_body_vx(side) + normal.x * out, b2.nb_body_vy(side) + normal.y * out);
            }
        }
    };

    return {
        add: (box: TGameObject, options: TSoftBodyOptions2d): TSoftBody2d => {
            if (placementOf(box) === null) {
                throw new Error(`[NacatamalOn] useSoftBody2d: '${box.name}' is nowhere: give it a placement, or something to draw, so the body has somewhere to be.`);
            }
            const entry: TSoftEntry = {
                box,
                options,
                made: null,
                outline: [],
                velocity: { x: 0, y: 0 },
                push: { x: 0, y: 0 },
                pushFrame: -1,
                kicks: [],
                removed: false,
            };
            entries.add(entry);
            make(entry);
            const destroy = (): void => remove(entry);
            box.cleanups.push(destroy);
            return {
                outline: entry.outline,
                velocity: entry.velocity,
                push: (x, y) => {
                    entry.push = { x, y };
                    entry.pushFrame = deps.frame();
                },
                kick: (x, y) => {
                    entry.kicks.push({ x, y });
                },
                destroy,
            };
        },

        /**
         * Once a frame, before the world steps: bodies made now that the simulation is here, and the
         * kicks of the frame just gone handed over.
         */
        beforeStep: (_frame: number): void => {
            const box2d = deps.box2d();
            if (box2d === null) return;
            const b2 = box2d.b2;
            for (const entry of entries) {
                make(entry);
                const made = entry.made;
                if (made === null || entry.kicks.length === 0) continue;
                for (const kick of entry.kicks) {
                    for (const side of made.sides) {
                        b2.nb_body_set_velocity(side, b2.nb_body_vx(side) + kick.x, b2.nb_body_vy(side) + kick.y);
                    }
                }
                entry.kicks.length = 0;
            }
        },

        /**
         * Before every step: the push of the frame (every side by its own weight, as gravity pushes),
         * and the shape and area it is drawn back to.
         */
        applyPushes: (frame: number, step: number): void => {
            const box2d = deps.box2d();
            if (box2d === null) return;
            const b2 = box2d.b2;
            for (const entry of entries) {
                const made = entry.made;
                if (made === null) continue;
                if (entry.pushFrame === frame - 1) {
                    for (const side of made.sides) {
                        const mass = b2.nb_body_mass(side);
                        b2.nb_body_force(side, entry.push.x * mass, entry.push.y * mass, 1);
                    }
                }
                holdShape(box2d, entry, made, step);
            }
        },

        /**
         * Where each side's bottom is and how fast it falls, for the ledges, which hold a blob landing
         * on them as they hold a crate.
         */
        measureFeet: (feet: Map<number, { bottom: number; vy: number }>): void => {
            const box2d = deps.box2d();
            if (box2d === null) return;
            for (const entry of entries) {
                const made = entry.made;
                if (made === null) continue;
                for (let i = 0; i < made.shapes.length; i++) {
                    feet.set(made.shapes[i], { bottom: box2d.b2.nb_shape_bottom(made.shapes[i]), vy: box2d.b2.nb_body_vy(made.sides[i]) });
                }
            }
        },

        afterStep: (): void => {
            for (const entry of entries) writeBack(entry);
        },

        clear: (): void => {
            for (const entry of entries) {
                entry.removed = true;
                entry.made = null;
            }
            entries.clear();
        },
    };
};
