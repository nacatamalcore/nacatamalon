import { afterEach, describe, expect, it } from 'bun:test';
import { createScene } from '../src/scene/create_scene';
import { createTilemap } from '../src/gameobjects/tilemap/create_tilemap';
import { solidAt, tileInfoAtPoint } from '../src/gameobjects/tilemap/tile_queries';
import { runHookUpdates } from '../src/game/loop/runHookUpdates';
import { whenLoaded } from '../src/loaders';
import { parseTilemapDoc } from '../src/loaders/tilemap/parse_tilemap_doc';
import { serializeTilemapDoc } from '../src/loaders/tilemap/serialize_tilemap_doc';
import { createTestGame, startTestScene } from './helpers/test_game';
import { serveTilemap } from './helpers/test_tilemap';
import type { TTilemap } from '../src/gameobjects/tilemap';

/**
 * What a platformer's tiles say: ledges stood on from above, ladders, slopes, spikes, belts, and
 * whatever else the game wants written on a tile. Read, kept, written back, and refused when wrong.
 */

const SRC = '/maps/level.tilemap';

/**
 * Three by one: a ladder whose top is a ledge, a slope climbing to the right, and a spiked belt.
 */
const doc = (tiles: Record<number, unknown> = {}) => ({
    format: 1,
    kind: 'tilemap',
    atlas: 'tiles.atlas',
    cell: 8,
    width: 3,
    height: 1,
    tiles: {
        1: { frame: 0, ladder: true, oneWay: true },
        2: { frame: 1, slope: [0, 1] },
        3: { frame: 2, damage: 4, push: { x: -60, y: 0 }, props: { water: true, friction: 0.1, pickup: 'coin' } },
        ...tiles,
    },
    layers: [{ name: 'ground', order: 'under', data: [1, 2, 3] }],
});

let served: ReturnType<typeof serveTilemap> | null = null;
afterEach(() => {
    served?.restore();
    served = null;
});

describe('a platformer\'s tiles, read from the file', () => {
    it('keeps what each one says, and nothing for a tile that says none of it', () => {
        const map = parseTilemapDoc(doc({ 4: { frame: 3, solid: true } }), SRC);

        expect(map.tiles[1]).toMatchObject({ ladder: true, oneWay: true });
        expect(map.tiles[2].slope).toEqual([0, 1]);
        expect(map.tiles[3]).toMatchObject({ damage: 4, push: { x: -60, y: 0 }, props: { water: true, friction: 0.1, pickup: 'coin' } });
        expect(Object.keys(map.tiles[4]).sort()).toEqual(['blocksBullets', 'frame', 'solid']);
    });

    it('is written back as it was read, so a saved map keeps its ladders', () => {
        const once = parseTilemapDoc(doc(), SRC);
        const twice = parseTilemapDoc(JSON.parse(serializeTilemapDoc(once)), SRC);

        expect(twice.tiles).toEqual(once.tiles);
    });

    it('takes a push that only gives one direction as nothing in the other', () => {
        const map = parseTilemapDoc(doc({ 3: { frame: 2, push: { y: -30 } } }), SRC);

        expect(map.tiles[3].push).toEqual({ x: 0, y: -30 });
    });

    it('does not make a ledge or a slope solid', () => {
        const map = parseTilemapDoc(doc(), SRC);

        expect(map.tiles[1].solid).toBe(false);
        expect(map.tiles[2].solid).toBe(false);
    });
});

describe('a platformer\'s tiles, written wrong', () => {
    const refused = (tile: unknown, why: RegExp) => {
        expect(() => parseTilemapDoc(doc({ 5: { frame: 4, ...(tile as object) } }), SRC)).toThrow(why);
    };

    it('refuses a slope that is not two heights from 0 to 1', () => {
        refused({ slope: [0] }, /tile 5 .*two heights/);
        refused({ slope: [0, 1.5] }, /tile 5 has a slope of \[0, 1.5\]/);
        refused({ slope: [0, 'top'] }, /tile 5 has a slope height of 'top'/);
    });

    it('refuses a damage or a push that is not a number', () => {
        refused({ damage: 'lots' }, /tile 5 has a damage of 'lots'/);
        refused({ push: 60 }, /tile 5 has to give its push as \{ x, y \}/);
        refused({ push: { x: Infinity } }, /tile 5 has a push x of 'Infinity'/);
    });

    it('refuses props that are not words, numbers or true and false', () => {
        refused({ props: [1, 2] }, /tile 5 has props that are not an object/);
        refused({ props: { door: { to: 'boss' } } }, /tile 5 has a prop 'door'/);
    });
});

describe('the tile under a point', () => {
    const withMap = async () => {
        served = serveTilemap(doc());
        const { store } = createTestGame();
        let map!: TTilemap;
        const scene = startTestScene(store, 'Level', () => {
            map = createTilemap({ src: SRC, transform: { x: 100, y: 20 } });
            return createScene();
        });
        await whenLoaded(map);
        runHookUpdates(scene, 1 / 60);
        return map;
    };

    it('is what the file says about it, wherever the map is placed', async () => {
        const map = await withMap();

        expect(tileInfoAtPoint(map, 0, 103, 24)?.ladder).toBe(true);
        expect(tileInfoAtPoint(map, 0, 117, 21)?.damage).toBe(4);
    });

    it('is nothing off the map or in a layer that is not there', async () => {
        const map = await withMap();

        expect(tileInfoAtPoint(map, 0, 99, 24)).toBeUndefined();
        expect(tileInfoAtPoint(map, 0, 103, 30)).toBeUndefined();
        expect(tileInfoAtPoint(map, 3, 103, 24)).toBeUndefined();
    });

    it('leaves solidAt as it was: a ledge and a slope are not walls', async () => {
        const map = await withMap();

        expect([solidAt(map, 0, 0), solidAt(map, 1, 0), solidAt(map, 2, 0)]).toEqual([false, false, false]);
    });
});
