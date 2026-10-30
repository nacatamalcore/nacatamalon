import { tileInfoAt, tilemapPlacement } from '../../gameobjects/tilemap/tile_queries';
import { worldPose2d, writeWorldPose2d } from '../rapier2d/world_pose';
import { readCharacterTiles, tilesUnder } from './character_tiles';
import type { TBlock } from './still_colliders';
import type { TGameObject } from '../../hooks/spawn/use_spawn';
import type { TTilemap } from '../../gameobjects/tilemap/types/t_tilemap';
import type { TTileDoc } from '../../loaders/tilemap/types/t_tilemap_doc';
import type { TCharacterBody2d, TCharacterShape2d } from './t_character_body_2d';

const DEFAULT_GRAVITY = 900;
const DEFAULT_MAX_FALL = 420;
/**
 * How far below its feet a character walking down a slope, or standing, still finds the ground, in
 * pixels beyond what it moved.
 */
const SNAP = 4;
/**
 * A hair, in pixels: how close counts as touching, and how far inside its edges a character looks.
 */
const EPS = 0.01;
const INSET = 0.5;

/**
 * One map as the body reads it: where its cells are in the world, and how big.
 */
type TGrid = { map: TTilemap; x: number; y: number; w: number; h: number };

type TCell = { solid: boolean; oneWay: boolean; slope: [number, number] | undefined };

/**
 * What a cell is, across every layer: a wall on any layer is a wall.
 */
const cellOf = (map: TTilemap, column: number, row: number): TCell => {
    const cell: TCell = { solid: false, oneWay: false, slope: undefined };
    for (let layer = 0; layer < map.layers.length; layer++) {
        const tile = tileInfoAt(map, layer, column, row);
        if (tile === undefined) continue;
        if (tile.solid === true) cell.solid = true;
        if (tile.oneWay === true) cell.oneWay = true;
        if (tile.slope !== undefined && cell.slope === undefined) cell.slope = tile.slope;
    }
    return cell;
};

/**
 * Calls `visit` for every cell of every map that a rectangle of the world overlaps, edges that only
 * meet left out.
 */
const eachCell = (
    grids: readonly TGrid[],
    left: number, top: number, right: number, bottom: number,
    visit: (grid: TGrid, column: number, row: number, cellLeft: number, cellTop: number) => void,
): void => {
    for (const grid of grids) {
        const c0 = Math.max(0, Math.floor((left - grid.x) / grid.w));
        const c1 = Math.min(grid.map.width - 1, Math.ceil((right - grid.x) / grid.w) - 1);
        const r0 = Math.max(0, Math.floor((top - grid.y) / grid.h));
        const r1 = Math.min(grid.map.height - 1, Math.ceil((bottom - grid.y) / grid.h) - 1);
        for (let row = r0; row <= r1; row++) {
            for (let column = c0; column <= c1; column++) {
                visit(grid, column, row, grid.x + column * grid.w, grid.y + row * grid.h);
            }
        }
    }
};

