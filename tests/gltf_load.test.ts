import { afterEach, describe, expect, it, mock } from 'bun:test';
import { createScene } from '../src/scene/create_scene';
import { useLoadGltf } from '../src/hooks/loaders/use_load_gltf';
import { whenLoaded } from '../src/loaders';
import { createTestGame, startTestScene } from './helpers/test_game';
import { asGlb, asGltf, serveGltf, TEST_QUAD } from './helpers/test_gltf';
import type { TGltfModel } from '../src/loaders';
import type { TTestModel } from './helpers/test_gltf';

/**
 * Reading a model file: both shapes it arrives in, the pieces it turns into, and where its corners
 * end up once the file's own tree has had its say.
 */

const ONE_PIECE: TTestModel = { nodes: [{ name: 'Body', primitives: [TEST_QUAD] }] };

/**
 * Loads a model and waits for it, the way a scene would across a couple of frames.
 */
const load = async (model: TTestModel | ArrayBuffer, options: Record<string, unknown> = {}, extra: Record<string, unknown> = {}) => {
    const files: Record<string, unknown> = { ...extra };
    let src = 'model.glb';
    if (model instanceof ArrayBuffer) {
        files[src] = model;
    } else {
        src = 'model.gltf';
        const { json, bin } = asGltf(model);
        files[src] = json;
        files['model.bin'] = bin;
    }

    const served = serveGltf(files);
    const { store } = createTestGame();
    let loaded: TGltfModel | null = null;
    startTestScene(store, 'Level', () => {
        loaded = useLoadGltf({ src, ...options });
        return createScene();
    });
    await whenLoaded(loaded as unknown as TGltfModel);
    return { model: loaded as unknown as TGltfModel, store, asked: served.asked, restore: served.restore };
};

afterEach(() => { mock.restore(); });

