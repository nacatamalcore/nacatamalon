import { describe, expect, it } from 'bun:test';
import { parseTilemapDoc } from '../src/loaders/tilemap/parse_tilemap_doc';
import { resolveLayerOrder, TILE_LAYER_BANDS } from '../src/loaders/tilemap/types/t_tilemap_doc';

/**
 * A map that reads: two by two, one solid tile, one that breaks, one that cycles.
 */
const doc = () => ({
    format: 1,
    kind: 'tilemap',
    atlas: '../atlases/tiles.atlas',
    cell: 16,
    width: 2,
    height: 2,
    tiles: {
        1: { frame: 0, solid: true },
        2: { frame: 7, solid: true, becomes: 0 },
        3: { anim: 'torch' },
        4: { frame: 9, solid: true, blocksBullets: false },
    },
    layers: [{ name: 'ground', order: 'under', data: [1, 2, 0, 3] }],
});

describe('parseTilemapDoc', () => {
    it('reads a whole map', () => {
        const map = parseTilemapDoc(doc(), '/maps/level.tilemap');

        expect(map.cell).toBe(16);
        expect(map.width).toBe(2);
        expect(map.layers[0].data).toEqual([1, 2, 0, 3]);
        expect(map.tiles[1].solid).toBe(true);
        expect(map.tiles[2].becomes).toBe(0);
        expect(map.tiles[3].anim).toBe('torch');
    });

    it('reads a tile that names its frame on a packed sheet', () => {
        const named = { ...doc(), tiles: { ...doc().tiles, 1: { frame: 'brick' } } };

        expect(parseTilemapDoc(named, '/maps/level.tilemap').tiles[1].frame).toBe('brick');
    });

    it('lets a tile that only stops movement stop shots too, unless it says otherwise', () => {
        const map = parseTilemapDoc(doc(), '/maps/level.tilemap');

        // Solid and silent about shots: a wall stops both.
        expect(map.tiles[1].blocksBullets).toBe(true);
        // Water: solid to what walks, not to what flies. The exception that earns the field.
        expect(map.tiles[4].blocksBullets).toBe(false);
        // Not solid and silent: nothing stops.
        expect(map.tiles[3].blocksBullets).toBe(false);
    });

    it('turns a named order into the number everything sorts by', () => {
        const map = parseTilemapDoc({ ...doc(), layers: [
            { name: 'ground', order: 'under', data: [0, 0, 0, 0] },
            { name: 'canopy', order: 'over', data: [0, 0, 0, 0] },
            { name: 'between', order: 5, data: [0, 0, 0, 0] },
        ] }, '/maps/level.tilemap');

        expect(map.layers.map((layer) => resolveLayerOrder(layer.order))).toEqual([TILE_LAYER_BANDS.under, TILE_LAYER_BANDS.over, 5]);
    });

    it('says what is wrong, naming the file', () => {
        const fails = (map: unknown, because: string) => {
            expect(() => parseTilemapDoc(map, '/maps/level.tilemap')).toThrow(because);
        };

        fails(null, 'not an object');
        fails({ ...doc(), kind: 'atlas' }, "not 'tilemap'");
        fails({ ...doc(), format: 99 }, 'format 99');
        fails({ ...doc(), atlas: '' }, 'which atlas');
        fails({ ...doc(), cell: 0 }, 'its cell');
        fails({ ...doc(), layers: [] }, 'no layers');
        // Every message names the file, which is the whole point of failing here.
        expect(() => parseTilemapDoc(null, '/maps/level.tilemap')).toThrow('/maps/level.tilemap');
    });

    it('refuses a layer whose cells do not fill the grid', () => {
        expect(() => parseTilemapDoc({ ...doc(), layers: [{ name: 'ground', order: 'under', data: [1, 2] }] }, '/maps/level.tilemap'))
            .toThrow('has 2 cells and the grid is 2 by 2, which is 4');
    });

    it('refuses a cell pointing at a tile nobody described', () => {
        expect(() => parseTilemapDoc({ ...doc(), layers: [{ name: 'ground', order: 'under', data: [1, 2, 0, 9] }] }, '/maps/level.tilemap'))
            .toThrow('uses tile 9');
    });

    it('refuses a tile that says both a frame and an animation, or neither', () => {
        expect(() => parseTilemapDoc({ ...doc(), tiles: { 1: { frame: 0, anim: 'torch' } }, layers: [{ name: 'g', order: 0, data: [1, 1, 1, 1] }] }, '/m.tilemap'))
            .toThrow('says both');
        expect(() => parseTilemapDoc({ ...doc(), tiles: { 1: { solid: true } }, layers: [{ name: 'g', order: 0, data: [1, 1, 1, 1] }] }, '/m.tilemap'))
            .toThrow('says neither');
    });

    it('refuses zero as a tile id, because zero is always empty', () => {
        expect(() => parseTilemapDoc({ ...doc(), tiles: { 0: { frame: 1 } }, layers: [{ name: 'g', order: 0, data: [0, 0, 0, 0] }] }, '/m.tilemap'))
            .toThrow('0 is always empty');
    });
});
