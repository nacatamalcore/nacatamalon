import { openLayerState } from '../src/gameobjects/tilemap/layer_state';
import { afterEach, describe, expect, it, spyOn } from 'bun:test';
import { createScene } from '../src/scene/create_scene';
import { stopScene } from '../src/scene/stop_scene';
import { createSprite } from '../src/gameobjects/sprite/create_sprite';
import { createTilemap } from '../src/gameobjects/tilemap/create_tilemap';
import { buildLayerMesh } from '../src/gameobjects/tilemap/build_layer_mesh';
import { blocksBulletsAt, cellAt, cellCorner, setTile, solidAt, solidAtPoint, tileAt, tileInfoAt } from '../src/gameobjects/tilemap/tile_queries';
import { fillFrameContext } from '../src/game/loop/fill_frame_context';
import { runHookUpdates } from '../src/game/loop/runHookUpdates';
import { whenLoaded } from '../src/loaders';
import { useLoadAtlas } from '../src/hooks/loaders';
import { TILE_LAYER_BANDS } from '../src/loaders/tilemap/types/t_tilemap_doc';
import { createTestGame, startTestScene } from './helpers/test_game';
import { serveTilemap, TEST_MAP } from './helpers/test_tilemap';
import type { TFrameContext } from '../src/render';
import type { TRuntimeStore } from '../src/store';
import type { TTilemap } from '../src/gameobjects/tilemap';

let served: ReturnType<typeof serveTilemap> | null = null;

afterEach(() => {
    served?.restore();
    served = null;
    (console.warn as { mockRestore?: () => void }).mockRestore?.();
});

/**
 * A scene with one map in it, already loaded, and one frame run so it has its corners.
 */
const withMap = async (map: unknown = TEST_MAP) => {
    served = serveTilemap(map);
    const { store, renderer } = createTestGame();
    let tilemap!: TTilemap;
    const scene = startTestScene(store, 'Level', () => {
        tilemap = createTilemap({ src: '/maps/level.tilemap' });
        return createScene();
    });
    await whenLoaded(tilemap);
    // The frame that finds it ready is the one that builds its corners.
    runHookUpdates(scene, 1 / 60);
    return { store, renderer, map: tilemap, scene };
};

/**
 * What the frame would hand the renderer.
 */
const drawn = (store: TRuntimeStore) => {
    const ctx: TFrameContext = { passes: [{}], time: 0, progress: 0, phase: 0 };
    fillFrameContext(store, ctx);
    return ctx.passes[0];
};

