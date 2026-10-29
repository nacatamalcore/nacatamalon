import { afterEach, describe, expect, it, mock, spyOn } from 'bun:test';
import { createScene } from '../src/scene/create_scene';
import { createModel } from '../src/gameobjects/model';
import { createMesh } from '../src/gameobjects/mesh/create_mesh';
import { createMaterial } from '../src/gameobjects/material/create_material';
import { useCubeGeometry } from '../src/hooks/geometry/use_cube_geometry';
import { destroy, flushDestroyed } from '../src/destroy';
import { fillFrameContext } from '../src/game/loop/fill_frame_context';
import { getColor } from '../src/color';
import { mangaDots, toonLighting } from '../src/shader_composer/surface/looks';
import { useLoadGltf } from '../src/hooks/loaders/use_load_gltf';
import { useSpawn } from '../src/hooks/spawn/use_spawn';
import { whenLoaded } from '../src/loaders';
import { createTestGame, startTestScene } from './helpers/test_game';
import { asGltf, serveGltf, TEST_QUAD } from './helpers/test_gltf';
import type { TFrameContext } from '../src/render';
import type { TGltfModel } from '../src/loaders';
import type { TModel } from '../src/gameobjects/model';
import type { TMeshMaterial } from '../src/materials';
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

    it('hides the whole model, pieces that arrive later included', async () => {
        const fake = served();
        const { store } = createTestGame();
        let placed: TModel | null = null;
        let source: TGltfModel | null = null;
        startTestScene(store, 'Level', () => {
            source = useLoadGltf({ src: 'model.gltf' });
            placed = createModel({ model: source });
            return createScene();
        });

        expect(placed!.visible).toBe(true);
        placed!.visible = false;
        await whenLoaded(source as unknown as TGltfModel);

        expect(placed!.parts).toHaveLength(2);
        expect(placed!.parts.every((part) => part.visible === false)).toBe(true);
        expect(kinds(store)).toEqual([]);

        placed!.visible = true;
        expect(kinds(store)).toEqual(['mesh', 'mesh']);
        placed!.visible = false;
        expect(kinds(store)).toEqual([]);
        fake.restore();
    });

    it('starts hidden when asked to', async () => {
        const fake = served();
        const { store } = createTestGame();
        let placed: TModel | null = null;
        let source: TGltfModel | null = null;
        startTestScene(store, 'Level', () => {
            source = useLoadGltf({ src: 'model.gltf' });
            placed = createModel({ model: source, visible: false });
            return createScene();
        });
        await whenLoaded(source as unknown as TGltfModel);

        expect(placed!.visible).toBe(false);
        expect(kinds(store)).toEqual([]);
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

    it('puts the same looks on every piece, each over its own colour', async () => {
        const fake = served();
        const { store } = createTestGame();
        let placed: TModel | null = null;
        let source: TGltfModel | null = null;
        startTestScene(store, 'Level', () => {
            source = useLoadGltf({ src: 'model.gltf' });
            placed = createModel({ model: source, lighting: toonLighting(), steps: [mangaDots()] });
            return createScene();
        });
        await whenLoaded(source as unknown as TGltfModel);

        for (const part of placed!.parts) {
            expect(part.material.fragment).toContain('ctx.screen');
            expect(part.material.lighting).toEqual(toonLighting());
            expect(part.material.uniforms).toMatchObject({ toonShadow: 0.45 });
        }
        // Still the file's own colours underneath.
        expect(placed!.parts[1].material.tint.b).toBeCloseTo(1, 3);
        // Each piece turns its own knobs.
        expect(placed!.parts[0].material.uniforms).not.toBe(placed!.parts[1].material.uniforms);
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

describe('a placed model, used like any other drawing', () => {
    /** A scene with one placed model of the two-piece file, and what it takes to wait for it. */
    const placedModel = (options: Partial<Parameters<typeof createModel>[0]> = {}) => {
        const fake = served();
        const { store } = createTestGame();
        let placed!: TModel;
        let source!: TGltfModel;
        startTestScene(store, 'Level', () => {
            source = useLoadGltf({ src: 'model.gltf' });
            placed = createModel({ model: source, ...options });
            return createScene();
        });
        return { store, placed: () => placed, arrived: () => whenLoaded(source), restore: () => fake.restore() };
    };
    const tints = (model: TModel) => model.parts.map((part) => {
        const { r, g, b } = part.material.tint;
        return [r, g, b];
    });

    it('is tinted all at once, each piece keeping its own colour under it', async () => {
        const { placed, arrived, restore } = placedModel();
        await arrived();
        // The file's orange body and blue glass, as they arrived.
        const own = tints(placed());

        placed().tint = getColor('#ff0000');
        expect(tints(placed())).toEqual(own.map(([r]) => [r, 0, 0]));
        // Again, from the file's colours and not from the last shade.
        placed().tint = getColor('white');
        expect(tints(placed())).toEqual(own);
        expect(placed().tint).toEqual({ r: 1, g: 1, b: 1, a: 1 });
        restore();
    });

    it('is tinted by changing its tint in place too, as a tween does', async () => {
        const { placed, arrived, restore } = placedModel();
        await arrived();
        const own = tints(placed());

        placed().tint.g = 0;
        placed().tint.b = 0;
        expect(tints(placed())).toEqual(own.map(([r]) => [r, 0, 0]));
        placed().tint.a = 0.25;
        expect(placed().parts.map((part) => part.material.tint.a)).toEqual([0.25, 0.25]);
        restore();
    });

    it('hands what is set before its file arrives to the pieces that arrive', async () => {
        const plain = placedModel();
        await plain.arrived();
        const own = tints(plain.placed());
        plain.restore();

        const { placed, arrived, restore } = placedModel();
        placed().tint = getColor('#00ff00');
        placed().alpha = 0.5;
        placed().zIndex = 3;
        placed().castShadow = false;
        await arrived();

        expect(tints(placed())).toEqual(own.map(([, g]) => [0, g, 0]));
        expect(placed().parts.map((part) => [part.material.alpha, part.zIndex, part.castShadow])).toEqual([[0.5, 3, false], [0.5, 3, false]]);
        restore();
    });

    it('takes castShadow when it is made', async () => {
        const { placed, arrived, restore } = placedModel({ castShadow: false });
        await arrived();
        expect(placed().castShadow).toBe(false);
        expect(placed().parts.every((part) => part.castShadow === false)).toBe(true);
        restore();
    });

    it('hands whether it is drawn off screen, and how far it reaches, to every piece', async () => {
        const { placed, arrived, restore } = placedModel({ boundsMargin: 0.5 });
        placed().alwaysDrawn = true;
        await arrived();
        expect(placed().parts.map((part) => [part.alwaysDrawn, part.boundsMargin])).toEqual([[true, 0.5], [true, 0.5]]);

        placed().boundsMargin = 2;
        expect(placed().parts.every((part) => part.boundsMargin === 2)).toBe(true);
        restore();
    });

    it('is destroyed whole, its pieces leaving at the end of the frame', async () => {
        const { store, placed, arrived, restore } = placedModel();
        await arrived();
        expect(kinds(store)).toEqual(['mesh', 'mesh']);

        destroy(placed());
        expect(placed().destroyed).toBe(true);
        expect(placed().parts.every((part) => part.destroyed)).toBe(true);
        flushDestroyed(store);
        expect(kinds(store)).toEqual([]);
        // Twice is once.
        destroy(placed());
        restore();
    });

    it('never comes when it is destroyed while its file is on the way', async () => {
        const { store, placed, arrived, restore } = placedModel();
        destroy(placed());
        await arrived();
        expect(placed().parts).toHaveLength(0);
        expect(kinds(store)).toEqual([]);
        restore();
    });
});

describe('a model given a material and colours of its own', () => {
    it('says once that the colours go in the material', () => {
        const warn = spyOn(console, 'warn').mockImplementation(() => {});
        const { store } = createTestGame();
        startTestScene(store, 'Level', () => {
            const material = createMaterial({ shader: 'mesh3d' }) as TMeshMaterial;
            createMesh({ geometry: useCubeGeometry(), material, tint: getColor('red') });
            createMesh({ geometry: useCubeGeometry(), material, tint: getColor('red') });
            return createScene();
        });
        const said = warn.mock.calls.map((call) => String(call[0])).filter((line) => line.includes('createMesh: given a material'));
        warn.mockRestore();
        expect(said).toHaveLength(1);
        expect(said[0]).toContain('tint');
    });
});
