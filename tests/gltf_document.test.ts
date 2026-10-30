import { afterEach, describe, expect, it, spyOn } from 'bun:test';
import { parseSceneDoc, sceneFromDoc, serializeScene, SCENE_FORMAT } from '../src/scene/document';
import { createScene } from '../src/scene/create_scene';
import { createModel } from '../src/gameobjects/model/create_model';
import { useLoadGltf } from '../src/hooks/loaders/use_load_gltf';
import { whenLoaded } from '../src/loaders';
import { createTestGame, startTestScene } from './helpers/test_game';
import { asGlb, asGltf, serveGltf, TEST_QUAD } from './helpers/test_gltf';
import type { TGltfModel } from '../src/loaders';
import type { TMesh } from '../src/gameobjects/mesh/types/t_mesh';
import type { TSceneDoc } from '../src/scene/document';

/**
 * A model file in a scene document.
 *
 * The shape of a mesh from a model file only exists once the file is here, and a scene is built before
 * that. These pin the rule that makes it work anyway, which is also the rule the old engine's documents
 * were written under: the manifest names the file and, with `node`, the piece; without `node`, the
 * first piece; the mesh is built at once and given its piece when the file lands.
 */

let served: { asked: string[]; restore: () => void } | null = null;
let warn: ReturnType<typeof spyOn> | null = null;
afterEach(() => {
    served?.restore();
    served = null;
    warn?.mockRestore();
    warn = null;
});

/**
 * A car: a red body first, then a grey wheel, each a piece of its own.
 */
const serveCar = (): void => {
    const { json, bin } = asGltf({
        nodes: [
            { name: 'Body', primitives: [{ ...TEST_QUAD, material: 0 }] },
            { name: 'Wheel', primitives: [{ ...TEST_QUAD, material: 1 }] },
        ],
        materials: [{ baseColorFactor: [1, 0, 0, 1] }, { baseColorFactor: [0.5, 0.5, 0.5, 1] }],
    });
    served = serveGltf({ '/models/car.gltf': json, '/models/model.bin': bin });
};

const mesh = (id: string, geometry: string, material: Record<string, unknown> = {}) =>
    ({ type: 'mesh', id, geometry, material });

const carScene = (geometries: Array<{ key: string; node?: string }>, meshes: unknown[]) => parseSceneDoc({
    format: SCENE_FORMAT,
    version: 1,
    name: 'Garage',
    assets: geometries.map(({ key, node }) => ({
        type: 'geometry', key, source: { kind: 'gltf', src: '/models/car.gltf', ...(node !== undefined ? { node } : {}) },
    })),
    root: { id: 'root', name: 'Garage', transform: null, components: meshes, children: [] },
}, '/scenes/garage.scene');

/**
 * Every mesh of the scene, by the identity the document gave it.
 */
const meshesOf = (store: ReturnType<typeof createTestGame>['store']): Map<string, TMesh> => {
    const root = store.get('world').scenes[0];
    return new Map(root.drawables.filter((d): d is TMesh => d.type === 'mesh').map((d) => [d.id, d]));
};

/**
 * Lets the file arrive: every fetch here answers at once, so a few turns of the queue are enough.
 */
const arrive = async (): Promise<void> => {
    for (let i = 0; i < 20; i++) await new Promise((resolve) => setTimeout(resolve, 0));
};

