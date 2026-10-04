import { afterEach, describe, expect, it, mock } from 'bun:test';
import { createScene } from '../src/scene/create_scene';
import { createMesh } from '../src/gameobjects/mesh/create_mesh';
import { createModel } from '../src/gameobjects/model';
import { useCubeGeometry } from '../src/hooks/geometry/use_cube_geometry';
import { useLoadGltf } from '../src/hooks/loaders/use_load_gltf';
import { whenLoaded } from '../src/loaders';
import { readMaterial } from '../src/loaders/gltf/read_material';
import { parseSceneDoc, serializeScene } from '../src/scene/document';
import { TEXTURE_WRAPS, textureWrapOf, wrapKey } from '../src/render/shared/texture_wrap';
import { createTestGame, startTestScene } from './helpers/test_game';
import { asGltf, serveGltf, TEST_QUAD } from './helpers/test_gltf';
import type { TGltfDoc } from '../src/loaders/gltf/types/t_gltf_doc';
import type { TGltfModel } from '../src/loaders';
import type { TMesh } from '../src/gameobjects/mesh';
import type { TMeshMaterial } from '../src/materials';

/**
 * What a model's picture does past its edge.
 *
 * A level of the era tiles one small patch of grass across a hillside by giving its corners UVs far
 * beyond 0 to 1, and a picture that stretches its edge instead turns that grass into streaks. So a
 * model repeats unless told otherwise, as it does in glTF, and a file's own
 * word is kept, one way at a time.
 */

afterEach(() => { mock.restore(); });

const CLAMP = 33071;
const MIRROR = 33648;
const REPEAT = 10497;

const surfaceOf = (sampler?: { wrapS?: number; wrapT?: number }) => readMaterial({
    materials: [{ pbrMetallicRoughness: { baseColorTexture: { index: 0 } } }],
    textures: [{ source: 0, ...(sampler !== undefined ? { sampler: 0 } : {}) }],
    images: [{ uri: 'grass.png' }],
    ...(sampler !== undefined ? { samplers: [sampler] } : {}),
} as unknown as TGltfDoc, 0);

describe('a file says what its picture does past its edge', () => {
    it('repeats when it says nothing, which is the format\'s own default', () => {
        expect(surfaceOf().wrap).toEqual({ u: 'repeat', v: 'repeat' });
        expect(surfaceOf({}).wrap).toEqual({ u: 'repeat', v: 'repeat' });
    });

    it('is read one way at a time', () => {
        expect(surfaceOf({ wrapS: CLAMP, wrapT: MIRROR }).wrap).toEqual({ u: 'clamp', v: 'mirror' });
        expect(surfaceOf({ wrapS: REPEAT, wrapT: CLAMP }).wrap).toEqual({ u: 'repeat', v: 'clamp' });
    });

    it('repeats for a number the format does not have', () => {
        expect(surfaceOf({ wrapS: 1234 }).wrap).toEqual({ u: 'repeat', v: 'repeat' });
    });
});

describe('a loaded model', () => {
    /**
     * A fence that repeats sideways and not upwards, placed with whatever options are given.
     */
    const placed = async (options: Record<string, unknown> = {}) => {
        const { json, bin } = asGltf({
            nodes: [{ name: 'Fence', primitives: [{ ...TEST_QUAD, material: 0 }] }],
            materials: [{ image: 'fence.png', wrapS: REPEAT, wrapT: CLAMP }],
        });
        const served = serveGltf({ 'model.gltf': json, 'model.bin': bin, 'fence.png': 'png' });
        const { store } = createTestGame();
        let model!: TGltfModel;
        startTestScene(store, 'Loading', () => {
            model = useLoadGltf({ src: 'model.gltf' });
            return createScene();
        });
        await whenLoaded(model);
        served.restore();

        const root = startTestScene(store, 'Yard', () => {
            createModel({ model, ...options });
            return createScene();
        });
        return { model, mesh: root.drawables.find((d) => d.type === 'mesh') as TMesh };
    };

    it('keeps what the file asked for, one way at a time', async () => {
        const { model, mesh } = await placed();
        expect(model.parts[0].wrap).toEqual({ u: 'repeat', v: 'clamp' });
        expect(textureWrapOf(mesh.material)).toEqual({ u: 'repeat', v: 'clamp' });
    });

    it('does what the game says over what the file says', async () => {
        const { mesh } = await placed({ wrap: 'mirror' });
        expect(textureWrapOf(mesh.material)).toEqual({ u: 'mirror', v: 'mirror' });
    });
});

describe('a model built in code', () => {
    it('repeats unless told otherwise', () => {
        const { store } = createTestGame();
        let plain!: TMesh;
        let clamped!: TMesh;
        startTestScene(store, 'Level', () => {
            plain = createMesh({ geometry: useCubeGeometry() });
            clamped = createMesh({ geometry: useCubeGeometry(), wrap: 'clamp' });
            return createScene();
        });

        expect(textureWrapOf(plain.material)).toEqual({ u: 'repeat', v: 'repeat' });
        expect(textureWrapOf(clamped.material)).toEqual({ u: 'clamp', v: 'clamp' });
    });

    it('can say each way on its own', () => {
        const material = { wrap: { u: 'mirror', v: 'clamp' } } as TMeshMaterial;
        expect(textureWrapOf(material)).toEqual({ u: 'mirror', v: 'clamp' });
    });
});

describe('a scene written down', () => {
    const doc = (wrap?: TMeshMaterial['wrap']) => {
        const { store } = createTestGame();
        const root = startTestScene(store, 'Level', () => {
            createMesh({ geometry: useCubeGeometry(), ...(wrap !== undefined ? { wrap } : {}) });
            return createScene();
        });
        return serializeScene(root);
    };
    const materialOf = (written: ReturnType<typeof doc>) => {
        const mesh = written.root.components.find((c) => c.type === 'mesh');
        return mesh?.type === 'mesh' ? mesh.material : undefined;
    };

    it('leaves repeating out, however it is spelled, since it is the default', () => {
        expect(materialOf(doc())?.wrap).toBeUndefined();
        expect(materialOf(doc('repeat'))?.wrap).toBeUndefined();
        expect(materialOf(doc({ u: 'repeat', v: 'repeat' }))?.wrap).toBeUndefined();
    });

    it('keeps anything else, and reads it back the same', () => {
        for (const wrap of ['clamp', { u: 'mirror', v: 'repeat' }] as const) {
            const written = doc(wrap);
            expect(materialOf(written)?.wrap).toEqual(wrap);
            expect(parseSceneDoc(written, '/scenes/level.scene')).toEqual(written);
        }
    });

    it('reads a word it does not know as repeating', () => {
        const written = doc('clamp');
        const mesh = written.root.components.find((c) => c.type === 'mesh')!;
        (mesh as unknown as { material: { wrap: unknown } }).material.wrap = 'tile';
        expect(materialOf(parseSceneDoc(written, '/scenes/level.scene'))?.wrap).toBeUndefined();
    });
});

describe('the samplers both backends make', () => {
    it('are one per filter and edge each way, each under its own name', () => {
        const keys = new Set<string>();
        for (const filter of ['nearest', 'linear'] as const) {
            for (const u of TEXTURE_WRAPS) {
                for (const v of TEXTURE_WRAPS) {
                    keys.add(wrapKey(filter, u, v));
                }
            }
        }
        expect(keys.size).toBe(18);
    });
});
