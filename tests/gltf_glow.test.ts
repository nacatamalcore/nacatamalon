import { afterEach, describe, expect, it, mock } from 'bun:test';
import { createScene } from '../src/scene/create_scene';
import { createModel } from '../src/gameobjects/model/create_model';
import { useLoadGltf } from '../src/hooks/loaders/use_load_gltf';
import { whenLoaded } from '../src/loaders';
import { readMaterial } from '../src/loaders/gltf/read_material';
import { parseSceneDoc, sceneFromDoc, SCENE_FORMAT } from '../src/scene/document';
import { fillMeshUniforms, MESH_UNIFORM_FLOATS } from '../src/render/shared';
import { fillCameraSpace, newCameraSpace } from '../src/render/shared/compute_mvp_3d';
import { createTestGame, startTestScene } from './helpers/test_game';
import { asGlb, asGltf, serveGltf, TEST_QUAD } from './helpers/test_gltf';
import type { TGltfDoc } from '../src/loaders/gltf/types/t_gltf_doc';
import type { TGltfModel } from '../src/loaders';
import type { TDrawMesh } from '../src/render/interface';
import type { TMesh } from '../src/gameobjects/mesh/types/t_mesh';
import type { TTestModel } from './helpers/test_gltf';

/**
 * A glow map: the picture a model's glow comes through, read from its file and handed to every
 * place the model ends up, and never a glow over the whole model when the picture is not there.
 */

afterEach(() => { mock.restore(); });

/** A bottle whose glow comes through a logo. */
const BOTTLE: TTestModel = {
    nodes: [{ name: 'Bottle', primitives: [{ ...TEST_QUAD, material: 0 }] }],
    materials: [{ emissiveFactor: [1, 1, 1], emissiveImage: 'logo.png' }],
};

const BLACK = { r: 0, g: 0, b: 0, a: 1 };
const WHITE = { r: 1, g: 1, b: 1, a: 1 };

/**
 * Loads a model and waits for it, the way a scene would across a couple of frames.
 */
const load = async (model: TTestModel | ArrayBuffer, extra: Record<string, unknown> = {}) => {
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
    let loaded!: TGltfModel;
    startTestScene(store, 'Loading', () => {
        loaded = useLoadGltf({ src });
        return createScene();
    });
    await whenLoaded(loaded);
    served.restore();
    return { model: loaded, store, asked: served.asked };
};

describe('reading a glow picture', () => {
    it('knows the glow was masked even when the picture cannot be found', () => {
        const doc = {
            asset: { version: '2.0' },
            materials: [{ emissiveFactor: [1, 1, 1], emissiveTexture: { index: 5 } }],
        } as TGltfDoc;
        const surface = readMaterial(doc, 0);

        expect(surface.emissiveImage).toBeNull();
        expect(surface.emissiveMasked).toBe(true);
    });

    it('is not masked when the file names no glow picture', () => {
        const doc = { asset: { version: '2.0' }, materials: [{ emissiveFactor: [1, 0, 0] }] } as TGltfDoc;
        expect(readMaterial(doc, 0).emissiveMasked).toBe(false);
    });
});

describe('loading a glow picture', () => {
    it('drops a glow whose picture this engine cannot read, rather than lighting the whole model', async () => {
        const { model } = await load({
            nodes: [{ name: 'Bottle', primitives: [{ ...TEST_QUAD, material: 0 }] }],
            materials: [{ emissiveFactor: [1, 1, 1], emissiveUnreadable: true }],
        });
        const [bottle] = model.parts;

        expect(model.status).toBe('ready');
        expect(bottle.emissiveTexture).toBeNull();
        expect(bottle.emissive).toEqual(BLACK);
    });

    it('reads one kept inside a binary model, fetching nothing else', async () => {
        const glb = asGlb({
            nodes: [{ name: 'Bottle', primitives: [{ ...TEST_QUAD, material: 0 }] }],
            materials: [{ emissiveFactor: [1, 1, 1], embeddedEmissiveImage: 'png-bytes' }],
        });
        const { model, asked } = await load(glb);
        const [bottle] = model.parts;

        expect(bottle.emissiveTexture?.status).toBe('ready');
        expect(bottle.emissive).toEqual(WHITE);
        expect(asked).toEqual(['model.glb']);
    });
});