describe('createTilemap', () => {
    it('refuses to be called outside a scene body', () => {
        expect(() => createTilemap({ src: '/maps/level.tilemap' })).toThrow('[NacatamalOn] createTilemap');
    });

    it('comes back empty and fills itself in', async () => {
        served = serveTilemap();
        const { store } = createTestGame();
        let map!: TTilemap;
        startTestScene(store, 'Level', () => { map = createTilemap({ src: '/maps/level.tilemap' }); return createScene(); });

        expect(map.status).toBe('loading');
        expect(map.layers).toEqual([]);

        await whenLoaded(map);

        expect(map.status).toBe('ready');
        expect(map.cell).toBe(8);
        expect(map.layers.map((layer) => layer.name)).toEqual(['ground', 'canopy']);
    });

    it('shares one sheet with whatever else uses it', async () => {
        const { store } = await withMap();
        // The map, its sheet, and the sheet's image: three, and not the sheet twice.
        expect(served?.asked.filter((url) => url.endsWith('.atlas')).length).toBe(1);
        expect(store.get('assets').atlases.size).toBe(1);
    });

    it('waits for a sheet the scene asked for a moment earlier', async () => {
        served = serveTilemap();
        const { store } = createTestGame();
        let map!: TTilemap;
        const scene = startTestScene(store, 'Level', () => {
            // The order that matters: the scene starts the sheet loading, then the map finds it
            // in the cache half way there. Reading its status instead of waiting for it called a
            // sheet mid-flight a broken sheet, and the map drew nothing at all.
            useLoadAtlas({ src: '/maps/tiles.atlas' });
            map = createTilemap({ src: '/maps/level.tilemap' });
            return createScene();
        });
        await whenLoaded(map);
        runHookUpdates(scene, 1 / 60);

        expect(map.status).toBe('ready');
        expect(map.atlas?.status).toBe('ready');
        expect(store.get('assets').atlases.size).toBe(1);
        expect(drawn(store).drawables ?? []).toHaveLength(2);
    });

    it('draws one layer per layer, each sorted by where the file said', async () => {
        const { store } = await withMap();
        const pass = drawn(store);
        const layers = (pass.drawables ?? []).filter((item) => item.type === 'tilemap');

        expect(layers.length).toBe(2);
        expect(store.get('assets').tilemaps.get('/maps/level.tilemap')?.layers.map((layer) => layer.zIndex))
            .toEqual([TILE_LAYER_BANDS.under, TILE_LAYER_BANDS.over]);
    });

    it('puts its layers either side of the characters', async () => {
        served = serveTilemap();
        const { store } = createTestGame();
        let map!: TTilemap;
        const scene = startTestScene(store, 'Level', () => {
            map = createTilemap({ src: '/maps/level.tilemap' });
            // A sprite that never mentions an order at all, which is the point: the map is right
            // without either side having agreed on a number.
            createSprite({ width: 7, height: 7 });
            return createScene();
        });
        await whenLoaded(map);
        runHookUpdates(scene, 1 / 60);

        const kinds = (drawn(store).drawables ?? []).map((item) => item.type);
        expect(kinds).toEqual(['tilemap', 'sprite', 'tilemap']);
    });

    it('takes a partial transform, and what is left out is the default, not what the cache had', () => {
        served = serveTilemap();
        const { store } = createTestGame();
        let map!: TTilemap;
        startTestScene(store, 'Level', () => {
            createTilemap({ src: '/maps/level.tilemap', transform: { x: 5, scaleX: 2, rotation: 1 } });
            map = createTilemap({ src: '/maps/level.tilemap', transform: { y: 30 } });
            return createScene();
        });

        expect(map.transform).toEqual({ x: 0, y: 30, rotation: 0, scaleX: 1, scaleY: 1 });
    });

    it('moves every layer when the map moves, because they share one placement', async () => {
        const { map } = await withMap();
        map.transform.x = 40;

        expect(map.layers.every((layer) => layer.transform.x === 40)).toBe(true);
    });

    it('puts its corners on the graphics card once, and writes over them when a tile changes', async () => {
        const { renderer, map, scene } = await withMap();
        const made = renderer.buffers.length;
        expect(made).toBeGreaterThan(0);

        setTile(map, 0, 0, 0, 0);
        runHookUpdates(scene, 1 / 60);

        // Fewer cells now, so nothing new was asked for: the same memory holds less.
        expect(renderer.buffers.length).toBe(made);
        expect(renderer.buffers.some((buffer) => buffer.writes > 0)).toBe(true);
    });

    it('rebuilds once however many cells changed', async () => {
        const { renderer, map, scene } = await withMap();
        const writes = () => renderer.buffers.reduce((total, buffer) => total + buffer.writes, 0);

        const before = writes();
        setTile(map, 0, 0, 0, 0);
        runHookUpdates(scene, 1 / 60);
        const oneCell = writes() - before;

        const middle = writes();
        setTile(map, 0, 0, 0, 1);
        setTile(map, 0, 1, 0, 0);
        runHookUpdates(scene, 1 / 60);
        const twoCells = writes() - middle;

        // Two cells cost the same as one: what is batched is the rebuild, not the change.
        expect(twoCells).toBe(oneCell);
        expect(oneCell).toBeGreaterThan(0);
    });

    it('lets go of its corners when the scene goes, and can be used again after', async () => {
        const { store, renderer, map } = await withMap();
        expect(renderer.buffers.every((buffer) => buffer.alive)).toBe(true);

        stopScene(store, 'Level');

        expect(renderer.buffers.every((buffer) => !buffer.alive)).toBe(true);
        // The map is still in the cache, and knows it has to build its corners again.
        expect(map.status).toBe('ready');
        expect(map.layers.every((layer) => openLayerState(layer).dirty)).toBe(true);
    });

    it('draws nothing and warns when the file is not there', async () => {
        const warn = spyOn(console, 'warn').mockImplementation(() => {});
        warn.mockClear();
        served = serveTilemap();
        const { store } = createTestGame();
        let map!: TTilemap;
        const scene = startTestScene(store, 'Level', () => { map = createTilemap({ src: '/maps/missing.json' }); return createScene(); });
        await whenLoaded(map);
        runHookUpdates(scene, 1 / 60);

        expect(map.status).toBe('error');
        expect(warn).toHaveBeenCalledTimes(1);
        expect((drawn(store).drawables ?? []).length).toBe(0);
    });
});

