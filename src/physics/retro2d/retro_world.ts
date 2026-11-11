import { getActiveBox, getActiveGame } from '../../store';
import { localPositionFrom, placementOf, worldPlacementOf } from '../../box';
import { gameOfBox } from '../../box/box_game';
import { firstTimeIn } from '../../utils/first_time_in';
import { isGone } from '../../game/loop/runHookUpdates';
import { resolveLayers } from '../layer_names';
import type { TPhysicsLayer } from '../layer_names';
import { nameOfMap } from '../../gameobjects/tilemap/get_tilemap';
import { readCharacterTiles, tilesUnder } from '../character/character_tiles';
import { cellOf, eachCell, gridsOf, groundTileOf, slopeSurfaceAt, solidAtCell } from '../character/tile_cells';
import { tileInfoAt } from '../../gameobjects/tilemap/tile_queries';
import { createRetroBody2d } from '../new_retro_body';
import type { TGrid } from '../character/tile_cells';
import type { TGameObject } from '../../hooks/spawn/use_spawn';
import type { TTilemap } from '../../gameobjects/tilemap/types/t_tilemap';
import type { TTileDoc } from '../../loaders/tilemap/types/t_tilemap_doc';
import type { TCharacterBody2d, TCharacterShape2d } from '../character/t_character_body_2d';
import type { TRetroBody2d, TRetroWorld2d } from '../types/t_retro_physics';
import type { TDebugDraw } from '../../debug/t_debug_draw';
import { DEBUG_COLORS } from '../../debug/t_debug_draw';
import type { TRetroArea2d, TRetroBodyHandle2d, TRetroContact2d, TRetroRayHit2d, TRetroSide, TRetroTarget, TRetroTileTouch2d } from './types';

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
/**
 * How many bodies in a row one push passes on through: a crate pushing a crate pushing a crate.
 */
const MAX_CHAIN = 8;
/**
 * How far below its feet a body that was standing still finds the floor, in pixels beyond what it
 * moved: what keeps it on a slope going down, as the character on the maps does.
 */
const SNAP = 4;
/**
 * How far inside its edges a body looks for the floor and the ceiling, so a wall it only touches is
 * not a floor.
 */
const INSET = 0.5;
/** A character's fall when it says nothing, as on the maps alone. */
const CHARACTER_GRAVITY = 900;
const CHARACTER_MAX_FALL = 420;

/**
 * A floor of the maps under a body: how high, what kind, the tile, and how steep (the rise of a
 * slope's surface per pixel across, `0` for flat).
 */
type TFloor = { y: number; kind: 'solid' | 'oneWay' | 'slope'; tile: TTileDoc | undefined; k: number };

/**
 * What a platformer's character made in this world keeps besides its body: the rules of
 * `useTileBody2d`.
 */
type TCharacterState = {
    gravity: number;
    maxFall: number;
    climbing: boolean;
    /** The tops of the ledges it is dropping through, until its head is below them. */
    dropping: number[];
    isOnLadder: boolean;
    damage: number;
    ground: TTileDoc | undefined;
};

type TListener = (other: TGameObject, contact: TRetroContact2d) => void;
type TTileListener = (touch: TRetroTileTouch2d) => void;
type TSides = { left: boolean; right: boolean; up: boolean; down: boolean };

/**
 * One body as the world keeps it: where it is this step, its size, how it moves, and what it touches.
 */