describe('a placed model', () => {
    it('wears its glow picture on every piece', async () => {
        const { model, store } = await load(BOTTLE, { 'logo.png': 'png' });
        const root = startTestScene(store, 'Shelf', () => {
            createModel({ model });
            return createScene();
        });
        const mesh = root.drawables.find((d) => d.type === 'mesh') as TMesh;

        expect(mesh.material.emissiveTexture).toBe(model.parts[0].emissiveTexture!);
        expect(mesh.material.emissive).toEqual(WHITE);
    });

    it('has none when its file has none', async () => {
        const { model, store } = await load({
            nodes: [{ name: 'Sign', primitives: [{ ...TEST_QUAD, material: 0 }] }],
            materials: [{ emissiveFactor: [1, 1, 1] }],
        });
        const root = startTestScene(store, 'Street', () => {
            createModel({ model });
            return createScene();
        });
        const mesh = root.drawables.find((d) => d.type === 'mesh') as TMesh;

        expect(mesh.material.emissiveTexture).toBeUndefined();
    });

    it('wears it too when a scene document places it', async () => {
        const { json, bin } = asGltf(BOTTLE);
        const served = serveGltf({ '/models/bottle.gltf': json, '/models/model.bin': bin, '/models/logo.png': 'png' });
        const { store } = createTestGame();
        startTestScene(store, 'Shelf', sceneFromDoc(parseSceneDoc({
            format: SCENE_FORMAT,
            version: 1,
            name: 'Shelf',
            assets: [{ type: 'geometry', key: 'bottle', source: { kind: 'gltf', src: '/models/bottle.gltf' } }],
            root: {
                id: 'root', name: 'Shelf', transform: null, children: [],
                components: [{ type: 'mesh', id: 'bottle-mesh', geometry: 'bottle', material: {} }],
            },
        }, '/scenes/shelf.scene')));
        for (let i = 0; i < 20; i++) await new Promise((resolve) => setTimeout(resolve, 0));
        served.restore();

        const mesh = store.get('world').scenes[0].drawables.find((d) => d.type === 'mesh') as TMesh;
        expect(mesh.material.emissiveTexture?.status).toBe('ready');
        expect(mesh.material.emissive).toEqual(WHITE);
    });
});

describe('the glow the shader is handed', () => {
    const at = { x: 0, y: 0, z: 0, rotation: 0, rotationX: 0, rotationY: 0, scaleX: 1, scaleY: 1, scaleZ: 1 };
    const glowing = (status: 'loading' | 'ready' | 'error'): TDrawMesh => ({
        type: 'mesh',
        geometry: null,
        transform: at,
        skeleton: null,
        material: {
            id: 'm', name: null,
            fragment: null, fragmentGlsl: null, vertex: null, vertexGlsl: null,
            uniforms: null, uniformSig: null,
            texture: null,
            tint: { r: 1, g: 1, b: 1, a: 1 },
            emissive: { r: 0.4, g: 0.5, b: 0.6, a: 1 },
            emissiveTexture: { status, gpu: status === 'ready' ? {} : null, width: 1, height: 1 },
            specular: { r: 0, g: 0, b: 0, a: 1 },
            shininess: 32,
            alpha: 1,
        },
    }) as unknown as TDrawMesh;

    it('is its colour once its picture is on the card', () => {
        const out = new Float32Array(MESH_UNIFORM_FLOATS);
        fillMeshUniforms(out, 0, glowing('ready'), fillCameraSpace(newCameraSpace(), null, 320, 240));

        expect(out[52]).toBeCloseTo(0.4, 6);
    });

    it('is dark while its picture is missing, so the white stand-in never lights the whole model', () => {
        for (const status of ['loading', 'error'] as const) {
            const out = new Float32Array(MESH_UNIFORM_FLOATS);
            fillMeshUniforms(out, 0, glowing(status), fillCameraSpace(newCameraSpace(), null, 320, 240));

            expect([out[52], out[53], out[54]]).toEqual([0, 0, 0]);
        }
    });
});