describe('useLoadGltf', () => {
    it('refuses to be called outside a scene body', () => {
        expect(() => useLoadGltf({ src: 'a.gltf' })).toThrow('[NacatamalOn] useLoadGltf');
    });

    it('comes back at once, still loading, with nothing to draw yet', () => {
        serveGltf({ 'model.gltf': asGltf(ONE_PIECE).json, 'model.bin': asGltf(ONE_PIECE).bin });
        const { store } = createTestGame();
        let model: TGltfModel | null = null;
        startTestScene(store, 'Level', () => {
            model = useLoadGltf({ src: 'model.gltf' });
            return createScene();
        });

        expect(model!.status).toBe('loading');
        expect(model!.parts).toHaveLength(0);
    });

    it('turns one piece of the file into one part, on the graphics card', async () => {
        const { model } = await load(ONE_PIECE);

        expect(model.status).toBe('ready');
        expect(model.parts).toHaveLength(1);
        expect(model.parts[0].name).toBe('Body');
        expect(model.parts[0].geometry.vertexCount).toBe(4);
        expect(model.parts[0].geometry.indexCount).toBe(6);
        expect(model.parts[0].geometry.vertexBuffer).not.toBeNull();
    });

    it('reads the same model out of one binary file as out of two', async () => {
        const text = await load(ONE_PIECE);
        const binary = await load(asGlb(ONE_PIECE));

        expect(binary.model.status).toBe('ready');
        expect(binary.model.parts).toHaveLength(1);
        expect(Array.from(binary.model.parts[0].geometry.positions!))
            .toEqual(Array.from(text.model.parts[0].geometry.positions!));
        // The binary one names no neighbour: everything it needs came in the one request.
        expect(binary.asked).toEqual(['model.glb']);
    });

    it('draws every piece of a model that has several, each with its own surface', async () => {
        const { model } = await load({
            nodes: [
                { name: 'Body', primitives: [{ ...TEST_QUAD, material: 0 }] },
                { name: 'Glass', primitives: [{ ...TEST_QUAD, material: 1 }] },
            ],
            materials: [
                { name: 'paint', baseColorFactor: [1, 0, 0, 1] },
                { name: 'window', baseColorFactor: [0, 0, 1, 0.5] },
            ],
        });

        expect(model.parts.map((part) => part.name)).toEqual(['Body', 'Glass']);
        expect(model.parts.map((part) => part.material)).toEqual(['paint', 'window']);
        expect(model.parts[0].tint).toEqual({ r: 1, g: 0, b: 0, a: 1 });
        expect(model.parts[1].tint).toEqual({ r: 0, g: 0, b: 1, a: 0.5 });
    });

    it('splits one mesh of several runs into one part each, which is what a shared surface cannot do', async () => {
        const { model } = await load({
            nodes: [{ name: 'Car', primitives: [{ ...TEST_QUAD, material: 0 }, { ...TEST_QUAD, material: 1 }] }],
            materials: [{ name: 'body', baseColorFactor: [1, 1, 0, 1] }, { name: 'glass', baseColorFactor: [0, 1, 1, 1] }],
        });

        expect(model.parts).toHaveLength(2);
        expect(model.parts[0].tint.r).toBe(1);
        expect(model.parts[1].tint.r).toBe(0);
        // Both came out of one piece of the file, so they share its name and the surface is the
        // only thing telling them apart. That is the ordinary case for a vehicle's glass.
        expect(model.parts.map((part) => part.name)).toEqual(['Car', 'Car']);
        expect(model.parts.map((part) => part.material)).toEqual(['body', 'glass']);
    });

    it('works the file tree into the corners, so one placement moves the whole model', async () => {
        const { model } = await load({
            nodes: [
                { name: 'Root', translation: [10, 0, 0], children: [1] },
                { name: 'Child', translation: [0, 5, 0], primitives: [TEST_QUAD] },
            ],
            roots: [0],
        });

        // The corner at the piece's own origin ends up at its parent's move plus its own.
        const positions = model.parts[0].geometry.positions!;
        expect(positions[0]).toBeCloseTo(10);
        expect(positions[1]).toBeCloseTo(5);
        expect(positions[2]).toBeCloseTo(0);
    });

    it('reads a placement given as a finished matrix', async () => {
        const { model } = await load({
            nodes: [{
                name: 'Moved',
                // Column by column, which is how the format writes one: a move of (3, 4, 5).
                matrix: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 3, 4, 5, 1],
                primitives: [TEST_QUAD],
            }],
        });

        const positions = model.parts[0].geometry.positions!;
        expect([positions[0], positions[1], positions[2]]).toEqual([3, 4, 5]);
    });

    it('takes one named piece and leaves the rest', async () => {
        const { model } = await load({
            nodes: [{ name: 'Body', primitives: [TEST_QUAD] }, { name: 'Turret', primitives: [TEST_QUAD] }],
        }, { node: 'Turret' });

        expect(model.parts).toHaveLength(1);
        expect(model.parts[0].name).toBe('Turret');
    });

    it('says what the file does hold when the named piece is not in it', async () => {
        const warn = spyOnWarn();
        const { model } = await load({ nodes: [{ name: 'Body', primitives: [TEST_QUAD] }] }, { node: 'Turret' });

        expect(model.status).toBe('error');
        expect(warn.messages.join(' ')).toContain('Body');
        warn.restore();
    });

    it('asks for the same file once however many scenes want it', async () => {
        const { json, bin } = asGltf(ONE_PIECE);
        const served = serveGltf({ 'model.gltf': json, 'model.bin': bin });
        const { store } = createTestGame();
        let first: TGltfModel | null = null;
        let second: TGltfModel | null = null;
        startTestScene(store, 'Level', () => {
            first = useLoadGltf({ src: 'model.gltf' });
            second = useLoadGltf({ src: 'model.gltf' });
            return createScene();
        });
        await whenLoaded(first as unknown as TGltfModel);

        expect(second).toBe(first);
        expect(served.asked.filter((url) => url === 'model.gltf')).toHaveLength(1);
        served.restore();
    });

    it('never throws when the file is not there: it says so and draws nothing', async () => {
        const warn = spyOnWarn();
        const served = serveGltf({});
        const { store } = createTestGame();
        let model: TGltfModel | null = null;
        startTestScene(store, 'Level', () => {
            model = useLoadGltf({ src: 'missing.gltf' });
            return createScene();
        });
        await whenLoaded(model as unknown as TGltfModel);

        expect(model!.status).toBe('error');
        expect(warn.messages.join(' ')).toContain('missing.gltf');
        warn.restore();
        served.restore();
    });
});