type TEntry = {
    box: TGameObject;
    record: TRetroBody2d;
    /** The order it was added in: the order bodies move and are told, the same on every machine. */
    order: number;
    /** Where its collider's centre sits from the object, in the object's own pixels: a character's `offset`. */
    offset: { x: number; y: number };
    /** That offset in the world this step, scaled with the object. */
    shiftX: number;
    shiftY: number;
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
    /** Standing at the end of its last move, on anything: what keeps it on a slope going down. */
    onGround: boolean;
    /** Its feet on a slope, which lets its lower corners sink into the cells around it. */
    onSlope: boolean;
    /** The floor of the maps under it, if it stands on one: what kind, and what the file says. */
    groundKind: 'solid' | 'oneWay' | 'slope' | null;
    groundTile: TTileDoc | undefined;
    /** A platformer's character, made by `useTileBody2d`, or `null` for any other body. */
    character: TCharacterState | null;
    touching: Set<TEntry>;
    /** The bodies it was told it touches, and not yet told it stopped: who an `onExit` is owed to. */
    told: Set<TEntry>;
    enter: Set<TListener>;
    exit: Set<TListener>;
    /** Which of its sides touch something now, pressed or not, and which did a step before. */
    touchingSides: TSides;
    wasTouching: TSides;
    /** How hard each body it met in this step met it, along the way they met: told with the contact. */
    impacts: Map<TEntry, number>;
    /** The tests the game gave for whether it collides with another (`collidesIf`). */
    filters: Set<(other: TGameObject) => boolean>;
    /** The tiles it touches, by map, layer and cell, and who to tell when that changes. */
    tiles: Map<string, TRetroTileTouch2d>;
    tileEnter: Set<TTileListener>;
    tileExit: Set<TTileListener>;
    /** The edges of the world it is at, and who to tell when it reaches one. */
    atBounds: Set<TRetroSide>;
    boundsListeners: Set<(side: TRetroSide) => void>;
    /** How its picture turns, which its collider never does. */
    spin: { velocity: number; acceleration: number; drag: number };
    /** The last query that found it, so one query finds it once. */
    stamp: number;
    removed: boolean;
    /** Told once when it leaves the world, whatever took it out. */
    onRemoved: (() => void) | undefined;
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
    /**
     * Puts an object's body into the world and hands back what the game drives it with.
     * `removed` is told when the body leaves, whatever took it out.
     */
    addBody: (box: TGameObject, record: TRetroBody2d, removed?: () => void) => TRetroBodyHandle2d;
    /** Puts a platformer's character into the world: what `useTileBody2d` gives in a retro scene. */
    addCharacter: (box: TGameObject, shape: TCharacterShape2d) => TCharacterBody2d;
    /**
     * The nearest body or solid tile a ray meets, `ignore` left out. Read from where things are now.
     */
    castRay: (
        origin: { x: number; y: number },
        direction: { x: number; y: number },
        options: { maxDistance: number; collidesWith: number; tiles: boolean; ignore: TGameObject | null },
    ) => TRetroRayHit2d | null;
    /**
     * The bodies in a part of the world now, nearest its middle first, `ignore` left out.
     */
    findBodies: (area: TRetroArea2d, options: { collidesWith: number; sensors: boolean; ignore: TGameObject | null }) => TGameObject[];
    /**
     * Whether nothing solid is in a part of the world now: no body that stops things, and with
     * `tiles` no solid tile.
     */
    isFree: (area: TRetroArea2d, options: { collidesWith: number; tiles: boolean; ignore: TGameObject | null }) => boolean;
    /** Draws its bodies, where they are going, its edges and the rays cast since it last drew. */
    drawDebug: (draw: TDebugDraw) => void;
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

/**
 * Whether a body is out: taken out of the world, or its object destroyed earlier in this frame and
 * waiting for the sweep. Something already dead neither stops anything nor is news to anyone.
 */
const gone = (entry: TEntry): boolean => entry.removed || isGone(entry.box);

/**
 * How much of a push between two bodies goes to `b`: its share by their masses, half each when
 * neither weighs anything.
 */
const shareOf = (a: TEntry, b: TEntry): number => {
    const ma = Math.max(0, a.record.mass);
    const mb = Math.max(0, b.record.mass);
    return ma + mb > 0 ? ma / (ma + mb) : 0.5;
};

/** Whether a body is out of the world for now: gone, or switched off (`enabled: false`). */
const out = (entry: TEntry): boolean => gone(entry) || !entry.record.enabled;

/** Whether the game's tests (`collidesIf`) on both sides let two bodies meet. */
const allowed = (a: TEntry, b: TEntry): boolean => {
    for (const test of a.filters) if (!test(b.box)) return false;
    for (const test of b.filters) if (!test(a.box)) return false;
    return true;
};

/** Whether two bodies stop each other: they meet, neither only notices, and the game lets them. */
const solid = (a: TEntry, b: TEntry): boolean => !a.record.sensor && !b.record.sensor && meets(a, b) && allowed(a, b);

/** Which side of `other` a contact pushing `entry` out by `(nx, ny)` is on. */
const sideOf = (contact: { nx: number; ny: number }): TRetroSide =>
    Math.abs(contact.ny) >= Math.abs(contact.nx) ? (contact.ny < 0 ? 'up' : 'down') : (contact.nx < 0 ? 'left' : 'right');

const OPPOSITE: Record<TRetroSide, TRetroSide> = { up: 'down', down: 'up', left: 'right', right: 'left' };

/** Whether every side of a body is solid, which is how most are. */
const allSolid = (entry: TEntry): boolean => {
    const sides = entry.record.solidSides;
    return sides.up && sides.down && sides.left && sides.right;
};

/**
 * Whether a contact stops anything: the side of `other` it is on and the side of `entry` facing it
 * both solid. A body with an open side stops only what came in through a solid one in this move, by
 * no more than `dir`: a platform you jump up through holds you once you fall onto it from above, and
 * not while you are still inside it.
 */
const sidesStop = (entry: TEntry, other: TEntry, contact: TContact, dir: number): boolean => {
    const side = sideOf(contact);
    if (!other.record.solidSides[side] || !entry.record.solidSides[OPPOSITE[side]]) return false;
    if (allSolid(entry) && allSolid(other)) return true;
    return contact.depth <= Math.abs(dir) + EPS;
};

/**
 * How much of its speed a body keeps off a surface facing `(nx, ny)`: its bounce, whole or by axis.
 * Off a slanted surface (a ball on a corner) the two are mixed by how much the surface faces each
 * way, weights that add up to one, so `{ x: 1, y: 1 }` keeps the speed as `1` does and never adds any.
 */
const bounceOf = (entry: TEntry, contact: { nx: number; ny: number }): number => {
    const bounce = entry.record.bounce;
    if (typeof bounce === 'number') return bounce;
    const wx = contact.nx * contact.nx;
    const wy = contact.ny * contact.ny;
    return (wx * bounce.x + wy * bounce.y) / Math.max(EPS, wx + wy);
};

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
 * Two boxes are separated along the axis being moved on, `dir` being how far this piece moved, which
 * is what lets a box slide along a floor and stop flat against a wall instead of catching on the
 * corners between floor pieces. An overlap deeper than that move was there before it (an object put
 * a pixel into the ground, a lift raised by hand into what stands on it), and comes out the shorter
 * way instead of being thrown to the far edge. A circle is pushed out along the line from the
 * nearest point, so a ball comes off a corner at an angle.
 */
const contactOf = (a: TEntry, b: TEntry, axis: 'x' | 'y', dir: number, slack = EPS): TContact | null => {
    if (!a.round && !b.round) {
        const overX = a.hw + b.hw - Math.abs(a.x - b.x);
        const overY = a.hh + b.hh - Math.abs(a.y - b.y);
        if (overX <= slack || overY <= slack) return null;
        if ((axis === 'x' ? overX : overY) > Math.abs(dir) + EPS) axis = overX < overY ? 'x' : 'y';
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

/** Where a ray meets something: how far along, and the way the surface faces there. */
type TRayMeet = { t: number; nx: number; ny: number };

/**
 * Where a ray from `o` along the unit `(dx, dy)` enters a box, or `null` when it misses it or starts
 * inside it.
 */
const rayOnBox = (o: { x: number; y: number }, dx: number, dy: number, b: { x: number; y: number; hw: number; hh: number }): TRayMeet | null => {
    let near = -Infinity;
    let far = Infinity;
    let nx = 0;
    let ny = 0;
    for (const axis of ['x', 'y'] as const) {
        const d = axis === 'x' ? dx : dy;
        const from = o[axis];
        const low = b[axis] - (axis === 'x' ? b.hw : b.hh);
        const high = b[axis] + (axis === 'x' ? b.hw : b.hh);
        if (d === 0) {
            if (from < low || from > high) return null;
            continue;
        }
        let t1 = (low - from) / d;
        let t2 = (high - from) / d;
        let face = -1;
        if (t1 > t2) {
            [t1, t2] = [t2, t1];
            face = 1;
        }
        if (t1 > near) {
            near = t1;
            nx = axis === 'x' ? face : 0;
            ny = axis === 'y' ? face : 0;
        }
        far = Math.min(far, t2);
    }
    if (near > far || far < 0 || near < 0) return null;
    return { t: near, nx, ny };
};

/** Where a ray enters a circle, or `null` when it misses it or starts inside it. */
const rayOnCircle = (o: { x: number; y: number }, dx: number, dy: number, c: { x: number; y: number; hw: number }): TRayMeet | null => {
    const fx = o.x - c.x;
    const fy = o.y - c.y;
    const b = fx * dx + fy * dy;
    const inside = fx * fx + fy * fy - c.hw * c.hw;
    if (inside < 0) return null;
    const disc = b * b - inside;
    if (disc < 0) return null;
    const t = -b - Math.sqrt(disc);
    if (t < 0) return null;
    return { t, nx: (fx + dx * t) / c.hw, ny: (fy + dy * t) / c.hw };
};

/**
 * The first cell of a map a ray meets within `reach`, walked cell by cell: a solid one by the side it
 * enters, a slope by the line of its surface (or by a side, entering what is under it), and a ledge
 * only by its top, going down. The cell a ray starts in does not count.
 */
const rayOnCells = (grid: TGrid, o: { x: number; y: number }, dx: number, dy: number, reach: number): (TRayMeet & { column: number; row: number }) | null => {
    const { map, w, h } = grid;
    const whole = { x: grid.x + map.width * w / 2, y: grid.y + map.height * h / 2, hw: map.width * w / 2, hh: map.height * h / 2 };
    const insideMap = o.x >= grid.x && o.x <= grid.x + map.width * w && o.y >= grid.y && o.y <= grid.y + map.height * h;
    let t = 0;
    let face = { x: 0, y: 0 };
    if (!insideMap) {
        const enter = rayOnBox(o, dx, dy, whole);
        if (enter === null || enter.t > reach) return null;
        t = enter.t;
        face = { x: enter.nx, y: enter.ny };
    }
    const start = { x: o.x + dx * (t + EPS), y: o.y + dy * (t + EPS) };
    let column = Math.min(map.width - 1, Math.max(0, Math.floor((start.x - grid.x) / w)));
    let row = Math.min(map.height - 1, Math.max(0, Math.floor((start.y - grid.y) / h)));
    const stepX = Math.sign(dx);
    const stepY = Math.sign(dy);
    let nextX = dx > 0 ? (grid.x + (column + 1) * w - o.x) / dx : dx < 0 ? (grid.x + column * w - o.x) / dx : Infinity;
    let nextY = dy > 0 ? (grid.y + (row + 1) * h - o.y) / dy : dy < 0 ? (grid.y + row * h - o.y) / dy : Infinity;
    const acrossX = dx !== 0 ? w / Math.abs(dx) : Infinity;
    const acrossY = dy !== 0 ? h / Math.abs(dy) : Infinity;
    let first = insideMap;

    while (t <= reach && column >= 0 && row >= 0 && column < map.width && row < map.height) {
        const cell = cellOf(map, column, row);
        const left = grid.x + column * w;
        const top = grid.y + row * h;
        const out = Math.min(nextX, nextY);
        if (!first) {
            if (cell.solid) return { t, nx: face.x, ny: face.y, column, row };
            if (cell.oneWay && dy > 0 && face.y === -1) return { t, nx: 0, ny: -1, column, row };
        }
        if (!cell.solid && cell.slope !== undefined) {
            const p = { x: o.x + dx * t, y: o.y + dy * t };
            const surface = slopeSurfaceAt(cell.slope, left, top, w, h, p.x);
            if (!first && p.y > surface + EPS) return { t, nx: face.x, ny: face.y, column, row };
            const yLeft = top + h * (1 - cell.slope[0]);
            const k = -h * (cell.slope[1] - cell.slope[0]) / w;
            const towards = dy - k * dx;
            if (towards > 0) {
                const meet = (yLeft + (o.x - left) * k - o.y) / towards;
                if (meet >= t - EPS && meet <= Math.min(out, reach) && meet >= 0) {
                    const n = Math.sqrt(1 + k * k);
                    return { t: meet, nx: k / n, ny: -1 / n, column, row };
                }
            }
        }
        first = false;
        if (nextX < nextY) {
            column += stepX;
            t = nextX;
            nextX += acrossX;
            face = { x: -stepX, y: 0 };
        } else {
            row += stepY;
            t = nextY;
            nextY += acrossY;
            face = { x: 0, y: -stepY };
        }
    }
    return null;
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
    /** The world as the scene keeps it, read live: its gravity, edges and time. */
    world: TRetroWorld2d;
    /** The game's screen, for a world whose `bounds` are left out. */
    screen: () => { width: number; height: number };
    /** How long one step is, asked every frame: see `physicsStepOf`. */
    stepLength: () => number;
    /** The most steps one frame may take, so a long pause does not freeze the game catching up. */
    maxSteps: number;
    /** The scene's maps, asked every step: a map loads after the scene is built. */
    tilemaps: () => readonly TTilemap[];
}): TRetroWorld => {
    const world = options.world;
    const entries: TEntry[] = [];
    const byBox = new Map<TGameObject, TEntry>();
    const grid = new Map<number, TEntry[]>();
    let added = 0;
    let stamp = 0;
    let frame = 0;
    let accumulator = 0;
    let length = 1 / 60;
    let closed = false;
    /**
     * Bodies that left the world while touching one that stays, with how they touched: the one that
     * stays is told it stopped, once the step is over, as with any other contact.
     */
    let lost: Array<{ one: TEntry; other: TEntry; contact: TRetroContact2d }> = [];
    /** Half the size of the smallest solid body or cell this step, the most any move goes in one piece. */
    let smallest = Infinity;
    /** The maps as this step reads them. */
    let grids: TGrid[] = [];
    let warnedTurned = false;

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
                    if (other.stamp === stamp || other === entry || !other.placed || out(other)) continue;
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
    /**
     * Where a body is now and how big, from its object's placement in the world, or `null` when the
     * object is nowhere. A circle scaled more one way than the other takes the larger, so it still
     * holds its picture, and says so once.
     */
    const measure = (entry: TEntry): { x: number; y: number; hw: number; hh: number; round: boolean; shiftX: number; shiftY: number } | null => {
        if (placementOf(entry.box) === null) return null;
        const place = worldPlacementOf(entry.box);
        const sx = Math.abs(place.scaleX);
        const sy = Math.abs(place.scaleY);
        const shiftX = entry.offset.x * place.scaleX;
        const shiftY = entry.offset.y * place.scaleY;
        const collider = entry.record.collider;
        if (collider.shape === 'circle') {
            if (sx !== sy && firstTimeIn(gameOfBox(entry.box), 'retro physics: circle scaled unevenly')) {
                console.warn(`[NacatamalOn] retro-physics2d: the circle of '${entry.box.name}' is scaled ${sx} by ${sy}, and a retro circle stays round, so it takes the larger. Scale it the same both ways, or give it a rect.`);
            }
            const r = collider.radius * Math.max(sx, sy);
            return { x: place.x + shiftX, y: place.y + shiftY, hw: r, hh: r, round: true, shiftX, shiftY };
        }
        return { x: place.x + shiftX, y: place.y + shiftY, hw: collider.width * sx / 2, hh: collider.height * sy / 2, round: false, shiftX, shiftY };
    };

    const readPose = (entry: TEntry): void => {
        const now = measure(entry);
        if (now === null) {
            entry.placed = false;
            return;
        }
        // Its size as the last step left it, to notice the game changing it.
        const before = entry.placed && !Number.isNaN(entry.lastY) ? { hw: entry.hw, hh: entry.hh, shiftY: entry.shiftY } : null;
        entry.placed = true;
        entry.round = now.round;
        entry.hw = now.hw;
        entry.hh = now.hh;
        entry.shiftX = now.shiftX;
        entry.shiftY = now.shiftY;
        entry.x = entry.readX = now.x;
        entry.y = entry.readY = now.y;
        if (before !== null && (Math.abs(now.hw - before.hw) > EPS || Math.abs(now.hh - before.hh) > EPS)) resized(entry, before.hh, before.shiftY);
    };

    /**
     * A dynamic body the game made bigger or smaller (its collider, or its object's scale): one that
     * was standing keeps its feet where they were, so it grows up from the floor and shrinks down to
     * it instead of round its middle, which would sink it into the floor or leave it in the air. Then
     * it comes out of any solid tile it ended up in, a wall it grew into among them.
     *
     * Where its feet were is counted from the object: a collider set off from the object (a
     * character whose object stands at its feet) grows about the object, and may need no help.
     */
    const resized = (entry: TEntry, hhBefore: number, shiftYBefore: number): void => {
        if (!isMoving(entry)) return;
        if (entry.onGround) entry.y += (shiftYBefore + hhBefore) - (entry.shiftY + entry.hh);
        if (grids.length === 0) return;
        if (entry.round) roundOutOfCells(entry);
        else boxOutOfCells(entry);
    };

    /**
     * Takes a box out of the solid tiles it is in, each the shorter way that leads out of the wall
     * rather than further into it.
     */
    const boxOutOfCells = (entry: TEntry): void => {
        eachCell(grids, entry.x - entry.hw, entry.y - entry.hh, entry.x + entry.hw, entry.y + entry.hh, (grid, column, row, cellLeft, cellTop) => {
            if (!cellOf(grid.map, column, row).solid) return;
            const cx = cellLeft + grid.w / 2;
            const cy = cellTop + grid.h / 2;
            const overX = entry.hw + grid.w / 2 - Math.abs(entry.x - cx);
            const overY = entry.hh + grid.h / 2 - Math.abs(entry.y - cy);
            // Already out, by an earlier cell.
            if (overX <= EPS || overY <= EPS) return;
            const sideX = entry.x < cx ? -1 : 1;
            const sideY = entry.y < cy ? -1 : 1;
            const openX = !solidAtCell(grid, column + sideX, row);
            const openY = !solidAtCell(grid, column, row + sideY);
            const alongY = openY && (!openX || overY <= overX);
            if (!alongY && !openX) return;
            const contact = alongY ? { nx: 0, ny: sideY, depth: overY } : { nx: sideX, ny: 0, depth: overX };
            entry.x += contact.nx * contact.depth;
            entry.y += contact.ny * contact.depth;
            reflect(entry, contact);
            noteBlocked(entry, contact);
            if (contact.ny < 0) {
                entry.groundKind = 'solid';
                entry.groundTile = groundTileOf(grid.map, column, row);
            }
        });
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
        const local = localPositionFrom(entry.box, { x: entry.x - entry.shiftX, y: entry.y - entry.shiftY });
        place.x = local.x;
        place.y = local.y;
    };

    /**
     * The speed below which a body pressed against something by gravity stops bouncing off it, so
     * a ball with some `bounce` comes to rest instead of trembling on the floor for ever.
     */
    const restSpeed = (entry: TEntry, contact: TContact): number => {
        const into = -(world.gravity.x * contact.nx + world.gravity.y * contact.ny) * entry.record.gravityScale;
        return into > 0 ? into * length * 2 : 0;
    };

    /**
     * Takes away the part of a body's speed that goes into what stopped it, and gives back its own
     * `bounce` of it.
     */
    const reflect = (entry: TEntry, contact: TContact): void => {
        // A character keeps the speed across the game gave it, as on the maps: a wall stops where it
        // goes, not what the game asked for.
        if (entry.character !== null && Math.abs(contact.nx) > Math.abs(contact.ny)) return;
        const v = entry.velocity;
        const into = v.x * contact.nx + v.y * contact.ny;
        if (into >= 0) return;
        let away = -into * bounceOf(entry, contact);
        if (away < restSpeed(entry, contact)) away = 0;
        v.x += (away - into) * contact.nx;
        v.y += (away - into) * contact.ny;
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
        const toA = shareOf(b, a);
        const shared = va * (1 - toA) + vb * toA;
        const newA = shared - (va - shared) * bounceOf(a, contact);
        const newB = shared - (vb - shared) * bounceOf(b, contact);
        a.velocity.x += (newA - va) * contact.nx;
        a.velocity.y += (newA - va) * contact.ny;
        b.velocity.x += (newB - vb) * contact.nx;
        b.velocity.y += (newB - vb) * contact.ny;
    };

    /** Whether a body passes through the ledge whose top is `top`: climbing, or dropping through it. */
    const passesLedge = (entry: TEntry, top: number): boolean => {
        const character = entry.character;
        return character !== null && (character.climbing || character.dropping.some((at) => Math.abs(at - top) < EPS * 100));
    };

    /** The lowest point of a body: its feet. */
    const feetOf = (entry: TEntry): number => entry.y + entry.hh;

    /**
     * Where a body's centre rests on a floor: a box by the middle of its feet, as the old games
     * measured, and a ball by the line of the slope, so it touches it.
     */
    const restOn = (entry: TEntry, floor: TFloor): number =>
        floor.y - (entry.round ? entry.hw * Math.sqrt(1 + floor.k * floor.k) : entry.hh);

    /**
     * The highest floor of the maps between `up` above `feet` and `down` below them, or `null`. A
     * slope under the middle of the body is the floor if there is one; otherwise the top of a wall,
     * where nothing solid sits on it, or of a ledge the body was above (`from`), under any part of it.
     */
    const floorOf = (entry: TEntry, feet: number, from: number, up: number, down: number): TFloor | null => {
        let best: TFloor | null = null;
        eachCell(grids, entry.x, feet - up, entry.x + EPS, feet + down + EPS + (entry.round ? entry.hw : 0), (grid, column, row, cellLeft, cellTop) => {
            const cell = cellOf(grid.map, column, row);
            if (cell.solid || cell.slope === undefined) return;
            const y = slopeSurfaceAt(cell.slope, cellLeft, cellTop, grid.w, grid.h, entry.x);
            const k = -grid.h * (cell.slope[1] - cell.slope[0]) / grid.w;
            // A ball rests above the line by more than its radius on a steep slope: measured there.
            const lift = entry.round ? entry.hw * (Math.sqrt(1 + k * k) - 1) : 0;
            // Looked for higher by as much, or a ball walking onto a slope would not see it rise.
            if (y - lift < feet - up - lift - EPS || y - lift > feet + down + EPS) return;
            if (best === null || y < best.y) best = { y, kind: 'slope', tile: groundTileOf(grid.map, column, row), k };
        });
        if (best !== null) return best;
        // A box stands on what is under any part of it; a ball only on what is under its middle, so
        // past the edge of a cliff it rolls off the corner rather than resting on it.
        const reach = entry.round ? EPS : entry.hw - INSET;
        eachCell(grids, entry.x - reach, feet - up, entry.x + reach, feet + down + EPS, (grid, column, row, _left, cellTop) => {
            if (cellTop < feet - up - EPS || cellTop > feet + down + EPS) return;
            const cell = cellOf(grid.map, column, row);
            if (cell.solid && !solidAtCell(grid, column, row - 1)) {
                if (best === null || cellTop < best.y) best = { y: cellTop, kind: 'solid', tile: groundTileOf(grid.map, column, row), k: 0 };
            } else if (cell.oneWay && !cell.solid && !passesLedge(entry, cellTop) && from <= cellTop + EPS * 100) {
                if (best === null || cellTop < best.y) best = { y: cellTop, kind: 'oneWay', tile: groundTileOf(grid.map, column, row), k: 0 };
            }
        });
        return best;
    };

    /** Puts a body down on a floor of the maps. */
    const land = (entry: TEntry, floor: TFloor): void => {
        entry.y = restOn(entry, floor);
        // A ball comes off the slope's own line, so it rolls down; a box stands, as the old games did.
        const n = entry.round && floor.k !== 0 ? Math.sqrt(1 + floor.k * floor.k) : 1;
        const contact = { nx: entry.round ? floor.k / n : 0, ny: -1 / n, depth: 0 };
        reflect(entry, contact);
        entry.blocked.down = true;
        entry.onSlope = floor.kind === 'slope';
        entry.groundKind = floor.kind;
        entry.groundTile = floor.tile;
        entry.standingOn = null;
    };

    /**
     * Stops a box at the walls of the maps it moved into across, by `dir`. Only what is ahead of where
     * it was stops it; on a slope, its lower corners may sink into the cells around the slope by as
     * much as the slope rises under half of it, as the picture does.
     */
    const wallsAcross = (entry: TEntry, dir: number): void => {
        const from = entry.x - dir;
        const bottom = entry.y + entry.hh - EPS;
        const low = entry.onSlope ? bottom - entry.hw - Math.abs(dir) - 1 : Infinity;
        let stop: number | null = null;
        eachCell(grids, entry.x - entry.hw, entry.y - entry.hh + EPS, entry.x + entry.hw, bottom, (grid, column, row, cellLeft, cellTop) => {
            if (!cellOf(grid.map, column, row).solid || cellTop >= low) return;
            if (dir > 0 ? cellLeft + grid.w / 2 <= from : cellLeft + grid.w / 2 >= from) return;
            const edge = dir > 0 ? cellLeft - entry.hw : cellLeft + grid.w + entry.hw;
            if (stop === null || (dir > 0 ? edge < stop : edge > stop)) stop = edge;
        });
        if (stop === null) return;
        entry.x = stop;
        const contact = { nx: dir > 0 ? -1 : 1, ny: 0, depth: 0 };
        reflect(entry, contact);
        noteBlocked(entry, contact);
    };

    /** Stops a body rising by `dir` (negative) at the underside of the solid cells it went into. */
    const ceilings = (entry: TEntry, dir: number): void => {
        const head = entry.y - entry.hh;
        const before = head - dir;
        let stop: number | null = null;
        eachCell(grids, entry.x - entry.hw + INSET, head, entry.x + entry.hw - INSET, before, (grid, column, row, _left, cellTop) => {
            if (!cellOf(grid.map, column, row).solid) return;
            const under = cellTop + grid.h;
            if (under <= before + EPS && under > head && (stop === null || under > stop)) stop = under;
        });
        if (stop === null) return;
        entry.y = stop + entry.hh;
        const contact = { nx: 0, ny: 1, depth: 0 };
        reflect(entry, contact);
        noteBlocked(entry, contact);
    };

    /**
     * Pushes a ball out of the solid cells it is in, along the line from the nearest point: what
     * makes it come off a corner at an angle. A side shared with another solid cell is inside the
     * wall, and nothing comes out through it.
     */
    const roundOutOfCells = (entry: TEntry): void => {
        eachCell(grids, entry.x - entry.hw, entry.y - entry.hh, entry.x + entry.hw, entry.y + entry.hh, (grid, column, row, cellLeft, cellTop) => {
            if (!cellOf(grid.map, column, row).solid) return;
            const block = { x: cellLeft + grid.w / 2, y: cellTop + grid.h / 2, hw: grid.w / 2, hh: grid.h / 2 } as TEntry;
            const contact = circleOnRect(entry, block, EPS);
            if (contact === null) return;
            const sideX = Math.abs(contact.nx) >= Math.abs(contact.ny) ? Math.sign(contact.nx) : 0;
            const sideY = sideX === 0 ? Math.sign(contact.ny) : 0;
            if (solidAtCell(grid, column + sideX, row + sideY)) return;
            entry.x += contact.nx * contact.depth;
            entry.y += contact.ny * contact.depth;
            reflect(entry, contact);
            noteBlocked(entry, contact);
            if (contact.ny < 0 && Math.abs(contact.ny) >= Math.abs(contact.nx)) {
                entry.groundKind = 'solid';
                entry.groundTile = groundTileOf(grid.map, column, row);
            }
        });
    };

    /**
     * Settles a dynamic body against the maps after it moved a piece of the way along `axis`, by
     * `dir`: walls across, ceilings going up, and going down the floor it lands on, which for a body
     * that was standing is looked for a little below too, so it stays on a slope going down.
     */
    const settleTiles = (entry: TEntry, axis: 'x' | 'y', dir: number): void => {
        if (grids.length === 0 || !isMoving(entry)) return;
        if (axis === 'x') {
            // On the ground, the floor is followed: up a slope, and down one.
            if (entry.onGround && dir !== 0) {
                const feet = feetOf(entry);
                const floor = floorOf(entry, feet, feet, Math.abs(dir) + INSET, Math.abs(dir) + SNAP);
                if (floor !== null) {
                    entry.y = restOn(entry, floor);
                    entry.onSlope = floor.kind === 'slope';
                }
            }
            if (!entry.round) wallsAcross(entry, dir);
        } else if (dir < 0) {
            ceilings(entry, dir);
            entry.onSlope = false;
        } else {
            const feet = feetOf(entry);
            const floor = floorOf(entry, feet, feet - dir, dir + INSET, entry.onGround ? SNAP : 0);
            if (floor !== null) land(entry, floor);
            else if (!entry.blocked.down) entry.onSlope = false;
        }
        if (entry.round) roundOutOfCells(entry);
    };

    /**
     * Notes how hard two bodies met, along the way they met, for the contact they are told about:
     * the speed at which they were closing.
     */
    const noteImpact = (entry: TEntry, other: TEntry, contact: TContact): void => {
        const closing = -((entry.velocity.x - other.velocity.x) * contact.nx + (entry.velocity.y - other.velocity.y) * contact.ny);
        if (closing <= 0) return;
        entry.impacts.set(other, Math.max(closing, entry.impacts.get(other) ?? 0));
        other.impacts.set(entry, Math.max(closing, other.impacts.get(entry) ?? 0));
    };

    /**
     * Whether `other` gives way to a push: dynamic, and pushable unless the push began with something
     * driven, which nothing stops.
     */
    const givesWay = (other: TEntry, driven: boolean): boolean => isMoving(other) && (driven || other.record.pushable);

    /**
     * Moves `entry` by a push of `(px, py)`, in pieces no longer than half the smallest solid thing,
     * settling each: a big push (two bodies found deep in each other) is passed on, and stopped by a
     * thin wall, like a move, instead of jumping over it.
     */
    const pushBy = (entry: TEntry, px: number, py: number, pusher: TEntry, driven: boolean, chain = 0): void => {
        const half = Math.max(0.5, Math.min(entry.hw, entry.hh, smallest));
        const pieces = Math.min(MAX_PIECES, Math.max(1, Math.ceil(Math.max(Math.abs(px), Math.abs(py)) / half)));
        for (let i = 0; i < pieces; i++) {
            entry.x += px / pieces;
            entry.y += py / pieces;
            settleAgainstStill(entry, px / pieces, py / pieces, pusher, driven, chain);
        }
    };

    /**
     * Settles `entry` after something pushed it by `(px, py)`: out of what never gives way, and
     * pushing on any dynamic body in its way, which pushes on in turn, so a row of crates moves as one
     * and the last one against a wall stops them all. `pusher` is what pushed it, which it does not
     * push back: whatever of the push could not be passed on, the pusher settles. `driven` says the
     * push began with something driven, which every body in the row gives way to.
     */
    const settleAgainstStill = (entry: TEntry, px: number, py: number, pusher: TEntry, driven: boolean, chain = 0): void => {
        const axis = Math.abs(px) >= Math.abs(py) ? 'x' : 'y';
        const dir = axis === 'x' ? px : py;
        for (const other of near(entry)) {
            if (other === pusher || !solid(entry, other)) continue;
            const contact = contactOf(entry, other, axis, dir);
            if (contact === null || !sidesStop(entry, other, contact, dir)) continue;
            noteImpact(entry, other, contact);
            if (givesWay(other, driven)) {
                if (chain >= MAX_CHAIN) continue;
                // Passed on whole, moved and not thrown, like the push it got.
                pushBy(other, -contact.nx * contact.depth, -contact.ny * contact.depth, entry, driven, chain + 1);
                const left = contactOf(entry, other, axis, dir);
                if (left === null) continue;
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
        }
        // And out of the maps' walls, which stop a pushed crate as they stop a walking one.
        settleTiles(entry, axis, dir);
        insert(entry);
    };

    /**
     * Settles `entry` after it moved a piece of the way along `axis`: out of everything solid it
     * ran into. A dynamic body gives way to what is still, driven or not pushable, and shares a push
     * with another dynamic one by their masses; a driven body gives way to nothing and pushes what is
     * dynamic.
     */
    const settle = (entry: TEntry, axis: 'x' | 'y', dir: number): void => {
        const driven = isPushing(entry);
        for (const other of near(entry)) {
            if (!solid(entry, other)) continue;
            // A driven body passes through what is still and through other driven ones.
            if (driven && !isMoving(other)) continue;
            const contact = contactOf(entry, other, axis, dir);
            if (contact === null || !sidesStop(entry, other, contact, dir)) continue;
            noteImpact(entry, other, contact);

            if (givesWay(other, driven)) {
                // Pushed out of the way: all of it by something driven, a share by something dynamic.
                const given = driven ? contact.depth : contact.depth * shareOf(entry, other);
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
                pushBy(other, -contact.nx * given, -contact.ny * given, entry, driven);
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
        // Then the maps, which only what is dynamic runs into: a driven body passes through them.
        settleTiles(entry, axis, dir);
        insert(entry);
    };

    /**
     * How far a body can go along `axis` towards `sign` before anything that might stop it is in its
     * way, looking no further than `reach`: a body that could stop or be pushed by it, from a side
     * that stops, or for a dynamic body a tile that is not empty (a ledge only falling onto it).
     * What it is already inside is left out: that is not in its way, and is settled as always.
     * Errs short, never long. Looks only through the part of the grid it would cross.
     */
    const clearAhead = (entry: TEntry, axis: 'x' | 'y', sign: number, reach: number): number => {
        let clear = reach;
        const across = axis === 'x' ? 'y' : 'x';
        const half = axis === 'x' ? entry.hw : entry.hh;
        const halfAcross = axis === 'x' ? entry.hh : entry.hw;
        const front = entry[axis] + sign * half;
        const far = front + sign * reach;
        const driven = isPushing(entry);
        // The side of what it meets that faces it, and its own side facing that.
        const facing: TRetroSide = axis === 'x' ? (sign > 0 ? 'left' : 'right') : (sign > 0 ? 'up' : 'down');
        const lowAcross = entry[across] - halfAcross + EPS;
        const highAcross = entry[across] + halfAcross - EPS;
        const [left, right] = axis === 'x' ? [Math.min(front, far), Math.max(front, far)] : [lowAcross, highAcross];
        const [top, bottom] = axis === 'x' ? [lowAcross, highAcross] : [Math.min(front, far), Math.max(front, far)];

        stamp++;
        for (let cy = Math.floor(top / CELL); cy <= Math.floor(bottom / CELL); cy++) {
            for (let cx = Math.floor(left / CELL); cx <= Math.floor(right / CELL); cx++) {
                const cell = grid.get(cellKey(cx, cy));
                if (cell === undefined) continue;
                for (const other of cell) {
                    if (other.stamp === stamp || other === entry || !other.placed || out(other)) continue;
                    other.stamp = stamp;
                    if (!solid(entry, other) || (driven && !isMoving(other))) continue;
                    if (!other.record.solidSides[facing] || !entry.record.solidSides[OPPOSITE[facing]]) continue;
                    const otherHalf = axis === 'x' ? other.hw : other.hh;
                    const otherAcross = axis === 'x' ? other.hh : other.hw;
                    if (Math.abs(other[across] - entry[across]) >= halfAcross + otherAcross - EPS) continue;
                    const gap = sign * (other[axis] - sign * otherHalf - front);
                    if (gap < -EPS) continue;
                    clear = Math.min(clear, Math.max(0, gap));
                }
            }
        }
        if (grids.length === 0 || !isMoving(entry)) return clear;
        const falling = axis === 'y' && sign > 0;
        eachCell(grids, left, top, right, bottom, (grid, column, row, cellLeft, cellTop) => {
            const cell = cellOf(grid.map, column, row);
            if (!cell.solid && !(cell.oneWay && falling) && cell.slope === undefined) return;
            const near = axis === 'x'
                ? (sign > 0 ? cellLeft : cellLeft + grid.w)
                : (sign > 0 ? cellTop : cellTop + grid.h);
            const gap = sign * (near - front);
            // A ledge or a slope it is already in is not ahead of it.
            if (gap < -EPS && !cell.solid) return;
            clear = Math.min(clear, Math.max(0, gap));
        });
        return clear;
    };

    /**
     * Moves a body `delta` pixels along `axis`, in pieces no longer than half its size that way, so
     * a fast one cannot step over a thin wall between two steps. It stops at what stopped it.
     *
     * A move too long to walk in a bounded number of pieces leaps over the empty part of the way in
     * one go, to a piece short of the first thing that might stop it, and walks from there: a bullet
     * stops at a thin wall at any speed. Whatever is left when even that has taken too many pieces
     * (a long push through a row of crates) goes in even pieces, as a short move does: it is never
     * dropped.
     */
    const moveAlong = (entry: TEntry, axis: 'x' | 'y', delta: number): void => {
        if (delta === 0) return;
        const sign = Math.sign(delta);
        // Half its own size that way, or of the smallest solid body, so neither steps over the other.
        const size = Math.max(0.5, Math.min(axis === 'x' ? entry.hw : entry.hh, smallest));
        /** Moves one piece and settles it; whether that stopped it. */
        const go = (piece: number, dir: number): boolean => {
            if (axis === 'x') entry.x += sign * piece;
            else entry.y += sign * piece;
            insert(entry);
            settle(entry, axis, sign * dir);
            const stopped = axis === 'x'
                ? (sign > 0 ? entry.blocked.right : entry.blocked.left)
                : (sign > 0 ? entry.blocked.down : entry.blocked.up);
            return stopped && !isPushing(entry);
        };
        let left = Math.abs(delta);
        for (let walked = 0; left > EPS && walked < MAX_PIECES; walked++) {
            let piece = Math.min(left, size);
            if (left / size <= MAX_PIECES) {
                // Short enough to walk: even pieces, as always.
                piece = left / Math.max(1, Math.ceil(left / size - EPS));
            } else {
                const clear = clearAhead(entry, axis, sign, left);
                if (clear > size * 2) piece = clear - size;
            }
            left -= piece;
            if (go(piece, Math.min(piece, size))) return;
        }
        if (left <= EPS) return;
        const pieces = Math.min(MAX_PIECES, Math.max(1, Math.ceil(left / size - EPS)));
        for (let i = 0; i < pieces; i++) {
            if (go(left / pieces, left / pieces)) return;
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
        const character = entry.character;
        if (isMoving(entry)) {
            // A character falls by its own gravity, and not at all while it climbs.
            if (character !== null) {
                if (!character.climbing) ay += character.gravity;
            } else {
                ax += world.gravity.x * record.gravityScale;
                ay += world.gravity.y * record.gravityScale;
            }
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
        const max = record.maxSpeed;
        if (typeof max === 'number') {
            // The whole speed, whichever way it goes.
            const speed = Math.hypot(v.x, v.y);
            if (speed > max) {
                v.x *= max / speed;
                v.y *= max / speed;
            }
        } else if (max !== null) {
            v.x = Math.max(-max.x, Math.min(max.x, v.x));
            v.y = Math.max(-max.y, Math.min(max.y, v.y));
        }
        if (character !== null && !character.climbing) v.y = Math.min(v.y, character.maxFall);
    };

    const clearBlocked = (entry: TEntry): void => {
        entry.blocked.left = entry.blocked.right = entry.blocked.up = entry.blocked.down = false;
    };

    /** Which side of `one` the body `other` is on, by where their middles are against their sizes. */
    const sideTowards = (one: TEntry, other: TEntry): TRetroSide => {
        const dx = (other.x - one.x) / Math.max(EPS, one.hw + other.hw);
        const dy = (other.y - one.y) / Math.max(EPS, one.hh + other.hh);
        return Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'down' : 'up');
    };

    /**
     * Which sides of a body touch something now, pressed or not: what stopped it, the bodies it
     * touches, the solid tiles right beside it, the ground it stands on, and the edges it is at.
     */
    const touchedSides = (entry: TEntry, bodies: ReadonlySet<TEntry>): TSides => {
        const sides = { ...entry.blocked };
        for (const other of bodies) {
            if (!other.record.sensor && !entry.record.sensor) sides[sideTowards(entry, other)] = true;
        }
        if (entry.onGround) sides.down = true;
        for (const side of entry.atBounds) sides[side] = true;
        if (grids.length > 0 && !entry.record.sensor) {
            const left = entry.x - entry.hw;
            const right = entry.x + entry.hw;
            const top = entry.y - entry.hh;
            const bottom = entry.y + entry.hh;
            const strip = (x0: number, y0: number, x1: number, y1: number): boolean => {
                let found = false;
                eachCell(grids, x0, y0, x1, y1, (grid, column, row) => {
                    if (cellOf(grid.map, column, row).solid) found = true;
                });
                return found;
            };
            if (!sides.left && strip(left - TOUCH, top + INSET, left, bottom - INSET)) sides.left = true;
            if (!sides.right && strip(right, top + INSET, right + TOUCH, bottom - INSET)) sides.right = true;
            if (!sides.up && strip(left + INSET, top - TOUCH, right - INSET, top)) sides.up = true;
            if (!sides.down && strip(left + INSET, bottom, right - INSET, bottom + TOUCH)) sides.down = true;
        }
        return sides;
    };

    /**
     * Tells every body that started or stopped touching another in this step, once the step is over,
     * with the side the other is on and how hard they met: a listener may destroy what it is told
     * about. A body switched off touches nothing, so what it touched hears that it stopped.
     */
    const tellContacts = (): void => {
        const told: Array<[TEntry, TEntry, boolean]> = [];
        for (const entry of entries) {
            if (gone(entry)) continue;
            const now = new Set<TEntry>();
            if (!out(entry) && entry.placed) {
                for (const other of near(entry, TOUCH)) {
                    if (!meets(entry, other) || !allowed(entry, other)) continue;
                    // What never moves does not touch what never moves; a sensor notices what is driven.
                    const counts = isMoving(entry) || isMoving(other)
                        || (entry.record.sensor && isPushing(other)) || (other.record.sensor && isPushing(entry));
                    if (counts && touches(entry, other)) now.add(other);
                }
            }
            const sides = !out(entry) && entry.placed ? touchedSides(entry, now) : { left: false, right: false, up: false, down: false };
            Object.assign(entry.touchingSides, sides);
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
        const contacts = told.map(([a, b, started]) => {
            const speed = (one: TEntry, other: TEntry): number =>
                one.impacts.get(other) ?? Math.hypot(one.velocity.x - other.velocity.x, one.velocity.y - other.velocity.y);
            return { a, b, started, forA: { side: sideTowards(a, b), speed: speed(a, b) }, forB: { side: sideTowards(b, a), speed: speed(b, a) } };
        });
        for (const entry of entries) entry.impacts.clear();
        // Who left the world goes first: a body put in another's place is told after the old one left.
        tellLost();
        if (closed) return;
        for (const { a, b, started, forA, forB } of contacts) {
            for (const [one, other, contact] of [[a, b, forA], [b, a, forB]] as const) {
                // What was destroyed meanwhile is told to the one left when it leaves the world.
                if (gone(one) || gone(other)) continue;
                if (started) one.told.add(other);
                else if (!one.told.delete(other)) continue;
                for (const listener of [...(started ? one.enter : one.exit)]) listener(other.box, contact);
            }
            if (closed) return;
        }
        tellLost();
    };

    /** Notes, for each body that stays, the ones it was told it touches that were destroyed since. */
    const noteGone = (): void => {
        for (const one of entries) {
            if (gone(one) || one.told.size === 0) continue;
            for (const other of one.told) {
                if (!gone(other)) continue;
                one.told.delete(other);
                lost.push({ one, other, contact: lostContact(one, other) });
            }
        }
    };

    const lostContact = (one: TEntry, other: TEntry): TRetroContact2d =>
        ({ side: sideTowards(one, other), speed: Math.hypot(other.velocity.x - one.velocity.x, other.velocity.y - one.velocity.y) });

    /** Tells each body that stays that one it touched has left the world. */
    const tellLost = (): void => {
        noteGone();
        while (lost.length > 0 && !closed) {
            const now = lost;
            lost = [];
            for (const { one, other, contact } of now) {
                if (gone(one)) continue;
                for (const listener of [...one.exit]) listener(other.box, contact);
                if (closed) return;
            }
        }
    };

    /** A number for each map, for the keys of the tiles a body touches. */
    const mapKeys = new WeakMap<TTilemap, number>();
    let mapCount = 0;
    const keyOfMap = (map: TTilemap): number => {
        let key = mapKeys.get(map);
        if (key === undefined) {
            key = ++mapCount;
            mapKeys.set(map, key);
        }
        return key;
    };

    /**
     * Notes which tiles a body that listens for them touches now, in every layer, and tells it of
     * the ones it started and stopped touching. Touching is overlapping, or meeting along a side:
     * what it stands on and the wall it leans on count, a corner alone does not.
     */
    const tellTiles = (entry: TEntry, later: Array<() => void>): void => {
        if (entry.tileEnter.size === 0 && entry.tileExit.size === 0) return;
        const now = new Map<string, TRetroTileTouch2d>();
        if (!out(entry) && entry.placed) {
            const left = entry.x - entry.hw;
            const right = entry.x + entry.hw;
            const top = entry.y - entry.hh;
            const bottom = entry.y + entry.hh;
            eachCell(grids, left - TOUCH, top - TOUCH, right + TOUCH, bottom + TOUCH, (grid, column, row, cellLeft, cellTop) => {
                const overX = Math.min(right, cellLeft + grid.w) - Math.max(left, cellLeft);
                const overY = Math.min(bottom, cellTop + grid.h) - Math.max(top, cellTop);
                if (!((overX > EPS && overY > -TOUCH) || (overY > EPS && overX > -TOUCH))) return;
                for (let layer = 0; layer < grid.map.layers.length; layer++) {
                    const tile = tileInfoAt(grid.map, layer, column, row);
                    if (tile === undefined) continue;
                    now.set(`${keyOfMap(grid.map)}:${layer}:${column}:${row}`, { tile, cell: { map: grid.map, layer, column, row } });
                }
            });
        }
        for (const [key, touch] of now) {
            if (!entry.tiles.has(key)) later.push(() => { for (const listener of [...entry.tileEnter]) listener(touch); });
        }
        for (const [key, touch] of entry.tiles) {
            if (!now.has(key)) later.push(() => { for (const listener of [...entry.tileExit]) listener(touch); });
        }
        entry.tiles = now;
    };

    /** The world's edges: its `bounds`, or the game's screen. */
    const edges = (): { x: number; y: number; width: number; height: number } => world.bounds ?? { x: 0, y: 0, ...options.screen() };

    /**
     * Keeps a body that stops at the edges of the world inside them, or brings one that wraps back
     * in by the opposite edge, and tells it which edge it reached: once when it reaches an edge it
     * stops at, every time it wraps.
     */
    const keepInBounds = (entry: TEntry, later: Array<() => void>): void => {
        const mode = entry.record.bounds;
        const reached = new Set<TRetroSide>();
        if (mode !== 'pass') {
            const box = edges();
            const right = box.x + box.width;
            const bottom = box.y + box.height;
            if (mode === 'stop') {
                const stop = (side: TRetroSide, nx: number, ny: number): void => {
                    const contact = { nx, ny, depth: 0 };
                    if (isMoving(entry)) reflect(entry, contact);
                    noteBlocked(entry, contact);
                    reached.add(side);
                };
                // Past an edge it is put back and stopped; up against one, it is at it all the same.
                if (entry.x - entry.hw < box.x) {
                    entry.x = box.x + entry.hw;
                    stop('left', 1, 0);
                } else if (entry.x + entry.hw > right) {
                    entry.x = right - entry.hw;
                    stop('right', -1, 0);
                } else if (entry.x - entry.hw <= box.x + TOUCH) {
                    reached.add('left');
                } else if (entry.x + entry.hw >= right - TOUCH) {
                    reached.add('right');
                }
                if (entry.y - entry.hh < box.y) {
                    entry.y = box.y + entry.hh;
                    stop('up', 0, 1);
                } else if (entry.y + entry.hh > bottom) {
                    entry.y = bottom - entry.hh;
                    stop('down', 0, -1);
                    entry.standingOn = null;
                } else if (entry.y - entry.hh <= box.y + TOUCH) {
                    reached.add('up');
                } else if (entry.y + entry.hh >= bottom - TOUCH) {
                    reached.add('down');
                }
            } else {
                // Wholly past an edge, it comes in by the other, as far past that one as it went.
                if (entry.x - entry.hw > right) {
                    entry.x = box.x - entry.hw + (entry.x - entry.hw - right);
                    reached.add('right');
                } else if (entry.x + entry.hw < box.x) {
                    entry.x = right + entry.hw - (box.x - entry.x - entry.hw);
                    reached.add('left');
                }
                if (entry.y - entry.hh > bottom) {
                    entry.y = box.y - entry.hh + (entry.y - entry.hh - bottom);
                    reached.add('down');
                } else if (entry.y + entry.hh < box.y) {
                    entry.y = bottom + entry.hh - (box.y - entry.y - entry.hh);
                    reached.add('up');
                }
                // A jump across the world carries nothing standing on it.
                if (reached.size > 0) {
                    entry.lastX = Number.NaN;
                    entry.lastY = Number.NaN;
                }
            }
        }
        for (const side of reached) {
            if (mode === 'wrap' || !entry.atBounds.has(side)) later.push(() => { for (const listener of [...entry.boundsListeners]) listener(side); });
        }
        entry.atBounds = reached;
        // Where it is now, for what is near it in the rest of the step.
        if (reached.size > 0) insert(entry);
    };

    /** Turns a body's picture by its spin; its collider stays square to the screen. */
    const turn = (entry: TEntry): void => {
        const spin = entry.spin;
        if (spin.velocity === 0 && spin.acceleration === 0) return;
        spin.velocity += spin.acceleration * length;
        if (spin.acceleration === 0 && spin.drag > 0) {
            spin.velocity = Math.sign(spin.velocity) * Math.max(0, Math.abs(spin.velocity) - spin.drag * length);
        }
        const place = placementOf(entry.box);
        if (place !== null) place.rotation += spin.velocity * length;
    };

    /**
     * How fast what a body stands on carries it, in pixels per second: a belt (`push` on the tile), or
     * for a character also a current or the wind of a tile it is in, as on the maps alone.
     */
    const beltUnder = (entry: TEntry): { x: number; y: number } => {
        const character = entry.character;
        if (character !== null) {
            const push = entry.onGround
                ? character.ground?.push
                : tilesUnder(grids.map((map) => map.map), entry.x, entry.y, entry.x, entry.y).find((tile) => tile.push !== undefined)?.push;
            return { x: push?.x ?? 0, y: push?.y ?? 0 };
        }
        const push = entry.onGround ? entry.groundTile?.push : undefined;
        return { x: push?.x ?? 0, y: push?.y ?? 0 };
    };

    /**
     * What the tiles around a character say once it has moved: a ladder, harm, the tile under its
     * feet, and the ledges it has fallen through for good. The same reading as on the maps alone.
     */
    const readTiles = (entry: TEntry, character: TCharacterState): void => {
        const head = entry.y - entry.hh;
        for (let i = character.dropping.length - 1; i >= 0; i--) {
            if (head > character.dropping[i]) character.dropping.splice(i, 1);
        }
        const tiles = readCharacterTiles(grids.map((map) => map.map), { x: entry.x, y: entry.y }, entry.hw, entry.hh, entry.onGround);
        character.isOnLadder = tiles.isOnLadder;
        character.damage = tiles.damage;
        character.ground = tiles.ground;
        // Climbed out of the ladder, by its top or its side: no longer climbing.
        if (character.climbing && !tiles.inLadder) character.climbing = false;
    };

    const step = (): void => {
        grid.clear();
        grids = gridsOf(options.tilemaps(), (map) => {
            if (warnedTurned) return;
            warnedTurned = true;
            console.warn(`[NacatamalOn] retro-physics2d: ${nameOfMap(map)} is turned, so its bodies pass through it: a map can be moved and scaled, not turned.`);
        });
        // Half the smallest cell too: nothing steps over a cell between two pieces.
        smallest = grids.reduce((least, map) => Math.min(least, map.w / 2, map.h / 2), Infinity);
        for (const entry of entries) {
            if (out(entry)) continue;
            readPose(entry);
            if (!entry.placed) continue;
            if (!entry.record.sensor) smallest = Math.min(smallest, entry.hw, entry.hh);
            const reach = Math.abs(entry.velocity.x) * length + Math.abs(entry.velocity.y) * length + 1;
            insert(entry, isMoving(entry) || isPushing(entry) ? reach : 0);
        }
        // What is told once the step is over, when nothing is moving: a listener may destroy anything.
        const later: Array<() => void> = [];

        // What the game drives moves first, so what stands on it is carried by where it went.
        for (const entry of entries) {
            if (out(entry) || !entry.placed || !isPushing(entry)) continue;
            clearBlocked(entry);
            accelerate(entry);
            moveAlong(entry, 'x', entry.velocity.x * length);
            moveAlong(entry, 'y', entry.velocity.y * length);
            keepInBounds(entry, later);
        }
        for (const entry of entries) {
            if (out(entry) || !entry.placed || isMoving(entry)) continue;
            writePose(entry);
        }

        for (const entry of entries) {
            if (out(entry) || !entry.placed || !isMoving(entry)) continue;
            const under = entry.standingOn;
            entry.standingOn = null;
            clearBlocked(entry);
            accelerate(entry);
            // Carried by what it stood on, as much as that carries: across, and down when that goes
            // down. Going up it is pushed already.
            const carry = under !== null && !out(under) && under.placed ? under.record.carries : 0;
            const carryX = carry !== 0 ? under!.movedX * carry : 0;
            const carryY = carry !== 0 && under!.movedY > 0 ? under!.movedY * carry : 0;
            // And by a belt it stands on, or for a character a current it is in.
            const push = beltUnder(entry);
            entry.groundKind = null;
            entry.groundTile = undefined;
            moveAlong(entry, 'x', (entry.velocity.x + push.x) * length + carryX);
            moveAlong(entry, 'y', (entry.velocity.y + push.y) * length + carryY);
            keepInBounds(entry, later);
            entry.onGround = entry.blocked.down;
            if (!entry.onGround) entry.onSlope = false;
            if (entry.character !== null) readTiles(entry, entry.character);
        }
        for (const entry of entries) {
            if (out(entry) || !entry.placed) continue;
            if (isMoving(entry)) writePose(entry);
            turn(entry);
        }

        tellContacts();
        if (closed) return;
        for (const entry of entries) tellTiles(entry, later);
        for (const tell of later) {
            tell();
            if (closed) return;
        }
    };

    const remove = (entry: TEntry): void => {
        if (entry.removed) return;
        entry.removed = true;
        if (byBox.get(entry.box) === entry) byBox.delete(entry.box);
        const at = entries.indexOf(entry);
        if (at >= 0) entries.splice(at, 1);
        // What it touched is forgotten with it, and each body told it touched it is told it stopped:
        // a zone it was in, a sensor it set off, the floor it stood on.
        for (const other of entry.touching) other.touching.delete(entry);
        for (const other of closed ? [] : entries) {
            if (!other.told.delete(entry)) continue;
            lost.push({ one: other, other: entry, contact: lostContact(other, entry) });
        }
        entry.touching.clear();
        entry.told.clear();
        entry.enter.clear();
        entry.exit.clear();
        entry.tileEnter.clear();
        entry.tileExit.clear();
        entry.boundsListeners.clear();
        entry.filters.clear();
        entry.onRemoved?.();
    };

    const createEntry = (
        box: TGameObject,
        record: TRetroBody2d,
        removed: (() => void) | undefined,
        character: TCharacterState | null,
        offset: { x: number; y: number },
    ): TEntry => ({
        box,
        record,
        order: added++,
        offset,
        shiftX: 0, shiftY: 0,
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
        onGround: false,
        onSlope: false,
        groundKind: null,
        groundTile: undefined,
        character,
        touching: new Set(),
        told: new Set(),
        enter: new Set(),
        exit: new Set(),
        touchingSides: { left: false, right: false, up: false, down: false },
        wasTouching: { left: false, right: false, up: false, down: false },
        impacts: new Map(),
        filters: new Set(),
        tiles: new Map(),
        tileEnter: new Set(),
        tileExit: new Set(),
        atBounds: new Set(),
        boundsListeners: new Set(),
        spin: { velocity: 0, acceleration: 0, drag: 0 },
        stamp: 0,
        removed: false,
        onRemoved: removed,
        handle: null as unknown as TRetroBodyHandle2d,
    });

    const addBody = (box: TGameObject, record: TRetroBody2d, removed?: () => void): TRetroBodyHandle2d => {
        const layerNames = getActiveGame()?.get('config').physicsLayers ?? [];
        const listen = <T>(set: Set<T>, listener: T): (() => void) => {
            set.add(listener);
            const off = (): void => {
                set.delete(listener);
            };
            // Set up in a scene or a piece, it leaves with it.
            getActiveBox()?.cleanups.push(off);
            return off;
        };
        /** Where a target is now, in the world: a point as it is, an object where it is placed. */
        const pointOf = (target: TRetroTarget): { x: number; y: number } =>
            'children' in target ? worldPlacementOf(target) : target;
        /** The way and the distance from this body to a target. */
        const towards = (target: TRetroTarget): { dx: number; dy: number; far: number } => {
            const here = measure(entry) ?? { x: entry.x, y: entry.y };
            const there = pointOf(target);
            const dx = there.x - here.x;
            const dy = there.y - here.y;
            return { dx, dy, far: Math.hypot(dx, dy) };
        };
        const entry = createEntry(box, record, removed, null, { x: 0, y: 0 });
        const handle: TRetroBodyHandle2d = {
            velocity: entry.velocity,
            acceleration: entry.acceleration,
            get speed() { return Math.hypot(entry.velocity.x, entry.velocity.y); },
            blocked: entry.blocked,
            touching: entry.touchingSides,
            wasTouching: entry.wasTouching,
            get angularVelocity() { return entry.spin.velocity; },
            set angularVelocity(value: number) { entry.spin.velocity = value; },
            get angularAcceleration() { return entry.spin.acceleration; },
            set angularAcceleration(value: number) { entry.spin.acceleration = value; },
            get angularDrag() { return entry.spin.drag; },
            set angularDrag(value: number) { entry.spin.drag = value; },
            onEnter: (listener) => listen(entry.enter, listener),
            onExit: (listener) => listen(entry.exit, listener),
            onTileEnter: (listener) => listen(entry.tileEnter, listener),
            onTileExit: (listener) => listen(entry.tileExit, listener),
            onBounds: (listener) => listen(entry.boundsListeners, listener),
            collidesIf: (test) => listen(entry.filters, test),
            moveTowards: (target, speed) => {
                const { dx, dy, far } = towards(target);
                if (entry.removed) return far;
                if (far < EPS) {
                    entry.velocity.x = 0;
                    entry.velocity.y = 0;
                    return 0;
                }
                // Within one step of it, just fast enough to land on it.
                const pace = far <= speed * length ? far / length : speed;
                entry.velocity.x = dx / far * pace;
                entry.velocity.y = dy / far * pace;
                return far;
            },
            accelerateTowards: (target, rate) => {
                const { dx, dy, far } = towards(target);
                if (entry.removed) return far;
                entry.acceleration.x = far < EPS ? 0 : dx / far * rate;
                entry.acceleration.y = far < EPS ? 0 : dy / far * rate;
                return far;
            },
            setVelocityFromAngle: (angle, speed) => {
                if (entry.removed) return;
                entry.velocity.x = Math.cos(angle) * speed;
                entry.velocity.y = Math.sin(angle) * speed;
            },
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
            // Its picture turns; its collider stays square to the screen.
            setAngularVelocity: (w) => {
                entry.spin.velocity = w;
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

    const addCharacter = (box: TGameObject, shape: TCharacterShape2d): TCharacterBody2d => {
        // A body like any other, which the world moves with the character's own rules. It is not
        // written on the object: `useTileBody2d` never wrote down a collider, here or on the maps.
        const record = createRetroBody2d({ name: box.name, body: 'dynamic', collider: { shape: 'rect', width: shape.width, height: shape.height } });
        const state: TCharacterState = {
            gravity: shape.gravity ?? CHARACTER_GRAVITY,
            maxFall: shape.maxFall ?? CHARACTER_MAX_FALL,
            climbing: false,
            dropping: [],
            isOnLadder: false,
            damage: 0,
            ground: undefined,
        };
        const entry = createEntry(box, record, undefined, state, { x: shape.offset?.[0] ?? 0, y: shape.offset?.[1] ?? 0 });
        entries.push(entry);
        box.cleanups.push(() => remove(entry));
        const onOneWay = (): boolean => entry.onGround && entry.groundKind === 'oneWay';
        return {
            velocity: entry.velocity,
            get climbing() { return state.climbing; },
            // Climbing passes through ledges, so from the top of a ladder it goes down.
            set climbing(value: boolean) { state.climbing = value; },
            get isOnGround() { return entry.onGround; },
            get isOnCeiling() { return entry.blocked.up; },
            get wallSide() { return entry.blocked.right ? 'right' : entry.blocked.left ? 'left' : null; },
            get isOnOneWay() { return onOneWay(); },
            get isOnLadder() { return state.isOnLadder; },
            get ground() { return state.ground; },
            get damage() { return state.damage; },
            dropThrough: () => {
                if (!onOneWay()) return;
                state.dropping.push(entry.y + entry.hh);
                entry.onGround = false;
                entry.groundKind = null;
            },
            setPosition: (x, y) => {
                const place = placementOf(box);
                if (place === null) return;
                const local = localPositionFrom(box, { x, y });
                place.x = local.x;
                place.y = local.y;
                entry.onGround = false;
            },
            destroy: () => remove(entry),
        };
    };

    /**
     * The nearest body or tile a ray meets, from where everything is now: bodies measured on their
     * objects, the maps as they are. A ray starting inside something does not meet it.
     */
    /** The rays cast since the debug mode last drew, for it to show; the newest few hundred. */
    const rays: Array<{ from: { x: number; y: number }; to: { x: number; y: number }; hit: boolean }> = [];
    const RAYS_KEPT = 256;

    const castRay: TRetroWorld['castRay'] = (origin, direction, opts) => {
        const hit = castRayNow(origin, direction, opts);
        const span = Math.hypot(direction.x, direction.y);
        if (span > 0) {
            // A miss is drawn as far as it reached, or a long way.
            const reach = hit?.distance ?? (Number.isFinite(opts.maxDistance) ? opts.maxDistance : 1000);
            rays.push({ from: { ...origin }, to: { x: origin.x + direction.x / span * reach, y: origin.y + direction.y / span * reach }, hit: hit !== null });
            if (rays.length > RAYS_KEPT) rays.shift();
        }
        return hit;
    };

    const castRayNow: TRetroWorld['castRay'] = (origin, direction, opts) => {
        const span = Math.hypot(direction.x, direction.y);
        if (span === 0 || closed) return null;
        const dx = direction.x / span;
        const dy = direction.y / span;
        let reach = opts.maxDistance;
        let best: TRetroRayHit2d | null = null;
        const at = (t: number) => ({ x: origin.x + dx * t, y: origin.y + dy * t });

        for (const entry of entries) {
            if (out(entry) || entry.box === opts.ignore || entry.record.sensor) continue;
            if ((opts.collidesWith & (1 << entry.record.layer)) === 0) continue;
            const now = measure(entry);
            if (now === null) continue;
            const hit = now.round ? rayOnCircle(origin, dx, dy, now) : rayOnBox(origin, dx, dy, now);
            if (hit === null || hit.t > reach) continue;
            reach = hit.t;
            best = { object: entry.box, cell: null, tile: undefined, point: at(hit.t), normal: { x: hit.nx, y: hit.ny }, distance: hit.t };
        }

        if (opts.tiles) {
            for (const map of gridsOf(options.tilemaps(), () => {})) {
                const hit = rayOnCells(map, origin, dx, dy, reach);
                if (hit === null) continue;
                reach = hit.t;
                best = {
                    object: null,
                    cell: { map: map.map, column: hit.column, row: hit.row },
                    tile: groundTileOf(map.map, hit.column, hit.row),
                    point: at(hit.t),
                    normal: { x: hit.nx, y: hit.ny },
                    distance: hit.t,
                };
            }
        }
        return best;
    };

    /** Whether a body, measured now, overlaps a part of the world. */
    const inArea = (now: { x: number; y: number; hw: number; hh: number; round: boolean }, area: TRetroArea2d): boolean => {
        if ('radius' in area) {
            if (now.round) return Math.hypot(now.x - area.x, now.y - area.y) < now.hw + area.radius - EPS;
            const cx = Math.max(now.x - now.hw, Math.min(area.x, now.x + now.hw));
            const cy = Math.max(now.y - now.hh, Math.min(area.y, now.y + now.hh));
            return Math.hypot(area.x - cx, area.y - cy) < area.radius - EPS;
        }
        const box = { x: area.x + area.width / 2, y: area.y + area.height / 2, hw: area.width / 2, hh: area.height / 2 };
        if (now.round) {
            const cx = Math.max(box.x - box.hw, Math.min(now.x, box.x + box.hw));
            const cy = Math.max(box.y - box.hh, Math.min(now.y, box.y + box.hh));
            return Math.hypot(now.x - cx, now.y - cy) < now.hw - EPS;
        }
        return Math.abs(now.x - box.x) < now.hw + box.hw - EPS && Math.abs(now.y - box.y) < now.hh + box.hh - EPS;
    };

    const middleOf = (area: TRetroArea2d): { x: number; y: number } =>
        'radius' in area ? area : { x: area.x + area.width / 2, y: area.y + area.height / 2 };

    const findBodies: TRetroWorld['findBodies'] = (area, opts) => {
        const middle = middleOf(area);
        const found: Array<{ box: TGameObject; far: number }> = [];
        for (const entry of entries) {
            if (out(entry) || entry.box === opts.ignore || (entry.record.sensor && !opts.sensors)) continue;
            if ((opts.collidesWith & (1 << entry.record.layer)) === 0) continue;
            const now = measure(entry);
            if (now === null || !inArea(now, area)) continue;
            found.push({ box: entry.box, far: Math.hypot(now.x - middle.x, now.y - middle.y) });
        }
        return found.sort((a, b) => a.far - b.far).map((one) => one.box);
    };

    const isFree: TRetroWorld['isFree'] = (area, opts) => {
        if (findBodies(area, { collidesWith: opts.collidesWith, sensors: false, ignore: opts.ignore }).length > 0) return false;
        if (!opts.tiles) return true;
        const box = 'radius' in area
            ? { left: area.x - area.radius, top: area.y - area.radius, right: area.x + area.radius, bottom: area.y + area.radius }
            : { left: area.x, top: area.y, right: area.x + area.width, bottom: area.y + area.height };
        let free = true;
        eachCell(gridsOf(options.tilemaps(), () => {}), box.left + EPS, box.top + EPS, box.right - EPS, box.bottom - EPS, (grid, column, row, cellLeft, cellTop) => {
            if (!free || !cellOf(grid.map, column, row).solid) return;
            const cell = { x: cellLeft + grid.w / 2, y: cellTop + grid.h / 2, hw: grid.w / 2, hh: grid.h / 2, round: false };
            if ('radius' in area ? inArea({ ...cell }, area) : true) free = false;
        });
        return free;
    };

    const drawDebug = (draw: TDebugDraw): void => {
        let edged = false;
        for (const entry of entries) {
            if (gone(entry)) continue;
            const now = measure(entry);
            if (now === null) continue;
            const record = entry.record;
            const color = !record.enabled ? DEBUG_COLORS.off
                : record.sensor ? DEBUG_COLORS.sensor
                    : isMoving(entry) ? DEBUG_COLORS.moving
                        : isPushing(entry) ? DEBUG_COLORS.driven : DEBUG_COLORS.still;
            if (now.round) draw.circle(now.x, now.y, now.hw, color);
            else draw.rect(now.x, now.y, now.hw * 2, now.hh * 2, color);
            // Where it is going: a tenth of a second of its speed.
            const v = entry.velocity;
            if (record.enabled && (v.x !== 0 || v.y !== 0)) draw.line(now.x, now.y, now.x + v.x * 0.1, now.y + v.y * 0.1, color);
            if (record.bounds !== 'pass') edged = true;
        }
        if (edged) {
            const box = edges();
            draw.rect(box.x + box.width / 2, box.y + box.height / 2, box.width, box.height, DEBUG_COLORS.bounds);
        }
        for (const ray of rays) {
            draw.line(ray.from.x, ray.from.y, ray.to.x, ray.to.y, DEBUG_COLORS.ray);
            if (ray.hit) draw.circle(ray.to.x, ray.to.y, 2, DEBUG_COLORS.ray);
        }
        rays.length = 0;
    };

    return {
        addBody,
        addCharacter,
        castRay,
        drawDebug,
        findBodies,
        isFree,
        frame: (dt: number) => {
            if (closed) return;
            length = options.stepLength();
            // Its own time: slower, faster, or stopped.
            accumulator += dt * Math.max(0, world.timeScale);
            const steps = Math.min(Math.floor(accumulator / length), options.maxSteps);
            // What each body touched as the game last saw it, once every frame: a game reads
            // `wasTouching` a frame at a time, however many steps fit in one, none included.
            for (const entry of entries) Object.assign(entry.wasTouching, entry.touchingSides);
            for (let i = 0; i < steps && !closed; i++) step();
            accumulator -= steps * length;
            // Time it could not catch up with is let go, rather than piling up into a burst later.
            if (steps === options.maxSteps && accumulator > length) accumulator = length;
            // A body destroyed in a frame no step ran in (a world in slow motion) is told all the same.
            if (!closed) tellLost();
            // Counted once the steps are over, whether or not one ran: a push asked for in this
            // frame's updates is this frame's, and over by the next one's.
            frame++;
        },
        close: () => {
            closed = true;
            lost = [];
            for (const entry of [...entries]) remove(entry);
            grid.clear();
        },
    };
};