describe('a mesh whose shape comes from a model file', () => {
    it('is in the scene at once, with its identity, before the file has arrived', () => {
        serveCar();
        const { store } = createTestGame();
        startTestScene(store, 'Garage', sceneFromDoc(carScene([{ key: 'car' }], [mesh('body-mesh', 'car')])));

        const built = meshesOf(store).get('body-mesh');
        expect(built).toBeDefined();
        expect(built!.geometry?.status).toBe('loading');
        expect(built!.geometry?.vertexBuffer).toBeNull();
    });

    it('takes the first piece when the manifest names no node, the way the old engine did', async () => {
        serveCar();
        const { store } = createTestGame();
        startTestScene(store, 'Garage', sceneFromDoc(carScene([{ key: 'car' }], [mesh('body-mesh', 'car')])));
        await arrive();

        const built = meshesOf(store).get('body-mesh')!;
        expect(built.geometry?.status).toBe('ready');
        expect(built.geometry?.indexCount).toBe(6);
        // Red, which is the body's: the first piece.
        expect(built.material.tint).toMatchObject({ r: 1, g: 0, b: 0 });
    });

    it('takes the piece the manifest names', async () => {
        serveCar();
        const { store } = createTestGame();
        startTestScene(store, 'Garage', sceneFromDoc(carScene([{ key: 'wheel', node: 'Wheel' }], [mesh('wheel-mesh', 'wheel')])));
        await arrive();

        // The file's linear 0.5 grey as the screen shows it.
        const grey = expect.closeTo(0.7354, 4);
        expect(meshesOf(store).get('wheel-mesh')!.material.tint).toMatchObject({ r: grey, g: grey, b: grey });
    });

    it('looks the way the file says and keeps only a shader of its own from the document', async () => {
        serveCar();
        const { store } = createTestGame();
        const glow = 'fn effect(surface: vec4f, ctx: FragContext) -> vec4f { return surface; }';
        startTestScene(store, 'Garage', sceneFromDoc(carScene([{ key: 'car' }], [
            mesh('body-mesh', 'car', { tint: { r: 0, g: 0, b: 1, a: 1 }, fragment: glow }),
        ])));
        await arrive();

        const built = meshesOf(store).get('body-mesh')!;
        expect(built.material.tint).toMatchObject({ r: 1, g: 0, b: 0 });
        expect(built.material.fragment).toContain('fn effect');
    });

    it('shares one fetch between two meshes naming the same file', async () => {
        serveCar();
        const { store } = createTestGame();
        startTestScene(store, 'Garage', sceneFromDoc(carScene(
            [{ key: 'car' }, { key: 'wheel', node: 'Wheel' }],
            [mesh('body-mesh', 'car'), mesh('wheel-mesh', 'wheel')],
        )));
        await arrive();

        expect(served!.asked.filter((url) => url.endsWith('car.gltf'))).toHaveLength(1);
        expect([...meshesOf(store).values()].every((m) => m.geometry?.status === 'ready')).toBe(true);
    });

    it('says which pieces the file has when the one named is not there, and stays empty', async () => {
        serveCar();
        warn = spyOn(console, 'warn').mockImplementation(() => {});
        const { store } = createTestGame();
        startTestScene(store, 'Garage', sceneFromDoc(carScene([{ key: 'door', node: 'Door' }], [mesh('door-mesh', 'door')])));
        await arrive();

        expect(meshesOf(store).get('door-mesh')!.geometry?.status).toBe('loading');
        expect(String(warn.mock.calls.at(-1)?.[0])).toContain('"Body", "Wheel"');
    });
});

describe('a model file in a scene that is saved and opened again', () => {
    it('leaves the pictures to the file, so one kept inside it is not fetched by a name of its own', async () => {
        const glb = asGlb({
            nodes: [{ name: 'Bottle', primitives: [{ ...TEST_QUAD, material: 0 }] }],
            materials: [{ embeddedImage: 'png-bytes', emissiveFactor: [1, 1, 1], embeddedEmissiveImage: 'glow-bytes' }],
        });
        served = serveGltf({ 'bottle.glb': glb });
        const { store } = createTestGame();
        let model!: TGltfModel;
        startTestScene(store, 'Loading', () => {
            model = useLoadGltf({ src: 'bottle.glb' });
            return createScene();
        });
        await whenLoaded(model);
        const shelf = startTestScene(store, 'Shelf', () => {
            createModel({ model });
            return createScene();
        });

        const doc = JSON.parse(JSON.stringify(serializeScene(shelf)));
        // Nothing but the shape is listed: the pictures come with it.
        expect(doc.assets.map((asset: { type: string }) => asset.type)).toEqual(['geometry']);
        expect(doc.root.components[0].material.texture).toBeNull();
        expect(doc.root.components[0].material.emissiveTexture).toBeUndefined();

        const opened = createTestGame();
        startTestScene(opened.store, 'Shelf', sceneFromDoc(parseSceneDoc(doc, '/scenes/shelf.scene')));
        await arrive();

        const bottle = meshesOf(opened.store).values().next().value!;
        expect(bottle.material.texture?.status).toBe('ready');
        expect(bottle.material.emissiveTexture?.status).toBe('ready');
        expect(served.asked.filter((url) => url.includes('#image'))).toEqual([]);
    });
});