describe('pictures', () => {
    it('works a picture path out against the file that named it, and shares one upload between pieces', async () => {
        const { json, bin } = asGltf({
            nodes: [
                { name: 'A', primitives: [{ ...TEST_QUAD, material: 0 }] },
                { name: 'B', primitives: [{ ...TEST_QUAD, material: 1 }] },
            ],
            materials: [{ image: 'textures/atlas.png' }, { image: 'textures/atlas.png' }],
        });
        const served = serveGltf({
            'models/tower.gltf': json,
            'models/model.bin': bin,
            'models/textures/atlas.png': 'png',
        });
        const { store } = createTestGame();
        let model: TGltfModel | null = null;
        startTestScene(store, 'Level', () => {
            model = useLoadGltf({ src: 'models/tower.gltf' });
            return createScene();
        });
        await whenLoaded(model as unknown as TGltfModel);

        expect(model!.status).toBe('ready');
        expect(model!.parts[0].texture).toBe(model!.parts[1].texture!);
        expect(served.asked.filter((url) => url.endsWith('.png'))).toEqual(['/models/textures/atlas.png']);
        served.restore();
    });

    it('drops a glow that a picture was meant to mask, rather than lighting the whole model up', async () => {
        const lit = await load({
            nodes: [{ name: 'Sign', primitives: [{ ...TEST_QUAD, material: 0 }] }],
            materials: [{ emissiveFactor: [1, 1, 1] }],
        });
        expect(lit.model.parts[0].emissive).toEqual({ r: 1, g: 1, b: 1, a: 1 });

        const masked = await load({
            nodes: [{ name: 'Bottle', primitives: [{ ...TEST_QUAD, material: 0 }] }],
            materials: [{ emissiveFactor: [1, 1, 1], emissiveMask: true }],
        });
        expect(masked.model.parts[0].emissive).toEqual({ r: 0, g: 0, b: 0, a: 1 });
    });

    it('scales a glow by the strength the file asks for', async () => {
        const { model } = await load({
            nodes: [{ name: 'Lava', primitives: [{ ...TEST_QUAD, material: 0 }] }],
            materials: [{ emissiveFactor: [0.5, 0, 0], emissiveStrength: 4 }],
        });

        // 0.5 × 4 = 2 in linear light, which the screen curve turns into 1.3533.
        expect(model.parts[0].emissive.r).toBeCloseTo(1.3533, 4);
    });

    it('leaves every piece in its plain colour when asked for no pictures', async () => {
        const { model, asked } = await load(
            { nodes: [{ name: 'A', primitives: [{ ...TEST_QUAD, material: 0 }] }], materials: [{ image: 'atlas.png' }] },
            { textures: false },
        );

        expect(model.parts[0].texture).toBeNull();
        expect(asked.some((url) => url.endsWith('.png'))).toBe(false);
    });

    it('reads a picture kept inside a binary model, fetching nothing at all', async () => {
        const glb = asGlb({
            nodes: [{ name: 'A', primitives: [{ ...TEST_QUAD, material: 0 }] }],
            materials: [{ embeddedImage: 'png-bytes' }],
        });
        const { model, asked } = await load(glb);

        expect(model.status).toBe('ready');
        expect(model.parts[0].texture?.status).toBe('ready');
        // The whole model came in one request: no sheet beside it, no second round trip.
        expect(asked).toEqual(['model.glb']);
    });
});

/**
 * Catches the warnings a loader writes, so a test can read them instead of the console.
 */
const spyOnWarn = (): { messages: string[]; restore: () => void } => {
    const messages: string[] = [];
    const original = console.warn;
    console.warn = (...args: unknown[]) => { messages.push(args.map(String).join(' ')); };
    return { messages, restore: () => { console.warn = original; } };
};
