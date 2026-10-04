import { afterEach, describe, expect, it, spyOn } from 'bun:test';
import { parseSceneDoc, sceneFromDoc, SCENE_FORMAT } from '../src/scene/document';
import { createTestGame, startTestScene } from './helpers/test_game';
import { asGltf, serveGltf, TEST_QUAD } from './helpers/test_gltf';
import type { TMesh } from '../src/gameobjects/mesh/types/t_mesh';

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
