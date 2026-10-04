import { afterEach, describe, expect, it, mock } from 'bun:test';
import { createScene } from '../src/scene/create_scene';
import { createModel } from '../src/gameobjects/model';
import { destroy, flushDestroyed } from '../src/destroy';
import { fillFrameContext } from '../src/game/loop/fill_frame_context';
import { getColor } from '../src/color';
import { useLoadGltf } from '../src/hooks/loaders/use_load_gltf';
import { useSpawn } from '../src/hooks/spawn/use_spawn';
import { whenLoaded } from '../src/loaders';
import { createTestGame, startTestScene } from './helpers/test_game';
import { asGltf, serveGltf, TEST_QUAD } from './helpers/test_gltf';
import type { TFrameContext } from '../src/render';
import type { TGltfModel } from '../src/loaders';
import type { TModel } from '../src/gameobjects/model';
import type { TRuntimeStore } from '../src/store';
import type { TTestModel } from './helpers/test_gltf';

/**
 * Putting a loaded model in a scene. The thing worth testing here is the timing: its pieces are
 * added after the scene body has run, because how many there are is not knowable until the file
 * arrives.
 */

const TWO_PIECES: TTestModel = {
    nodes: [
        { name: 'Body', primitives: [{ ...TEST_QUAD, material: 0 }] },
        { name: 'Glass', primitives: [{ ...TEST_QUAD, material: 1 }] },
    ],
    materials: [{ baseColorFactor: [1, 0.5, 0, 1] }, { baseColorFactor: [0, 0, 1, 1] }],
};

const served = (model: TTestModel = TWO_PIECES) => {
    const { json, bin } = asGltf(model);
    return serveGltf({ 'model.gltf': json, 'model.bin': bin });
};

/**
 * What the renderer would be handed, as the kind of each thing in order.
 */
const kinds = (store: TRuntimeStore): string[] => {
    const ctx: TFrameContext = { passes: [{}], time: 0, progress: 0, phase: 0 };
    fillFrameContext(store, ctx);
    return (ctx.passes[0].drawables ?? []).map((item) => item.type);
};

afterEach(() => { mock.restore(); });

describe('createModel', () => {
    it('refuses to be called outside a scene body', () => {
        expect(() => createModel({ model: null as never })).toThrow('[NacatamalOn] createModel');
    });

    it('draws nothing while the file is on the way, and everything once it is here', async () => {
        const fake = served();
        const { store } = createTestGame();
        let placed: TModel | null = null;
        let source: TGltfModel | null = null;
        startTestScene(store, 'Level', () => {
            source = useLoadGltf({ src: 'model.gltf' });
            placed = createModel({ model: source });
            return createScene();
        });

        expect(placed!.parts).toHaveLength(0);
        expect(kinds(store)).toEqual([]);

        await whenLoaded(source as unknown as TGltfModel);

        expect(placed!.parts).toHaveLength(2);
        expect(kinds(store)).toEqual(['mesh', 'mesh']);
        fake.restore();
    });

    it('builds straight away when the file was already here', async () => {
        const fake = served();
        const { store } = createTestGame();
        let source: TGltfModel | null = null;
        startTestScene(store, 'First', () => {
            source = useLoadGltf({ src: 'model.gltf' });
            return createScene();
        });
        await whenLoaded(source as unknown as TGltfModel);

        let placed: TModel | null = null;
        startTestScene(store, 'Second', () => {
            placed = createModel({ model: useLoadGltf({ src: 'model.gltf' }) });
            return createScene();
        });

        expect(placed!.parts).toHaveLength(2);
        fake.restore();
    });

    it('moves every piece with one placement, because they share it', async () => {
        const fake = served();
        const { store } = createTestGame();
        let placed: TModel | null = null;
        let source: TGltfModel | null = null;
        startTestScene(store, 'Level', () => {
            source = useLoadGltf({ src: 'model.gltf' });
            placed = createModel({ model: source, transform: { x: 4, y: 2 } });
            return createScene();
        });
        await whenLoaded(source as unknown as TGltfModel);

        placed!.transform.rotationY = 1.25;

        for (const part of placed!.parts) {
            expect(part.transform).toBe(placed!.transform);
            expect(part.transform.x).toBe(4);
            expect(part.transform.rotationY).toBe(1.25);
        }
        fake.restore();
    });

    it('multiplies the file colours rather than replacing them', async () => {
        const fake = served();
        const { store } = createTestGame();
        let placed: TModel | null = null;
        let source: TGltfModel | null = null;
        startTestScene(store, 'Level', () => {
            source = useLoadGltf({ src: 'model.gltf' });
            placed = createModel({ model: source, tint: getColor('#808080') });
            return createScene();
        });
        await whenLoaded(source as unknown as TGltfModel);

        // Half of the orange the file asked for, and half of the blue: each keeps its own colour.
        // The file's 0.5 is linear, and reaches the screen as 0.7354 before the halving.
        expect(placed!.parts[0].material.tint.r).toBeCloseTo(0.5019, 3);
        expect(placed!.parts[0].material.tint.g).toBeCloseTo(0.3691, 3);
        expect(placed!.parts[1].material.tint.b).toBeCloseTo(0.5019, 3);
        fake.restore();
    });

    it('leaves the colours alone when nothing is asked for', async () => {
        const fake = served();
        const { store } = createTestGame();
        let placed: TModel | null = null;
        let source: TGltfModel | null = null;
        startTestScene(store, 'Level', () => {
            source = useLoadGltf({ src: 'model.gltf' });
            placed = createModel({ model: source });
            return createScene();
        });
        await whenLoaded(source as unknown as TGltfModel);

        // The file's linear 0.5 as the screen shows it.
        expect(placed!.parts[0].material.tint).toEqual({ r: 1, g: expect.closeTo(0.7354, 4), b: 0, a: 1 });
        fake.restore();
    });

    it('adds nothing to something that was taken out of the scene while the file was in the air', async () => {
        const fake = served();
        const { store } = createTestGame();
        let source: TGltfModel | null = null;
        let placed: TModel | null = null;

        const root = startTestScene(store, 'Level', () => {
            const spawn = useSpawn(() => {
                source = useLoadGltf({ src: 'model.gltf' });
                placed = createModel({ model: source });
            });
            const made = spawn();
            destroy(made);
            return createScene();
        });
        flushDestroyed(store);
        await whenLoaded(source as unknown as TGltfModel);

        expect(placed!.parts).toHaveLength(0);
        expect(kinds(store)).toEqual([]);
        expect(root.children).toHaveLength(0);
        fake.restore();
    });

    it('goes away with whatever held it', async () => {
        const fake = served();
        const { store } = createTestGame();
        let source: TGltfModel | null = null;
        let made: ReturnType<ReturnType<typeof useSpawn>> | null = null;

        startTestScene(store, 'Level', () => {
            const spawn = useSpawn(() => {
                source = useLoadGltf({ src: 'model.gltf' });
                createModel({ model: source });
            });
            made = spawn();
            return createScene();
        });
        await whenLoaded(source as unknown as TGltfModel);
        expect(kinds(store)).toEqual(['mesh', 'mesh']);

        destroy(made!);
        flushDestroyed(store);

        expect(kinds(store)).toEqual([]);
        fake.restore();
    });
});
