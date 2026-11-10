import { getActiveBox, getActiveGame } from '../../store';
import { localPositionFrom, placementOf, worldPlacementOf } from '../../box';
import { gameOfBox } from '../../box/box_game';
import { firstTimeIn } from '../../utils/first_time_in';
import { resolveLayers } from '../layer_names';
import type { TPhysicsLayer } from '../layer_names';
import type { TGameObject } from '../../hooks/spawn/use_spawn';
import type { TRetroBody2d } from '../types/t_retro_physics';
import type { TRetroBodyHandle2d } from './types';

/**
 * How far apart two edges still count as one inside the other, in pixels: below this, edges that
 * only meet, as they do once one body has been stopped against another, are not overlapping.
 */
const EPS = 1e-4;
/**
 * How far apart two bodies still count as touching, in pixels: what tells a crate resting on the
 * floor from one that has left it.
 */
const TOUCH = 0.01;
/**
 * The side of one cell of the grid that finds what is near what, in pixels.
 */
const CELL = 64;
/**
 * The most pieces one move is cut into, so a body flung across the level costs a bounded amount.
 */
const MAX_PIECES = 64;

type TListener = (other: TGameObject) => void;

/**
 * One body as the world keeps it: where it is this step, its size, how it moves, and what it touches.
 */
type TEntry = {
    box: TGameObject;
    record: TRetroBody2d;
    /** The order it was added in: the order bodies move and are told, the same on every machine. */
    order: number;
    /** Its centre in the world, and half its size; a circle is `round`, with both halves its radius. */
    x: number;
    y: number;
    hw: number;
    hh: number;
    round: boolean;
    /** Whether the object has somewhere to be this step. One with nowhere is left out. */
    placed: boolean;
    /** Where this step read it from the object, to write back only what moved. */
    readX: number;
    readY: number;
    /** Where the last step left it, or `NaN` before its first: tells the game moving it. */
    lastX: number;
    lastY: number;
    /** How far it went in this step, all told: what carries what stands on it. */
    movedX: number;
    movedY: number;
    velocity: { x: number; y: number };
    acceleration: { x: number; y: number };
    force: { x: number; y: number };
    forceFrame: number;
    blocked: { left: boolean; right: boolean; up: boolean; down: boolean };
    /** What it stood on at the end of its last move, if that does not give way: a floor, a lift. */
    standingOn: TEntry | null;
    touching: Set<TEntry>;
    enter: Set<TListener>;
    exit: Set<TListener>;
    /** The last query that found it, so one query finds it once. */
    stamp: number;
    removed: boolean;
    handle: TRetroBodyHandle2d;
};

/**
 * Which way a contact pushes the body being settled, and how far.
 */
type TContact = { nx: number; ny: number; depth: number };

/**
 * The retro world of one scene, as its provider drives it.
 *
 * @internal
 */
export type TRetroWorld = {
    /** Puts an object's body into the world and hands back what the game drives it with. */
    addBody: (box: TGameObject, record: TRetroBody2d) => TRetroBodyHandle2d;
    /** One frame of the game: as many fixed steps as the time that has passed holds. */
    frame: (dt: number) => void;
    /** Takes every body out: the scene is over. */
    close: () => void;
};

const isMoving = (entry: TEntry): boolean => entry.record.body === 'dynamic';
const isPushing = (entry: TEntry): boolean => entry.record.body === 'kinematic';

/**
 * Whether each of two bodies collides with the other's layer: both have to, as on the full
 * simulation.
 */
const meets = (a: TEntry, b: TEntry): boolean =>
    (a.record.collidesWith & (1 << b.record.layer)) !== 0 && (b.record.collidesWith & (1 << a.record.layer)) !== 0;

/** Whether two bodies stop each other: they meet and neither only notices. */
const solid = (a: TEntry, b: TEntry): boolean => !a.record.sensor && !b.record.sensor && meets(a, b);

/**
 * How a circle `a` and a box `b` overlap, pushing `a` out, or `null` when they do not.
 */
