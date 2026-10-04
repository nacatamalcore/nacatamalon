import { afterEach, describe, expect, it, mock } from 'bun:test';
import { createScene } from '../src/scene/create_scene';
import { buildParts } from '../src/loaders/gltf/build_parts';
import { findMeshNodes } from '../src/loaders/gltf/find_mesh_nodes';
import { useCubeGeometry } from '../src/hooks/geometry';
import { useLoadGltf } from '../src/hooks/loaders/use_load_gltf';
import { whenLoaded } from '../src/loaders';
import { createTestGame, startTestScene } from './helpers/test_game';
import { asGltf, serveGltf, TEST_QUAD } from './helpers/test_gltf';
import type { TGltfDoc } from '../src/loaders/gltf/types/t_gltf_doc';
import type { TGltfModel } from '../src/loaders';
import type { TTestModel } from './helpers/test_gltf';

/**
 * How wide the triangle order is. A shape of more than 65.535 corners cannot be addressed by the
 * narrow one, and the whole path from the file to the draw call has to agree about which it is.
 */

const ONE: TTestModel = { nodes: [{ name: 'Quad', primitives: [TEST_QUAD] }] };

const build = (model: TTestModel) => {
    const { json, bin } = asGltf(model);
    const doc = json as TGltfDoc;
    return buildParts(doc, [bin], findMeshNodes(doc), 'auto');
};

afterEach(() => { mock.restore(); });

describe('reading the triangle order', () => {
    it('reads the narrow one as it was written', () => {
        const [part] = build({ ...ONE, indexBits: 16 });

        expect(part.indices).toBeInstanceOf(Uint16Array);
        expect(Array.from(part.indices)).toEqual([0, 1, 2, 0, 2, 3]);
    });

    it('widens the byte-wide one, which nothing draws with', () => {
        const [part] = build({ ...ONE, indexBits: 8 });

        expect(part.indices).toBeInstanceOf(Uint16Array);
        expect(Array.from(part.indices)).toEqual([0, 1, 2, 0, 2, 3]);
    });

    it('keeps the wide one wide, rather than folding a big model onto its own beginning', () => {
        const [part] = build({ ...ONE, indexBits: 32 });

        expect(part.indices).toBeInstanceOf(Uint32Array);
        expect(Array.from(part.indices)).toEqual([0, 1, 2, 0, 2, 3]);
    });

    it('numbers the corners itself when the file gives no order at all', () => {
        const [part] = build({
            nodes: [{ name: 'Loose', primitives: [{ positions: [0, 0, 0, 1, 0, 0, 0, 1, 0] }] }],
        });

        expect(Array.from(part.indices)).toEqual([0, 1, 2]);
    });
});

describe('what the shape tells the backend', () => {
    it('declares the width it was given, all the way to the draw', async () => {
        const { json, bin } = asGltf({ ...ONE, indexBits: 32 });
        const served = serveGltf({ 'model.gltf': json, 'model.bin': bin });
        const { store } = createTestGame();
        let model: TGltfModel | null = null;
        startTestScene(store, 'Level', () => {
            model = useLoadGltf({ src: 'model.gltf' });
            return createScene();
        });
        await whenLoaded(model as unknown as TGltfModel);

        expect(model!.parts[0].geometry.indexType).toBe('uint32');
        served.restore();
    });

    it('leaves a shape built in code on the narrow one, which is all it ever needs', () => {
        const { store } = createTestGame();
        let type = '';
        startTestScene(store, 'Level', () => {
            type = useCubeGeometry().indexType;
            return createScene();
        });

        expect(type).toBe('uint16');
    });
});