describe('a model piece the file cuts out of its picture', () => {
    const serveFence = (): void => {
        const { json, bin } = asGltf({
            nodes: [{ name: 'Fence', primitives: [{ ...TEST_QUAD, material: 0 }] }],
            materials: [{ alphaMode: 'MASK', alphaCutoff: 0.3 }],
        });
        served = serveGltf({ '/models/car.gltf': json, '/models/model.bin': bin });
    };

    it('is cut from a document too, as from code', async () => {
        serveFence();
        const { store } = createTestGame();
        startTestScene(store, 'Garage', sceneFromDoc(carScene([{ key: 'fence' }], [mesh('fence-mesh', 'fence')])));
        await arrive();

        expect(meshesOf(store).get('fence-mesh')!.material.alphaCutoff).toBe(0.3);
    });

    it('is cut as much as the document asks', async () => {
        serveFence();
        const { store } = createTestGame();
        startTestScene(store, 'Garage', sceneFromDoc(carScene([{ key: 'fence' }], [mesh('fence-mesh', 'fence', { alphaCutoff: 0.7 })])));
        await arrive();

        expect(meshesOf(store).get('fence-mesh')!.material.alphaCutoff).toBe(0.7);
    });
});

describe('a model piece the file keeps both sides of', () => {
    const serveLeaf = (): void => {
        const { json, bin } = asGltf({
            nodes: [{ name: 'Leaf', primitives: [{ ...TEST_QUAD, material: 0 }] }],
            materials: [{ doubleSided: true }],
        });
        served = serveGltf({ '/models/car.gltf': json, '/models/model.bin': bin });
    };

    it('is drawn on both sides from a document too, as from code', async () => {
        serveLeaf();
        const { store } = createTestGame();
        startTestScene(store, 'Garage', sceneFromDoc(carScene([{ key: 'leaf' }], [mesh('leaf-mesh', 'leaf')])));
        await arrive();

        expect(meshesOf(store).get('leaf-mesh')!.material.cull).toBe('none');
    });

    it('keeps the side the document asks for', async () => {
        serveLeaf();
        const { store } = createTestGame();
        startTestScene(store, 'Garage', sceneFromDoc(carScene([{ key: 'leaf' }], [mesh('leaf-mesh', 'leaf', { cull: 'back' })])));
        await arrive();

        expect(meshesOf(store).get('leaf-mesh')!.material.cull).toBe('back');
    });
});

describe('a model piece the file blends', () => {
    const serveGlass = (): void => {
        const { json, bin } = asGltf({
            nodes: [{ name: 'Glass', primitives: [{ ...TEST_QUAD, material: 0 }] }],
            materials: [{ alphaMode: 'BLEND' }],
        });
        served = serveGltf({ '/models/car.gltf': json, '/models/model.bin': bin });
    };

    it('is seen through from a document too, as from code', async () => {
        serveGlass();
        const { store } = createTestGame();
        startTestScene(store, 'Garage', sceneFromDoc(carScene([{ key: 'glass' }], [mesh('glass-mesh', 'glass')])));
        await arrive();

        expect(meshesOf(store).get('glass-mesh')!.material.transparent).toBe(true);
    });

    it('is solid when the document says so', async () => {
        serveGlass();
        const { store } = createTestGame();
        startTestScene(store, 'Garage', sceneFromDoc(carScene([{ key: 'glass' }], [mesh('glass-mesh', 'glass', { transparent: false })])));
        await arrive();

        expect(meshesOf(store).get('glass-mesh')!.material.transparent).toBe(false);
    });
});

