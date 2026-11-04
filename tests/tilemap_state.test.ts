import { afterEach, describe, expect, it } from 'bun:test';
import { createScene } from '../src/scene/create_scene';
import { createTilemap } from '../src/gameobjects/tilemap/create_tilemap';
import { fillFrameContext } from '../src/game/loop/fill_frame_context';
import { layerStateOf, openLayerState } from '../src/gameobjects/tilemap/layer_state';
import { runHookUpdates } from '../src/game/loop/runHookUpdates';
import { stopScene } from '../src/scene/stop_scene';
import { destroy } from '../src/destroy';
import { useSelf } from '../src/hooks';
import { useSpawn } from '../src/hooks/spawn/use_spawn';
import { whenLoaded } from '../src/loaders';
import { createFrameContext } from '../src/game/loop/create_frame_context';
import { createTestGame, startTestScene } from './helpers/test_game';
import { serveTilemap, TEST_MAP } from './helpers/test_tilemap';
import type { TTilemap, TTilemapLayer } from '../src/gameobjects/tilemap';

/**
 * A map layer is a record, and a record is plain data.
 *
 * It was the one drawable in this engine that was not. It held its corners (handles to memory on a
 * graphics device) inside itself, along with a note the loop left itself between two frames. An
 * emitter had already been through this and came out the other way: its pool lives in a side table
 * keyed by the record, and the record stays writable to a file.
 *
 * That is not tidiness. A scene document has to be able to write down every drawable, and a field
 * holding a device handle is a field that cannot be written, cannot be read back, and cannot be
 * compared. This pins the layer on the right side of that line.
 */

let served: ReturnType<typeof serveTilemap> | null = null;

afterEach(() => {
    served?.restore();
    served = null;
});

const withMap = async () => {
    served = serveTilemap(TEST_MAP);
    const { store, renderer } = createTestGame();
    let map!: TTilemap;
    const scene = startTestScene(store, 'Level', () => {
        map = createTilemap({ src: '/maps/level.tilemap' });
        return createScene();
    });
    await whenLoaded(map);
    // The frame that finds it ready is the one that builds its corners.
    runHookUpdates(scene, 1 / 60);
    return { store, renderer, map, scene };
};

describe('a map asked for by two objects', () => {
    it('moves its clocks once a frame, and goes on when the one moving them leaves', async () => {
        served = serveTilemap(TEST_MAP);
        const { store } = createTestGame();
        let map!: TTilemap;
        let first!: Parameters<typeof destroy>[0];
        const scene = startTestScene(store, 'Level', () => {
            useSpawn(() => {
                first = useSelf();
                map = createTilemap({ src: '/maps/level.tilemap' });
            })();
            useSpawn(() => {
                createTilemap({ src: '/maps/level.tilemap' });
            })();
            return createScene();
        });
        await whenLoaded(map);

        // A quarter of a second at four pictures a second: one on, of the torch's two.
        runHookUpdates(scene, 0.25);
        expect(map.clocks.get('torch')?.frame).toBe(1);

        destroy(first, { immediate: true });
        runHookUpdates(scene, 0.25);
        expect(map.clocks.get('torch')?.frame).toBe(0);
    });
});

describe('a map asked for by two scenes', () => {
    it('goes on moving while the scene moving its clocks is paused, and only once when it is back', async () => {
        served = serveTilemap(TEST_MAP);
        const { store } = createTestGame();
        let map!: TTilemap;
        const level = (): ReturnType<typeof createScene> => {
            map = createTilemap({ src: '/maps/level.tilemap' });
            return createScene();
        };
        const a = startTestScene(store, 'A', level);
        const b = startTestScene(store, 'B', level);
        await whenLoaded(map);
        const both = (): void => {
            runHookUpdates(a, 0.25);
            runHookUpdates(b, 0.25);
        };
        const frame = (): number | undefined => map.clocks.get('torch')?.frame;

        both();
        expect(frame()).toBe(1);
        both();
        expect(frame()).toBe(0);

        // A paused: no updates of its own, and the torch does not wait for it.
        runHookUpdates(b, 0.25);
        expect(frame()).toBe(1);
        runHookUpdates(b, 0.25);
        expect(frame()).toBe(0);

        // Back, and still one step a frame between the two.
        both();
        expect(frame()).toBe(1);
        both();
        expect(frame()).toBe(0);
    });
});