const circleOnRect = (a: TEntry, b: TEntry, slack: number): TContact | null => {
    const closestX = Math.max(b.x - b.hw, Math.min(a.x, b.x + b.hw));
    const closestY = Math.max(b.y - b.hh, Math.min(a.y, b.y + b.hh));
    const dx = a.x - closestX;
    const dy = a.y - closestY;
    const distance = Math.hypot(dx, dy);
    if (distance > 0) {
        const depth = a.hw - distance;
        return depth > slack ? { nx: dx / distance, ny: dy / distance, depth } : null;
    }
    // Its centre is inside the box: out by the nearer side.
    const outX = b.hw + a.hw - Math.abs(a.x - b.x);
    const outY = b.hh + a.hw - Math.abs(a.y - b.y);
    return outX < outY
        ? { nx: a.x < b.x ? -1 : 1, ny: 0, depth: outX }
        : { nx: 0, ny: a.y < b.y ? -1 : 1, depth: outY };
};

/**
 * How body `a` overlaps body `b`, as the way and the distance that take `a` out, or `null` when they
 * do not overlap by more than `slack`.
 *
 * Two boxes are separated along the axis being moved on, which is what lets a box slide along a
 * floor and stop flat against a wall instead of catching on the corners between floor pieces. A
 * circle is pushed out along the line from the nearest point, so a ball comes off a corner at an
 * angle.
 */
const contactOf = (a: TEntry, b: TEntry, axis: 'x' | 'y', dir: number, slack = EPS): TContact | null => {
    if (!a.round && !b.round) {
        const overX = a.hw + b.hw - Math.abs(a.x - b.x);
        const overY = a.hh + b.hh - Math.abs(a.y - b.y);
        if (overX <= slack || overY <= slack) return null;
        if (axis === 'x') {
            const side = a.x === b.x ? -Math.sign(dir) || -1 : Math.sign(a.x - b.x);
            return { nx: side, ny: 0, depth: overX };
        }
        const side = a.y === b.y ? -Math.sign(dir) || -1 : Math.sign(a.y - b.y);
        return { nx: 0, ny: side, depth: overY };
    }
    if (a.round && b.round) {
        const dx = a.x - b.x;
        const dy = a.y - b.y;
        const distance = Math.hypot(dx, dy);
        const depth = a.hw + b.hw - distance;
        if (depth <= slack) return null;
        if (distance === 0) {
            return axis === 'x' ? { nx: -Math.sign(dir) || -1, ny: 0, depth } : { nx: 0, ny: -Math.sign(dir) || -1, depth };
        }
        return { nx: dx / distance, ny: dy / distance, depth };
    }
    if (a.round) return circleOnRect(a, b, slack);
    const flipped = circleOnRect(b, a, slack);
    return flipped === null ? null : { nx: -flipped.nx, ny: -flipped.ny, depth: flipped.depth };
};

/**
 * Whether two bodies are touching or in each other, edges that only meet at a corner left out.
 */
const touches = (a: TEntry, b: TEntry): boolean => {
    if (!a.round && !b.round) {
        const gapX = Math.abs(a.x - b.x) - (a.hw + b.hw);
        const gapY = Math.abs(a.y - b.y) - (a.hh + b.hh);
        return (gapX < -EPS && gapY <= TOUCH) || (gapY < -EPS && gapX <= TOUCH);
    }
    return contactOf(a, b, 'x', 0, -TOUCH) !== null;
};

/**
 * Notes which sides of `entry` something stopped, from the way it was pushed out.
 */
const noteBlocked = (entry: TEntry, contact: TContact): void => {
    if (Math.abs(contact.ny) >= Math.abs(contact.nx)) {
        if (contact.ny < 0) entry.blocked.down = true;
        else entry.blocked.up = true;
    } else if (contact.nx < 0) entry.blocked.right = true;
    else entry.blocked.left = true;
};