describe('the cells of a map', () => {
    it('says which cell a point of the world falls in, inside the map and outside it', async () => {
        const { map } = await withMap();
        map.transform.x = 100;
        map.transform.y = 50;

        expect(cellAt(map, 100, 50)).toEqual({ column: 0, row: 0 });
        expect(cellAt(map, 115, 65)).toEqual({ column: 1, row: 1 });
        // Off the map is said as such, not clamped to the first column.
        expect(cellAt(map, 90, 50)).toEqual({ column: -2, row: 0 });
        expect(cellCorner(map, 1, 1)).toEqual({ x: 108, y: 58 });
    });

    it('reads an id, and reads zero off the map', async () => {
        const { map } = await withMap();

        expect(tileAt(map, 0, 0, 0)).toBe(1);
        expect(tileAt(map, 0, 1, 1)).toBe(3);
        expect(tileAt(map, 0, 9, 9)).toBe(0);
        expect(tileAt(map, 7, 0, 0)).toBe(0);
        expect(tileInfoAt(map, 0, 0, 0)?.solid).toBe(true);
    });

    it('writes an id, and says whether anything changed', async () => {
        const { map } = await withMap();

        expect(setTile(map, 0, 0, 0, 0)).toBe(true);
        expect(tileAt(map, 0, 0, 0)).toBe(0);
        // Writing what is already there changes nothing, and does not ask for a rebuild.
        openLayerState(map.layers[0]).dirty = false;
        expect(setTile(map, 0, 0, 0, 0)).toBe(false);
        expect(openLayerState(map.layers[0]).dirty).toBe(false);
        expect(setTile(map, 0, 9, 9, 1)).toBe(false);
    });

    it('refuses an id the map does not describe, with a warning', async () => {
        const { map } = await withMap();
        const warn = spyOn(console, 'warn').mockImplementation(() => {});
        warn.mockClear();

        expect(setTile(map, 0, 0, 0, 42)).toBe(false);
        expect(tileAt(map, 0, 0, 0)).toBe(1);
        expect(warn).toHaveBeenCalledTimes(1);
    });

    it('breaks a tile into what it becomes', async () => {
        const { map } = await withMap();
        const brick = tileInfoAt(map, 0, 1, 0);

        expect(brick?.becomes).toBe(0);
        setTile(map, 0, 1, 0, brick!.becomes!);

        expect(tileAt(map, 0, 1, 0)).toBe(0);
        // The wall next to it says nothing about becoming, which is not the same as becoming
        // nothing: it cannot be broken at all.
        expect(tileInfoAt(map, 0, 0, 0)?.becomes).toBeUndefined();
    });

    it('answers what is solid, in any layer, and by point too', async () => {
        const { map } = await withMap();

        expect(solidAt(map, 0, 0)).toBe(true);
        expect(solidAt(map, 0, 1)).toBe(false);
        expect(solidAtPoint(map, 4, 4)).toBe(true);
        expect(blocksBulletsAt(map, 0, 0)).toBe(true);

        // Painted on the layer above the characters, and it still stops them.
        setTile(map, 1, 0, 1, 1);
        expect(solidAt(map, 0, 1)).toBe(true);
    });
});

