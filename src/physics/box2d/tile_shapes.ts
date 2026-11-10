import { tileInfoAt } from '../../gameobjects/tilemap/tile_queries';
import type { TTilemap } from '../../gameobjects/tilemap/types/t_tilemap';
import type { TTileDoc } from '../../loaders/tilemap/types/t_tilemap_doc';

/**
 * A rectangle of the map, in its own pixels before any scale: its top-left corner and its size.
 *
 * @internal
 */
export type TTileRect = { x: number; y: number; width: number; height: number };

/**
 * What a map is made of for a simulation, in its own pixels: the walls, the ledges, and the slopes.
 *
 * @internal
 */
export type TTileShapes = {
    /**
     * The solid cells, joined into as few rectangles as a simple sweep finds. Joined so a body sliding
     * along a floor meets one surface and not a seam every cell, which is where it would catch.
     */
    solids: TTileRect[];
    /**
     * The ledges stood on from above, one rectangle per run along a row.
     */
    oneWays: TTileRect[];
    /**
     * One convex outline per slope cell, its points clockwise on the screen.
     */
    slopes: Array<Array<[number, number]>>;
};

/**
 * What a cell is, across every layer: a wall painted on any layer is a wall.
 */
const cellKind = (map: TTilemap, column: number, row: number): { kind: 'solid' | 'oneWay' | 'slope' | null; tile?: TTileDoc } => {
    let found: { kind: 'oneWay' | 'slope'; tile: TTileDoc } | null = null;
    for (let layer = 0; layer < map.layers.length; layer++) {
        const tile = tileInfoAt(map, layer, column, row);
        if (tile === undefined) {
            continue;
        }
        // Solid wins over everything: nothing passes through it, from any side.
        if (tile.solid === true) {
            return { kind: 'solid', tile };
        }
        if (found === null && tile.slope !== undefined) {
            found = { kind: 'slope', tile };
        } else if (found === null && tile.oneWay === true) {
            found = { kind: 'oneWay', tile };
        }
    }
    return found ?? { kind: null };
};

/**
 * Turns a map's cells into the shapes a simulation collides with.
 *
 * The solid cells are cut a row at a time into their longest runs, and a run is joined to the one above
 * it when both span the very same columns, so a wall ten cells tall is one rectangle and a floor is one
 * rectangle, whatever stands on it. It is not the fewest rectangles possible, and does not need to be:
 * it is the seams along a surface that catch a body, and runs along rows leave none on a floor.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const tileShapes = (map: TTilemap): TTileShapes => {
    const { width, height, cell } = map;
    const kinds: Array<'solid' | 'oneWay' | 'slope' | null> = [];
    const slopes: Array<Array<[number, number]>> = [];
    for (let row = 0; row < height; row++) {
        for (let column = 0; column < width; column++) {
            const { kind, tile } = cellKind(map, column, row);
            kinds.push(kind);
            if (kind === 'slope' && tile?.slope !== undefined) {
                const outline = slopeOutline(column * cell, row * cell, cell, tile.slope);
                if (outline !== null) slopes.push(outline);
            }
        }
    }

    // Each row cut into its longest runs first, so a floor is always whole whatever stands on it;
    // then a run is joined to the one above it only when the two span exactly the same columns.
    const solids: TTileRect[] = [];
    let open = new Map<string, TTileRect>();
    for (let row = 0; row < height; row++) {
        const next = new Map<string, TTileRect>();
        let column = 0;
        while (column < width) {
            if (kinds[row * width + column] !== 'solid') {
                column++;
                continue;
            }
            let end = column;
            while (end + 1 < width && kinds[row * width + end + 1] === 'solid') end++;
            const span = `${column}:${end}`;
            const above = open.get(span);
            if (above !== undefined) {
                above.height += cell;
                next.set(span, above);
            } else {
                const rect = { x: column * cell, y: row * cell, width: (end - column + 1) * cell, height: cell };
                solids.push(rect);
                next.set(span, rect);
            }
            column = end + 1;
        }
        open = next;
    }

    const oneWays: TTileRect[] = [];
    for (let row = 0; row < height; row++) {
        let column = 0;
        while (column < width) {
            if (kinds[row * width + column] !== 'oneWay') {
                column++;
                continue;
            }
            let end = column;
            while (end + 1 < width && kinds[row * width + end + 1] === 'oneWay') end++;
            oneWays.push({ x: column * cell, y: row * cell, width: (end - column + 1) * cell, height: cell });
            column = end + 1;
        }
    }

    return { solids, oneWays, slopes };
};

/**
 * The outline of a slope cell: the bottom edge, and the floor running from its height at the left to
 * its height at the right. A corner of height nothing is left out, so a 45° slope is a triangle.
 * `null` when the floor is flat at the bottom, which has no area.
 */
const slopeOutline = (x: number, y: number, cell: number, [left, right]: [number, number]): Array<[number, number]> | null => {
    if (left <= 0 && right <= 0) {
        return null;
    }
    const bottom = y + cell;
    const points: Array<[number, number]> = [[x, bottom]];
    if (left > 0) points.push([x, bottom - left * cell]);
    if (right > 0) points.push([x + cell, bottom - right * cell]);
    points.push([x + cell, bottom]);
    return points;
};