/**
 * Makes one world of retro bodies.
 *
 * **One step, in this order.** It reads where every object is, so a game that moved one by hand has
 * moved its body; moves the bodies the game drives (`'kinematic'`), which push what is in their way
 * and carry what stands on them; then moves every `'dynamic'` body by its speed, across and then up
 * or down, each piece of the way settled against what it ran into before the next; writes every
 * position that changed back onto its object; and tells which bodies started or stopped touching.
 *
 * @internal
 */
export const createRetroWorld = (options: {
    gravity: { x: number; y: number };
    /** How long one step is, asked every frame: see `physicsStepOf`. */
    stepLength: () => number;
    /** The most steps one frame may take, so a long pause does not freeze the game catching up. */
    maxSteps: number;
}): TRetroWorld => {
    const gravity = options.gravity;
    const entries: TEntry[] = [];
    const byBox = new Map<TGameObject, TEntry>();
    const grid = new Map<number, TEntry[]>();
    let added = 0;
    let stamp = 0;
    let frame = 0;
    let accumulator = 0;
    let length = 1 / 60;
    let closed = false;

    const cellKey = (cx: number, cy: number): number => ((cx & 0xffff) << 16) | (cy & 0xffff);

    /**
     * Puts a body into every cell its box covers now, plus `margin`. A body that moves is put in
     * again where it went; where it was is left, and a query that finds it there tests it and moves on.
     */
    const insert = (entry: TEntry, margin = 0): void => {
        const x0 = Math.floor((entry.x - entry.hw - margin) / CELL);
        const x1 = Math.floor((entry.x + entry.hw + margin) / CELL);
        const y0 = Math.floor((entry.y - entry.hh - margin) / CELL);
        const y1 = Math.floor((entry.y + entry.hh + margin) / CELL);
        for (let cy = y0; cy <= y1; cy++) {
            for (let cx = x0; cx <= x1; cx++) {
                const key = cellKey(cx, cy);
                let cell = grid.get(key);
                if (cell === undefined) {
                    cell = [];
                    grid.set(key, cell);
                }
                if (cell[cell.length - 1] !== entry) cell.push(entry);
            }
        }
    };

    /**
     * Every body in the cells around `entry`, plus `margin`, in the order they were added, once each.
     * A list and not a walk, because settling one of them may ask again.
     */
    const near = (entry: TEntry, margin = 0): TEntry[] => {
        stamp++;
        const found: TEntry[] = [];
        const x0 = Math.floor((entry.x - entry.hw - margin) / CELL);
        const x1 = Math.floor((entry.x + entry.hw + margin) / CELL);
        const y0 = Math.floor((entry.y - entry.hh - margin) / CELL);
        const y1 = Math.floor((entry.y + entry.hh + margin) / CELL);
        for (let cy = y0; cy <= y1; cy++) {
            for (let cx = x0; cx <= x1; cx++) {
                const cell = grid.get(cellKey(cx, cy));
                if (cell === undefined) continue;
                for (const other of cell) {
                    if (other.stamp === stamp || other === entry || other.removed || !other.placed) continue;
                    other.stamp = stamp;
                    found.push(other);
                }
            }
        }
        return found.sort((a, b) => a.order - b.order);
    };

    /**
     * Reads where an object is and how big, from its placement in the world. A circle scaled more
     * one way than the other takes the larger, so it still holds its picture, and says so once.
     */
    const readPose = (entry: TEntry): void => {
        if (placementOf(entry.box) === null) {
            entry.placed = false;
            return;
        }
        const place = worldPlacementOf(entry.box);
        const sx = Math.abs(place.scaleX);
        const sy = Math.abs(place.scaleY);
        const collider = entry.record.collider;
        if (collider.shape === 'circle') {
            if (sx !== sy && firstTimeIn(gameOfBox(entry.box), 'retro physics: circle scaled unevenly')) {
                console.warn(`[NacatamalOn] retro-physics2d: the circle of '${entry.box.name}' is scaled ${sx} by ${sy}, and a retro circle stays round, so it takes the larger. Scale it the same both ways, or give it a rect.`);
            }
            entry.round = true;
            entry.hw = entry.hh = collider.radius * Math.max(sx, sy);
        } else {
            entry.round = false;
            entry.hw = collider.width * sx / 2;
            entry.hh = collider.height * sy / 2;
        }
        entry.placed = true;
        entry.x = entry.readX = place.x;
        entry.y = entry.readY = place.y;
    };

    /** Writes a body's position back onto its object, if it moved. */
    const writePose = (entry: TEntry): void => {
        entry.movedX = Number.isNaN(entry.lastX) ? 0 : entry.x - entry.lastX;
        entry.movedY = Number.isNaN(entry.lastY) ? 0 : entry.y - entry.lastY;
        entry.lastX = entry.x;
        entry.lastY = entry.y;
        if (entry.x === entry.readX && entry.y === entry.readY) return;
        const place = placementOf(entry.box);
        if (place === null) return;
        const local = localPositionFrom(entry.box, { x: entry.x, y: entry.y });
        place.x = local.x;
        place.y = local.y;
    };

    /**
     * The speed below which a body pressed against something by gravity stops bouncing off it, so
     * a ball with some `bounce` comes to rest instead of trembling on the floor for ever.
     */
    const restSpeed = (entry: TEntry, contact: TContact): number => {
        const into = -(gravity.x * contact.nx + gravity.y * contact.ny) * entry.record.gravityScale;
        return into > 0 ? into * length * 2 : 0;
    };

    /**
     * Takes away the part of a body's speed that goes into what stopped it, and gives back its own
     * `bounce` of it.
     */
    const reflect = (entry: TEntry, contact: TContact): void => {
        const v = entry.velocity;
        const into = v.x * contact.nx + v.y * contact.ny;
        if (into >= 0) return;
        let out = -into * entry.record.bounce;
        if (out < restSpeed(entry, contact)) out = 0;
        v.x += (out - into) * contact.nx;
        v.y += (out - into) * contact.ny;
    };

    /**
     * Two dynamic bodies that met share their speed along the way they met, each keeping its own
     * `bounce` of the difference: a heavy crate barely notices a light one.
     */
    const exchange = (a: TEntry, b: TEntry, contact: TContact): void => {
        const va = a.velocity.x * contact.nx + a.velocity.y * contact.ny;
        const vb = b.velocity.x * contact.nx + b.velocity.y * contact.ny;
        // Only when they are closing on each other along that way.
        if (va - vb >= 0) return;
        const ma = a.record.mass;
        const mb = b.record.mass;
        const shared = (ma * va + mb * vb) / (ma + mb);
        const newA = shared - (va - shared) * a.record.bounce;
        const newB = shared - (vb - shared) * b.record.bounce;
        a.velocity.x += (newA - va) * contact.nx;
        a.velocity.y += (newA - va) * contact.ny;
        b.velocity.x += (newB - vb) * contact.nx;
        b.velocity.y += (newB - vb) * contact.ny;
    };

    /**
     * Settles `entry` against what never gives way (still and driven bodies), after something
     * pushed it the way `(px, py)`.
     */
    const settleAgainstStill = (entry: TEntry, px: number, py: number): void => {
        const axis = Math.abs(px) >= Math.abs(py) ? 'x' : 'y';
        const dir = axis === 'x' ? px : py;
        for (const other of near(entry)) {
            if (isMoving(other) || !solid(entry, other)) continue;
            const contact = contactOf(entry, other, axis, dir);
            if (contact === null) continue;
            entry.x += contact.nx * contact.depth;
            entry.y += contact.ny * contact.depth;
            reflect(entry, contact);
            noteBlocked(entry, contact);
        }
        insert(entry);
    };

    /**
     * Settles `entry` after it moved a piece of the way along `axis`: out of everything solid it
     * ran into. A dynamic body gives way to what is still or driven, and shares a push with another
     * dynamic one by their masses; a driven body gives way to nothing and pushes what is dynamic.
     */
    const settle = (entry: TEntry, axis: 'x' | 'y', dir: number): void => {
        const driven = isPushing(entry);
        for (const other of near(entry)) {
            if (!solid(entry, other)) continue;
            // A driven body passes through what is still and through other driven ones.
            if (driven && !isMoving(other)) continue;
            const contact = contactOf(entry, other, axis, dir);
            if (contact === null) continue;

            if (isMoving(other)) {
                // Pushed out of the way: all of it by something driven, a share by something dynamic.
                const given = driven ? contact.depth : contact.depth * entry.record.mass / (entry.record.mass + other.record.mass);
                other.x -= contact.nx * given;
                other.y -= contact.ny * given;
                if (driven) {
                    // Moved, not thrown: it loses the speed it had into the driven body and gains
                    // none, so a rider stays on the lift instead of flying off its top.
                    const into = other.velocity.x * contact.nx + other.velocity.y * contact.ny;
                    if (into > 0) {
                        other.velocity.x -= into * contact.nx;
                        other.velocity.y -= into * contact.ny;
                    }
                } else {
                    exchange(entry, other, contact);
                }
                settleAgainstStill(other, -contact.nx, -contact.ny);
                if (driven) continue;
                // What could not give way all the way, against a wall, stops this one instead.
                const share = contact.depth - given;
                const left = contactOf(entry, other, axis, dir);
                if (left === null || left.depth <= share + EPS) {
                    entry.x += contact.nx * share;
                    entry.y += contact.ny * share;
                    continue;
                }
                entry.x += left.nx * left.depth;
                entry.y += left.ny * left.depth;
                reflect(entry, left);
                noteBlocked(entry, left);
                continue;
            }

            entry.x += contact.nx * contact.depth;
            entry.y += contact.ny * contact.depth;
            reflect(entry, contact);
            noteBlocked(entry, contact);
            if (contact.ny < 0 && Math.abs(contact.ny) >= Math.abs(contact.nx)) entry.standingOn = other;
        }
        insert(entry);
    };

    /**
     * Moves a body `delta` pixels along `axis`, in pieces no longer than half its size that way, so
     * a fast one cannot step over a thin wall between two steps. It stops at what stopped it.
     */
    const moveAlong = (entry: TEntry, axis: 'x' | 'y', delta: number): void => {
        if (delta === 0) return;
        const half = axis === 'x' ? entry.hw : entry.hh;
        const pieces = Math.min(MAX_PIECES, Math.max(1, Math.ceil(Math.abs(delta) / Math.max(0.5, half))));
        const piece = delta / pieces;
        for (let i = 0; i < pieces; i++) {
            if (axis === 'x') entry.x += piece;
            else entry.y += piece;
            insert(entry);
            settle(entry, axis, piece);
            const stopped = axis === 'x'
                ? (piece > 0 ? entry.blocked.right : entry.blocked.left)
                : (piece > 0 ? entry.blocked.down : entry.blocked.up);
            if (stopped && !isPushing(entry)) return;
        }
    };

    /**
     * A body's speed after one step of what pushes it: gravity for a dynamic one, its acceleration
     * and the forces of this frame; then its drag on each axis nothing accelerates, and its limit.
     */
    const accelerate = (entry: TEntry): void => {
        const record = entry.record;
        const v = entry.velocity;
        let ax = entry.acceleration.x;
        let ay = entry.acceleration.y;
        if (isMoving(entry)) {
            ax += gravity.x * record.gravityScale;
            ay += gravity.y * record.gravityScale;
            if (entry.forceFrame === frame && record.mass > 0) {
                ax += entry.force.x / record.mass;
                ay += entry.force.y / record.mass;
            }
        }
        v.x += ax * length;
        v.y += ay * length;
        if (record.drag > 0) {
            const slow = record.drag * length;
            if (ax === 0) v.x = Math.sign(v.x) * Math.max(0, Math.abs(v.x) - slow);
            if (ay === 0) v.y = Math.sign(v.y) * Math.max(0, Math.abs(v.y) - slow);
        }
        if (record.maxSpeed !== null) {
            v.x = Math.max(-record.maxSpeed.x, Math.min(record.maxSpeed.x, v.x));
            v.y = Math.max(-record.maxSpeed.y, Math.min(record.maxSpeed.y, v.y));
        }
    };

    const clearBlocked = (entry: TEntry): void => {
        entry.blocked.left = entry.blocked.right = entry.blocked.up = entry.blocked.down = false;
    };

    /**
     * Tells every body that started or stopped touching another in this step, once the step is over:
     * a listener may destroy what it is told about.
     */
    const tellContacts = (): void => {
        const told: Array<[TEntry, TEntry, boolean]> = [];
        for (const entry of entries) {
            if (entry.removed || !entry.placed) continue;
            const now = new Set<TEntry>();
            for (const other of near(entry, TOUCH)) {
                if (!meets(entry, other)) continue;
                // What never moves does not touch what never moves; a sensor notices what is driven.
                const counts = isMoving(entry) || isMoving(other)
                    || (entry.record.sensor && isPushing(other)) || (other.record.sensor && isPushing(entry));
                if (counts && touches(entry, other)) now.add(other);
            }
            for (const other of now) {
                if (!entry.touching.has(other) && entry.order < other.order) told.push([entry, other, true]);
            }
            for (const other of entry.touching) {
                if (!now.has(other) && entry.order < other.order) told.push([entry, other, false]);
            }
            // Kept both ways, so either side knows whichever was looked at first.
            for (const other of now) other.touching.add(entry);
            for (const other of entry.touching) {
                if (!now.has(other)) other.touching.delete(entry);
            }
            entry.touching = now;
        }
        for (const [a, b, started] of told) {
            for (const [one, other] of [[a, b], [b, a]] as const) {
                if (one.removed || other.removed) continue;
                for (const listener of [...(started ? one.enter : one.exit)]) listener(other.box);
            }
            if (closed) return;
        }
    };

    const step = (): void => {
        grid.clear();
        for (const entry of entries) {
            if (entry.removed) continue;
            readPose(entry);
            if (!entry.placed) continue;
            const reach = Math.abs(entry.velocity.x) * length + Math.abs(entry.velocity.y) * length + 1;
            insert(entry, isMoving(entry) || isPushing(entry) ? reach : 0);
        }

        // What the game drives moves first, so what stands on it is carried by where it went.
        for (const entry of entries) {
            if (entry.removed || !entry.placed || !isPushing(entry)) continue;
            clearBlocked(entry);
            accelerate(entry);
            moveAlong(entry, 'x', entry.velocity.x * length);
            moveAlong(entry, 'y', entry.velocity.y * length);
        }
        for (const entry of entries) {
            if (entry.removed || !entry.placed || isMoving(entry)) continue;
            writePose(entry);
        }

        for (const entry of entries) {
            if (entry.removed || !entry.placed || !isMoving(entry)) continue;
            const under = entry.standingOn;
            entry.standingOn = null;
            clearBlocked(entry);
            accelerate(entry);
            // Carried by what it stood on: across, and down when that goes down. Going up it is
            // pushed already.
            const carry = under !== null && !under.removed && under.placed;
            const carryX = carry ? under.movedX : 0;
            const carryY = carry && under.movedY > 0 ? under.movedY : 0;
            moveAlong(entry, 'x', entry.velocity.x * length + carryX);
            moveAlong(entry, 'y', entry.velocity.y * length + carryY);
        }
        for (const entry of entries) {
            if (entry.removed || !entry.placed || !isMoving(entry)) continue;
            writePose(entry);
        }

        tellContacts();
    };

    const remove = (entry: TEntry): void => {
        if (entry.removed) return;
        entry.removed = true;
        if (byBox.get(entry.box) === entry) byBox.delete(entry.box);
        const at = entries.indexOf(entry);
        if (at >= 0) entries.splice(at, 1);
        // What it touched is forgotten with it: it is not there to stop touching anything.
        for (const other of entry.touching) other.touching.delete(entry);
        entry.touching.clear();
        entry.enter.clear();
        entry.exit.clear();
    };

    const addBody = (box: TGameObject, record: TRetroBody2d): TRetroBodyHandle2d => {
        const layerNames = getActiveGame()?.get('config').physicsLayers ?? [];
        const listen = (set: Set<TListener>, listener: TListener): (() => void) => {
            set.add(listener);
            const off = (): void => {
                set.delete(listener);
            };
            // Set up in a scene or a piece, it leaves with it.
            getActiveBox()?.cleanups.push(off);
            return off;
        };
        const entry: TEntry = {
            box,
            record,
            order: added++,
            x: 0, y: 0, hw: 0, hh: 0, round: false,
            placed: false,
            readX: 0, readY: 0,
            lastX: Number.NaN, lastY: Number.NaN,
            movedX: 0, movedY: 0,
            velocity: { x: 0, y: 0 },
            acceleration: { x: 0, y: 0 },
            force: { x: 0, y: 0 },
            forceFrame: -1,
            blocked: { left: false, right: false, up: false, down: false },
            standingOn: null,
            touching: new Set(),
            enter: new Set(),
            exit: new Set(),
            stamp: 0,
            removed: false,
            handle: null as unknown as TRetroBodyHandle2d,
        };
        const handle: TRetroBodyHandle2d = {
            velocity: entry.velocity,
            acceleration: entry.acceleration,
            blocked: entry.blocked,
            onEnter: (listener) => listen(entry.enter, listener),
            onExit: (listener) => listen(entry.exit, listener),
            applyImpulse: (x, y) => {
                if (entry.removed || !isMoving(entry) || record.mass <= 0) return;
                entry.velocity.x += x / record.mass;
                entry.velocity.y += y / record.mass;
            },
            applyForce: (x, y) => {
                if (entry.removed) return;
                // A push asked for in an earlier frame is over: see the full body's `applyForce`.
                if (entry.forceFrame !== frame) {
                    entry.force.x = 0;
                    entry.force.y = 0;
                    entry.forceFrame = frame;
                }
                entry.force.x += x;
                entry.force.y += y;
            },
            setLinearVelocity: (vx, vy) => {
                if (entry.removed) return;
                entry.velocity.x = vx;
                entry.velocity.y = vy;
            },
            setAngularVelocity: () => {
                if (firstTimeIn(gameOfBox(box), 'retro physics: no turning')) {
                    console.warn(`[NacatamalOn] setAngularVelocity: '${box.name}' has a retro body, which never turns, so it does nothing. Turn the object itself, or give it a body of the full simulation.`);
                }
            },
            setLayers: (layer: TPhysicsLayer, collidesWith?: number | readonly TPhysicsLayer[]) => {
                const resolved = resolveLayers({ layer, ...(collidesWith !== undefined ? { collidesWith } : {}) }, layerNames);
                if (resolved.layer !== undefined) record.layer = resolved.layer;
                if (resolved.collidesWith !== undefined) record.collidesWith = resolved.collidesWith;
            },
            destroy: () => remove(entry),
        };
        entry.handle = handle;
        // An object that had a body here already has this one instead.
        const before = byBox.get(box);
        if (before !== undefined) remove(before);
        entries.push(entry);
        byBox.set(box, entry);
        box.cleanups.push(() => remove(entry));
        return handle;
    };

    return {
        addBody,
        frame: (dt: number) => {
            if (closed) return;
            // Counted whether or not a step runs, so a push asked for meanwhile is the last frame's.
            frame++;
            length = options.stepLength();
            accumulator += dt;
            const steps = Math.min(Math.floor(accumulator / length), options.maxSteps);
            for (let i = 0; i < steps && !closed; i++) step();
            accumulator -= steps * length;
            // Time it could not catch up with is let go, rather than piling up into a burst later.
            if (steps === options.maxSteps && accumulator > length) accumulator = length;
        },
        close: () => {
            closed = true;
            for (const entry of [...entries]) remove(entry);
            grid.clear();
        },
    };
};