describe('the corners of a layer', () => {
    it('writes six per cell, with the piece of the sheet each one shows', async () => {
        const { map } = await withMap();
        const { still, moving } = buildLayerMesh(map, map.layers[0]);

        // Two still cells, one cycling, one empty.
        expect(still.length).toBe(2 * 6 * 4);
        expect(moving.length).toBe(1 * 6 * 4);

        // Half a texel of the sheet, which is how far inside its own square each cell reads.
        // Tiles sit against each other in the sheet with nothing between them, so a cell drawn at a
        // fractional position would otherwise ask for a point exactly on the boundary and come back
        // with the tile next door: a one-pixel seam along every edge.
        const inU = 0.5 / 32;
        const inV = 0.5 / 8;

        // The first corner of the first cell: the top-left of the map, showing frame 0 of a sheet
        // four frames across, read from just inside it.
        expect(Array.from(still.slice(0, 4))).toEqual([0, 0, inU, inV]);
        // Its opposite corner: one cell across and down, and a quarter of the way into the sheet,
        // stopping the same half texel short. The place on screen is untouched by any of this.
        expect(Array.from(still.slice(16, 20))).toEqual([8, 8, 0.25 - inU, 1 - inV]);
    });

    it('leaves a hole where a cell is empty rather than drawing anything', async () => {
        const { map } = await withMap();
        setTile(map, 0, 0, 0, 0);
        setTile(map, 0, 1, 0, 0);
        const { still } = buildLayerMesh(map, map.layers[0]);

        expect(still.length).toBe(0);
    });

    it('moves a cycling cell on by itself, and only rewrites the cycling corners', async () => {
        const { renderer, map, scene } = await withMap();
        const writesBefore = renderer.buffers.map((buffer) => buffer.writes);

        // The torch runs at four frames a second, so a quarter of a second is one step.
        runHookUpdates(scene, 0.26);

        const writesAfter = renderer.buffers.map((buffer) => buffer.writes);
        const changed = writesAfter.filter((writes, at) => writes !== writesBefore[at]).length;
        // One batch per layer: the cycling one. The still ones were left alone, which is the whole
        // reason they are apart.
        expect(changed).toBeGreaterThan(0);
        expect(map.clocks.get('torch')?.frame).toBe(1);
    });
});

describe('a map over a sheet that is not a plain grid', () => {
    it('reads each cell through the cut the sheet file gives, margin and all', async () => {
        const { map } = await withMap();
        // As a sheet with a margin cuts it: frame 0 is not at the corner of the image any more.
        // One window per frame, as the loader always gives them.
        map.atlas!.rects = [0.5, 0.625, 0.75, 0.875].map((x) => ({ uvOffset: { x, y: 0 }, uvScale: { x: 0.125, y: 1 } }));
        const { still } = buildLayerMesh(map, map.layers[0]);

        expect(still[2]).toBeCloseTo(0.5 + 0.5 / 32, 6);
    });

    it('draws a tile that names its frame, and nothing for a name the sheet does not have', async () => {
        const { map } = await withMap();
        map.atlas!.names = { brick: 2 };
        map.tiles[1] = { ...map.tiles[1], frame: 'brick' };
        const named = buildLayerMesh(map, map.layers[0]).still;

        // Frame 2 of a sheet four across starts half way along it.
        expect(named[2]).toBeCloseTo(0.5 + 0.5 / 32, 6);

        map.tiles[1] = { ...map.tiles[1], frame: 'missing' };
        expect(buildLayerMesh(map, map.layers[0]).still.length).toBeLessThan(named.length);
    });
});