describe('a map that lands after what asked for it has gone', () => {
    it('puts nothing on the card, since nothing would let go of it', async () => {
        served = serveTilemap(TEST_MAP);
        const { store } = createTestGame();
        let map!: TTilemap;
        const scene = startTestScene(store, 'Level', () => {
            map = createTilemap({ src: '/maps/level.tilemap' });
            return createScene();
        });
        stopScene(store, scene);
        await whenLoaded(map);
        await Promise.resolve();

        expect(map.status).toBe('ready');
        expect(layerStateOf(map.layers[0]!)?.still.buffer ?? null).toBeNull();
    });
});

/**
 * Anything a backend made: they all carry a `resourceType`, and none of them is data.
 */
const holdsAResource = (value: unknown, depth = 0): boolean => {
    if (typeof value !== 'object' || value === null || depth > 3) {
        return false;
    }
    if (ArrayBuffer.isView(value)) {
        return true;
    }
    if ('resourceType' in (value as Record<string, unknown>)) {
        return true;
    }
    return Object.values(value as Record<string, unknown>).some((inner) => holdsAResource(inner, depth + 1));
};

describe('a map layer as a record', () => {
    it('keeps nothing of the graphics card in itself', async () => {
        const { map } = await withMap();
        const layer = map.layers[0];

        expect(layer).not.toHaveProperty('meshes');
        expect(layer).not.toHaveProperty('still');
        expect(layer).not.toHaveProperty('moving');
        expect(layer).not.toHaveProperty('dirty');

        // Every own field of the layer, minus the two records it points at by reference. Those are
        // assets and a document names them, exactly as it names a sprite's texture.
        const { map: _map, texture: _texture, ...own } = layer as TTilemapLayer & Record<string, unknown>;
        expect(holdsAResource(own)).toBe(false);

        // And the corners really did go somewhere: they are beside it.
        const state = layerStateOf(layer);
        expect(state).toBeDefined();
        expect(state!.meshes).toHaveLength(2);
        expect(state!.meshes[0].buffer).not.toBeNull();
    });

    it('hands the backend a stand-in, not itself', async () => {
        const { store, map } = await withMap();
        const ctx = createFrameContext();
        fillFrameContext(store, ctx);

        const drawn = ctx.passes[0].drawables ?? [];
        expect(drawn).toHaveLength(map.layers.length);
        for (let i = 0; i < map.layers.length; i++) {
            const stand = openLayerState(map.layers[i]).drawn;
            expect(drawn[i]).toBe(stand as never);
            // The stand-in is the same object every frame, so a level of ten layers allocates
            // nothing to draw itself.
            expect(stand.meshes).toBe(layerStateOf(map.layers[i])!.meshes);
        }

        // What it says about the layer is read fresh each frame, never copied once and left.
        map.layers[0].tint = { r: 0.5, g: 0.25, b: 0, a: 1 };
        fillFrameContext(store, ctx);
        expect(openLayerState(map.layers[0]).drawn.tint).toEqual({ r: 0.5, g: 0.25, b: 0, a: 1 });
    });

    it('lets go of the card when its scene stops, and is ready to build again', async () => {
        const { store, renderer, map } = await withMap();
        expect(renderer.buffers.some((buffer) => buffer.alive)).toBe(true);

        stopScene(store, 'Level');

        expect(renderer.buffers.every((buffer) => !buffer.alive)).toBe(true);
        for (const layer of map.layers) {
            const state = openLayerState(layer);
            expect(state.meshes.every((mesh) => mesh.buffer === null)).toBe(true);
            // Ready again and not finished for good: the map stays in the cache, so another scene
            // asking for the same level only has to put its corners back up.
            expect(state.dirty).toBe(true);
        }
    });
});
