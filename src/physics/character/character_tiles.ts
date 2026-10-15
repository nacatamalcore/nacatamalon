import { cellAt, tileInfoAt } from '../../gameobjects/tilemap/tile_queries';
import type { TTilemap } from '../../gameobjects/tilemap/types/t_tilemap';
import type { TTileDoc } from '../../loaders/tilemap/types/t_tilemap_doc';

/**
 * The tiles of every map under a rectangle of the world, in every layer.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const tilesUnder = (maps: readonly TTilemap[], left: number, top: number, right: number, bottom: number): TTileDoc[] => {
    const found: TTileDoc[] = [];
    for (const map of maps) {
        const from = cellAt(map, left, top);
        const to = cellAt(map, right, bottom);
        for (let row = Math.min(from.row, to.row); row <= Math.max(from.row, to.row); row++) {
            for (let column = Math.min(from.column, to.column); column <= Math.max(from.column, to.column); column++) {
                for (let layer = 0; layer < map.layers.length; layer++) {
                    const tile = tileInfoAt(map, layer, column, row);
                    if (tile !== undefined) found.push(tile);
                }
            }
        }
    }
    return found;
};

/**
 * What the tiles around a character say, once it has moved: a ladder in front of it, harm, and the
 * tile under its feet. The same reading for a character in the simulation and one on the map alone.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const readCharacterTiles = (
    maps: readonly TTilemap[],
    centre: { x: number; y: number },
    halfWidth: number,
    halfHeight: number,
    onGround: boolean,
): { onLadder: boolean; damage: number; ground: TTileDoc | undefined } => {
    // A hair inside its edges, so a wall it is merely touching is not a tile it is in.
    const inset = 0.5;
    const feet = centre.y + halfHeight;
    const touching = tilesUnder(maps, centre.x - halfWidth + inset, centre.y - halfHeight + inset, centre.x + halfWidth - inset, feet - inset);
    // Harm counts from what it stands on too: spikes are walked on, not walked into.
    const underfoot = tilesUnder(maps, centre.x - halfWidth + inset, feet + 1, centre.x + halfWidth - inset, feet + 1);
    const damage = [...touching, ...underfoot].reduce((most, tile) => Math.max(most, tile.damage ?? 0), 0);
    // In front of a ladder, or standing on its top: from there, down climbs onto it.
    const onLadder = touching.some((tile) => tile.ladder === true)
        || tilesUnder(maps, centre.x, feet + 1, centre.x, feet + 1).some((tile) => tile.ladder === true);
    if (!onGround) {
        return { onLadder, damage, ground: undefined };
    }
    // Under the middle of its feet first, and failing that under either edge: a character half over a
    // gap still stands on the tile it is standing on.
    const probe = (x: number): TTileDoc | undefined => tilesUnder(maps, x, feet + 1, x, feet + 1)
        .find((tile) => tile.solid === true || tile.oneWay === true || tile.slope !== undefined)
        // Walking on a slope, the feet are inside the slope's own cell.
        ?? tilesUnder(maps, x, feet - 1, x, feet - 1).find((tile) => tile.slope !== undefined);
    const ground = probe(centre.x) ?? probe(centre.x - halfWidth + inset) ?? probe(centre.x + halfWidth - inset);
    return { onLadder, damage, ground };
};