/**
 * Builds one character that walks on the maps, and on the still colliders laid out as objects: what
 * `useTileBody2d` asks for.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const createTileBody2d = (deps: {
    box: TGameObject;
    options: TCharacterShape2d;
    tilemaps: () => readonly TTilemap[];
    /** The rectangles of the world it stands on and is stopped by besides the maps' cells. */
    blocks?: () => readonly TBlock[];
}): { body: TCharacterBody2d; move: (dt: number) => void; remove: () => void } => {
    const { box, options } = deps;
    const pose = worldPose2d(box);
    const hw = Math.abs(options.width * pose.scaleX) / 2;
    const hh = Math.abs(options.height * pose.scaleY) / 2;
    const shift = { x: (options.offset?.[0] ?? 0) * pose.scaleX, y: (options.offset?.[1] ?? 0) * pose.scaleY };
    const gravity = options.gravity ?? DEFAULT_GRAVITY;
    const maxFall = options.maxFall ?? DEFAULT_MAX_FALL;

    const centre = { x: pose.x + shift.x, y: pose.y + shift.y };
    const velocity = { x: 0, y: 0 };
    const state = {
        climbing: false,
        onGround: false,
        onCeiling: false,
        onWall: null as 'left' | 'right' | null,
        onOneWay: false,
        onLadder: false,
        ground: undefined as TTileDoc | undefined,
        damage: 0,
    };
    // Whether its feet are on a slope, which lets its lower corners overlap the cells beside it.
    let onSlope = false;
    // The tops of the ledges it is dropping through, until its head is below them.
    const dropping: number[] = [];
    let removed = false;
    let warnedTurned = false;

    const gridsOf = (): TGrid[] => {
        const grids: TGrid[] = [];
        for (const map of deps.tilemaps()) {
            const place = tilemapPlacement(map);
            if (place.rotation !== 0) {
                if (!warnedTurned) {
                    warnedTurned = true;
                    console.warn(`[NacatamalOn] useTileBody2d: the map '${map.src}' is turned, so it is walked through: a map can be moved and scaled, not turned.`);
                }
                continue;
            }
            grids.push({ map, x: place.x, y: place.y, w: map.cell * Math.abs(place.scaleX), h: map.cell * Math.abs(place.scaleY) });
        }
        return grids;
    };

    const isDropping = (top: number): boolean => dropping.some((at) => Math.abs(at - top) < EPS * 10);

    /**
     * The highest floor between `up` above its feet and `down` below them, or `null`. A slope under
     * the middle of its feet is the floor if there is one, as the old games measured; otherwise the
     * top of a wall or a ledge under any part of its feet. `from` is where its feet were before the
     * move, which a ledge needs to have been above.
     */
    const floorAt = (grids: readonly TGrid[], blocks: readonly TBlock[], feet: number, from: number, up: number, down: number): { y: number; kind: 'solid' | 'oneWay' | 'slope' } | null => {
        let slope: number | null = null;
        eachCell(grids, centre.x, feet - up, centre.x + EPS, feet + down + EPS, (grid, column, row, cellLeft, cellTop) => {
            const cell = cellOf(grid.map, column, row);
            if (cell.solid || cell.slope === undefined) return;
            const along = Math.min(1, Math.max(0, (centre.x - cellLeft) / grid.w));
            const y = cellTop + grid.h * (1 - (cell.slope[0] + (cell.slope[1] - cell.slope[0]) * along));
            if (y >= feet - up - EPS && y <= feet + down + EPS && (slope === null || y < slope)) slope = y;
        });
        if (slope !== null) return { y: slope, kind: 'slope' };

        let best: { y: number; kind: 'solid' | 'oneWay' } | null = null;
        eachCell(grids, centre.x - hw + INSET, feet - up, centre.x + hw - INSET, feet + down + EPS, (grid, column, row, _left, cellTop) => {
            if (cellTop < feet - up - EPS || cellTop > feet + down + EPS) return;
            const cell = cellOf(grid.map, column, row);
            // The top of a wall is a floor only where nothing solid sits on it.
            const surface = row === 0 || !cellOf(grid.map, column, row - 1).solid;
            if (cell.solid && surface) {
                if (best === null || cellTop < best.y) best = { y: cellTop, kind: 'solid' };
            } else if (cell.oneWay && !cell.solid && !state.climbing && !isDropping(cellTop) && from <= cellTop + EPS * 10) {
                if (best === null || cellTop < best.y) best = { y: cellTop, kind: 'oneWay' };
            }
        });
        // The top of a still collider under its feet is a floor like the top of a wall.
        for (const block of blocks) {
            if (block.top < feet - up - EPS || block.top > feet + down + EPS) continue;
            if (block.right <= centre.x - hw + INSET || block.left >= centre.x + hw - INSET) continue;
            if (best === null || block.top < best.y) best = { y: block.top, kind: 'solid' };
        }
        return best;
    };

    const moveX = (grids: readonly TGrid[], blocks: readonly TBlock[], dx: number): void => {
        if (dx === 0) return;
        const from = centre.x;
        centre.x += dx;
        const feet = centre.y + hh;
        // On the ground, the floor is followed: up a slope, and down one.
        if (state.onGround) {
            const floor = floorAt(grids, blocks, feet, feet, Math.abs(dx) + INSET, Math.abs(dx) + SNAP);
            if (floor !== null) {
                centre.y = floor.y - hh;
                onSlope = floor.kind === 'slope';
            }
        }
        // Walls: solid cells beside it, above its feet. On a slope its lower corners may sink into the
        // cells around the slope by as much as the slope rises under half of it, as the picture does.
        //
        // Only what is ahead of where it was stops it. Landing past the corner of a step can leave it
        // up to `INSET` into the wall beside it, and walking away from that wall slowly enough to
        // still touch it would otherwise be stopped by it, which puts it out the wall's far side.
        const bottom = centre.y + hh - EPS;
        const low = onSlope ? bottom - hw - Math.abs(dx) - 1 : Infinity;
        let stop: number | null = null;
        eachCell(grids, centre.x - hw, centre.y - hh + EPS, centre.x + hw, bottom, (grid, column, row, cellLeft, cellTop) => {
            if (!cellOf(grid.map, column, row).solid || cellTop >= low) return;
            if (dx > 0 ? cellLeft + grid.w / 2 <= from : cellLeft + grid.w / 2 >= from) return;
            const edge = dx > 0 ? cellLeft - hw : cellLeft + grid.w + hw;
            if (stop === null || (dx > 0 ? edge < stop : edge > stop)) stop = edge;
        });
        for (const block of blocks) {
            if (block.bottom <= centre.y - hh + EPS || block.top >= bottom || block.top >= low) continue;
            if (block.right <= centre.x - hw || block.left >= centre.x + hw) continue;
            if (dx > 0 ? (block.left + block.right) / 2 <= from : (block.left + block.right) / 2 >= from) continue;
            const edge = dx > 0 ? block.left - hw : block.right + hw;
            if (stop === null || (dx > 0 ? edge < stop : edge > stop)) stop = edge;
        }
        if (stop !== null) {
            centre.x = stop;
            state.onWall = dx > 0 ? 'right' : 'left';
        }
    };

    const moveY = (grids: readonly TGrid[], blocks: readonly TBlock[], dy: number): void => {
        const feet = centre.y + hh;
        if (dy < 0) {
            state.onGround = false;
            onSlope = false;
            const head = centre.y - hh;
            let stop: number | null = null;
            eachCell(grids, centre.x - hw + INSET, head + dy, centre.x + hw - INSET, head, (grid, column, row, _left, cellTop) => {
                if (!cellOf(grid.map, column, row).solid) return;
                const under = cellTop + grid.h;
                if (under <= head + EPS && (stop === null || under > stop)) stop = under;
            });
            for (const block of blocks) {
                if (block.right <= centre.x - hw + INSET || block.left >= centre.x + hw - INSET) continue;
                if (block.bottom > head + EPS || block.bottom < head + dy) continue;
                if (stop === null || block.bottom > stop) stop = block.bottom;
            }
            if (stop !== null) {
                centre.y = stop + hh;
                state.onCeiling = true;
            } else {
                centre.y += dy;
            }
            return;
        }
        // Standing, the floor is looked for a little below too, which keeps it on a slope going down;
        // falling, only as far as it falls.
        const floor = state.onGround
            ? floorAt(grids, blocks, feet, feet, INSET, dy + SNAP)
            : floorAt(grids, blocks, feet + dy, feet, dy + INSET, 0);
        if (floor !== null) {
            centre.y = floor.y - hh;
            state.onGround = true;
            onSlope = floor.kind === 'slope';
            state.onOneWay = floor.kind === 'oneWay';
        } else {
            centre.y += dy;
            state.onGround = false;
            onSlope = false;
            state.onOneWay = false;
        }
    };

    const move = (dt: number): void => {
        if (removed || dt <= 0) return;
        const grids = gridsOf();
        const blocks = deps.blocks?.() ?? [];
        const maps = grids.map((grid) => grid.map);

        if (!state.climbing) {
            velocity.y = Math.min(velocity.y + gravity * dt, maxFall);
        }
        // A belt carries what stands on it; a current or the wind, what is in it.
        const push = state.onGround ? state.ground?.push : tilesUnder(maps, centre.x, centre.y, centre.x, centre.y).find((tile) => tile.push !== undefined)?.push;
        const dx = (velocity.x + (push?.x ?? 0)) * dt;
        const dy = (velocity.y + (push?.y ?? 0)) * dt;

        state.onWall = null;
        state.onCeiling = false;
        // In pieces no longer than half the smallest cell, so nothing is passed through between two.
        const smallest = blocks.reduce(
            (least, block) => Math.min(least, Math.max(2, block.right - block.left), Math.max(2, block.bottom - block.top)),
            grids.reduce((least, grid) => Math.min(least, grid.w, grid.h), Infinity),
        );
        const pieces = Number.isFinite(smallest) ? Math.max(1, Math.ceil(Math.max(Math.abs(dx), Math.abs(dy)) / (smallest / 2))) : 1;
        for (let i = 0; i < pieces; i++) {
            moveX(grids, blocks, dx / pieces);
            moveY(grids, blocks, dy / pieces);
        }

        if ((state.onGround && velocity.y > 0) || (state.onCeiling && velocity.y < 0)) {
            velocity.y = 0;
        }
        // Fallen through: a ledge it dropped through holds it again once it is wholly below it.
        const head = centre.y - hh;
        for (let i = dropping.length - 1; i >= 0; i--) {
            if (head > dropping[i]) dropping.splice(i, 1);
        }

        const tiles = readCharacterTiles(maps, centre, hw, hh, state.onGround);
        state.onLadder = tiles.onLadder;
        state.damage = tiles.damage;
        state.ground = tiles.ground;
        // Climbed out of the ladder, by its top or its side: no longer climbing.
        if (state.climbing && !tiles.inLadder) state.climbing = false;

        writeWorldPose2d(box, centre.x - shift.x, centre.y - shift.y, 0);
    };

    const body: TCharacterBody2d = {
        velocity,
        get climbing() { return state.climbing; },
        // Climbing passes through ledges (see `floorAt`), so from the top of a ladder it goes down.
        set climbing(value: boolean) { state.climbing = value; },
        get onGround() { return state.onGround; },
        get onCeiling() { return state.onCeiling; },
        get onWall() { return state.onWall; },
        get onOneWay() { return state.onOneWay; },
        get onLadder() { return state.onLadder; },
        get ground() { return state.ground; },
        get damage() { return state.damage; },
        dropThrough: () => {
            if (!state.onOneWay) return;
            dropping.push(centre.y + hh);
            state.onGround = false;
            state.onOneWay = false;
        },
        setPosition: (x, y) => {
            centre.x = x + shift.x;
            centre.y = y + shift.y;
            state.onGround = false;
            writeWorldPose2d(box, x, y, 0);
        },
        destroy: () => { removed = true; },
    };

    return { body, move, remove: () => { removed = true; } };
};