describe('pieces of a model file that share a name', () => {
    const RED: [number, number, number, number] = [1, 0, 0, 1];
    const GREEN: [number, number, number, number] = [0, 1, 0, 1];

    /**
     * A model of two pieces, red then green, laid out as `nodes` says.
     */
    const serveTwo = (nodes: unknown[]): void => {
        const glb = asGlb({ nodes: nodes as never, materials: [{ baseColorFactor: RED }, { baseColorFactor: GREEN }] });
        served = serveGltf({ 'car.glb': glb });
    };

    const colours = (root: { drawables: unknown[]; children: unknown[] }): string[] => {
        const out: string[] = [];
        const walk = (box: { drawables: unknown[]; children: unknown[] }): void => {
            for (const d of box.drawables as TMesh[]) {
                if (d.type === 'mesh') out.push(d.material.tint.r > 0.5 ? 'red' : 'green');
            }
            for (const child of box.children) walk(child as typeof box);
        };
        walk(root);
        return out.sort();
    };

    /**
     * The model saved in a scene and the scene opened again in another game.
     */
    const saveAndOpen = async (): Promise<{ doc: TSceneDoc; before: string[]; after: string[] }> => {
        const { store } = createTestGame();
        let model!: TGltfModel;
        startTestScene(store, 'Loading', () => {
            model = useLoadGltf({ src: 'car.glb' });
            return createScene();
        });
        await whenLoaded(model);
        const shelf = startTestScene(store, 'Shelf', () => {
            createModel({ model });
            return createScene();
        });
        const doc = JSON.parse(JSON.stringify(serializeScene(shelf))) as TSceneDoc;
        const opened = createTestGame();
        const root = startTestScene(opened.store, 'Shelf', sceneFromDoc(parseSceneDoc(doc, '/scenes/shelf.scene')));
        await arrive();
        return { doc, before: colours(shelf), after: colours(root) };
    };

    const sources = (doc: TSceneDoc): unknown[] => doc.assets.map((asset) => (asset as { source: unknown }).source);

    it('tells apart the two pieces of a node drawn in two materials', async () => {
        serveTwo([{ name: 'Car', primitives: [{ ...TEST_QUAD, material: 0 }, { ...TEST_QUAD, material: 1 }] }]);
        const { doc, before, after } = await saveAndOpen();
        expect(sources(doc)).toEqual([
            { kind: 'gltf', src: 'car.glb', node: 'Car' },
            { kind: 'gltf', src: 'car.glb', node: 'Car', occurrence: 1 },
        ]);
        expect(after).toEqual(before);
        expect(after).toEqual(['green', 'red']);
    });

    it('tells apart two pieces the file did not name, written with an empty name', async () => {
        serveTwo([{ primitives: [{ ...TEST_QUAD, material: 0 }] }, { primitives: [{ ...TEST_QUAD, material: 1 }] }]);
        const { doc, after } = await saveAndOpen();
        expect(sources(doc)).toEqual([
            { kind: 'gltf', src: 'car.glb', node: '' },
            { kind: 'gltf', src: 'car.glb', node: '', occurrence: 1 },
        ]);
        expect(after).toEqual(['green', 'red']);
    });

    it('tells apart two nodes of the same name', async () => {
        serveTwo([
            { name: 'Wheel', primitives: [{ ...TEST_QUAD, material: 0 }] },
            { name: 'Wheel', primitives: [{ ...TEST_QUAD, material: 1 }] },
        ]);
        const { after } = await saveAndOpen();
        expect(after).toEqual(['green', 'red']);
    });

    it('writes no occurrence for pieces whose names already tell them apart', async () => {
        serveTwo([
            { name: 'Body', primitives: [{ ...TEST_QUAD, material: 0 }] },
            { name: 'Wheel', primitives: [{ ...TEST_QUAD, material: 1 }] },
        ]);
        const { doc, after } = await saveAndOpen();
        expect(sources(doc)).toEqual([
            { kind: 'gltf', src: 'car.glb', node: 'Body' },
            { kind: 'gltf', src: 'car.glb', node: 'Wheel' },
        ]);
        expect(after).toEqual(['green', 'red']);
    });

    it('counts a piece over the whole file, however much of it was loaded', async () => {
        // A red car, and a trailer carrying a green one: the green is the second "Car" of the file,
        // and the first of the trailer.
        const glb = asGlb({
            nodes: [
                { name: 'Car', primitives: [{ ...TEST_QUAD, material: 0 }] },
                { name: 'Trailer', primitives: [{ ...TEST_QUAD, material: 0 }], children: [2] },
                { name: 'Car', primitives: [{ ...TEST_QUAD, material: 1 }] },
            ],
            roots: [0, 1],
            materials: [{ baseColorFactor: RED }, { baseColorFactor: GREEN }],
        });
        served = serveGltf({ 'car.glb': glb });
        const { store } = createTestGame();
        let whole!: TGltfModel;
        let trailer!: TGltfModel;
        startTestScene(store, 'Loading', () => {
            whole = useLoadGltf({ src: 'car.glb' });
            trailer = useLoadGltf({ src: 'car.glb', node: 'Trailer' });
            return createScene();
        });
        await whenLoaded(whole);
        await whenLoaded(trailer);
        const greenIn = (model: TGltfModel) => model.parts.find((part) => part.tint.g > 0.5)!.geometry.source;
        expect(greenIn(whole)).toEqual({ kind: 'gltf', src: 'car.glb', node: 'Car', occurrence: 1 });
        expect(greenIn(trailer)).toEqual(greenIn(whole));
    });

    it('still takes the first piece of the file for a document that names no node', async () => {
        serveCar();
        const { store } = createTestGame();
        startTestScene(store, 'Garage', sceneFromDoc(carScene([{ key: 'car' }], [mesh('body-mesh', 'car')])));
        await arrive();
        expect(meshesOf(store).get('body-mesh')!.material.tint).toMatchObject({ r: 1, g: 0, b: 0 });
    });

    it('leaves the mesh empty and says so when the file has no piece of that number', async () => {
        serveCar();
        warn = spyOn(console, 'warn').mockImplementation(() => {});
        const doc = parseSceneDoc({
            format: SCENE_FORMAT, version: 1, name: 'Garage',
            assets: [{ type: 'geometry', key: 'wheel', source: { kind: 'gltf', src: '/models/car.gltf', node: 'Wheel', occurrence: 1 } }],
            root: { id: 'root', name: 'Garage', transform: null, components: [mesh('wheel-mesh', 'wheel')], children: [] },
        }, '/scenes/garage.scene');
        const { store } = createTestGame();
        startTestScene(store, 'Garage', sceneFromDoc(doc));
        await arrive();
        expect(meshesOf(store).get('wheel-mesh')!.geometry?.status).toBe('loading');
        expect(String(warn.mock.calls.at(-1)?.[0])).toContain('no a piece number 1 (from 0) called "Wheel"');
    });

    it('does not read an occurrence that is no count', () => {
        warn = spyOn(console, 'warn').mockImplementation(() => {});
        for (const occurrence of [-1, 1.5, '1', null]) {
            const doc = parseSceneDoc({
                format: SCENE_FORMAT, version: 1, name: 'Garage',
                assets: [{ type: 'geometry', key: 'wheel', source: { kind: 'gltf', src: '/models/car.gltf', node: 'Wheel', occurrence } }],
                root: { id: 'root', name: 'Garage', transform: null, components: [], children: [] },
            }, '/scenes/garage.scene');
            expect(doc.assets).toEqual([]);
        }
        expect(warn.mock.calls.some((call: unknown[]) => String(call[0]).includes('which is no count'))).toBe(true);
    });

    it('does not read half a reference: a number with no name, or a name that is no text', () => {
        warn = spyOn(console, 'warn').mockImplementation(() => {});
        for (const source of [
            { kind: 'gltf', src: '/models/car.gltf', occurrence: 99 },
            { kind: 'gltf', src: '/models/car.gltf', occurrence: 0 },
            { kind: 'gltf', src: '/models/car.gltf', node: 3 },
        ]) {
            const doc = parseSceneDoc({
                format: SCENE_FORMAT, version: 1, name: 'Garage',
                assets: [{ type: 'geometry', key: 'wheel', source }],
                root: { id: 'root', name: 'Garage', transform: null, components: [], children: [] },
            }, '/scenes/garage.scene');
            expect(doc.assets).toEqual([]);
        }
        expect(warn.mock.calls.some((call: unknown[]) => String(call[0]).includes('but not the name'))).toBe(true);
        expect(warn.mock.calls.some((call: unknown[]) => String(call[0]).includes('which is no name'))).toBe(true);
    });
});
