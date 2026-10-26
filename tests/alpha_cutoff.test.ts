import { afterEach, describe, expect, it, mock } from 'bun:test';
import { createScene } from '../src/scene/create_scene';
import { createModel } from '../src/gameobjects/model';
import { createMesh } from '../src/gameobjects/mesh/create_mesh';
import { createMaterial } from '../src/gameobjects/material/create_material';
import { useCubeGeometry } from '../src/hooks/geometry/use_cube_geometry';
import { useLoadGltf } from '../src/hooks/loaders/use_load_gltf';
import { useSpawn } from '../src/hooks/spawn/use_spawn';
import { useTransform } from '../src/hooks/transform/use_transform';
import { whenLoaded } from '../src/loaders';
import { readMaterial } from '../src/loaders/gltf/read_material';
import { parseSceneDoc, sceneFromDoc, serializeScene } from '../src/scene/document';
import { fillMeshUniforms, MESH_UNIFORM_FLOATS } from '../src/render/shared';
import { fillCameraSpace, newCameraSpace } from '../src/render/shared/compute_mvp_3d';
import { meshShaderFor } from '../src/render/webgpu/mesh/mesh_shader';
import { skinnedShaderFor } from '../src/render/webgpu/mesh/skinned_shader';
import { buildMeshMaterialShader } from '../src/render/webgpu/material/mesh_material_shader';
import { meshFragmentGlsl } from '../src/render/webgl2/mesh/mesh_shader';
import { buildMeshMaterialShaderGlsl } from '../src/render/webgl2/material/mesh_material_shader';
import { castsThroughHook } from '../src/render/webgpu/shadow/shadow_pipeline';
import { SHADOW_CUT_SKINNED_WGSL, SHADOW_CUT_WGSL, SHADOW_WGSL } from '../src/render/webgpu/shadow/shadow_shader';
import { SHADOW_CUT_FRAGMENT_GLSL, SHADOW_CUT_SKINNED_VERTEX_GLSL, SHADOW_CUT_VERTEX_GLSL } from '../src/render/webgl2/shadow/shadow_shader';
import { createTestGame, startTestScene } from './helpers/test_game';
import { asGltf, serveGltf, TEST_QUAD } from './helpers/test_gltf';
import type { TGltfDoc } from '../src/loaders/gltf/types/t_gltf_doc';
import type { TGltfModel } from '../src/loaders';
import type { TModel } from '../src/gameobjects/model';
import type { TMesh } from '../src/gameobjects/mesh';
import type { TDrawMesh } from '../src/render/interface';
import type { TCullMode } from '../src/materials';

/**
 * `alphaCutoff`: a picture cut out rather than blended, the fences, leaves and paper figures of the
 * era. The cutting happens on the card; what is pinned here is everything around it: what a
 * material, a file and a document keep, the number reaching the shader, and every shader of both
 * cards, the shadow's included, asking for it. That it looks right is checked in a browser.
 */

afterEach(() => { mock.restore(); });

const CULLS: TCullMode[] = ['back', 'front', 'none'];

describe('a cutoff on a material', () => {
    it('is left out unless asked, and kept as asked', () => {
        expect(createMaterial({ shader: 'mesh3d' })).not.toHaveProperty('alphaCutoff');
        expect(createMaterial({ shader: 'mesh3d', alphaCutoff: 0.5 }).alphaCutoff).toBe(0.5);
        expect(createMaterial({ shader: 'mesh3d', alphaCutoff: 0 }).alphaCutoff).toBe(0);
        expect(createMaterial({ shader: 'mesh3d', alphaCutoff: 1 }).alphaCutoff).toBe(1);
    });

    it('is refused outside 0 to 1, saying what it takes', () => {
        expect(() => createMaterial({ shader: 'mesh3d', alphaCutoff: 1.5 })).toThrow('alphaCutoff is 1.5, and it takes the alpha below which a pixel is cut out, from 0 to 1');
        expect(() => createMaterial({ shader: 'mesh3d', alphaCutoff: -0.1 })).toThrow('alphaCutoff is -0.1');
        expect(() => createMaterial({ shader: 'mesh3d', alphaCutoff: Number.NaN })).toThrow('alphaCutoff is NaN');
    });

    it('goes with a model made without a material of its own', () => {
        const { store } = createTestGame();
        let mesh: TMesh | null = null;
        startTestScene(store, 'Level', () => {
            mesh = createMesh({ geometry: useCubeGeometry(), alphaCutoff: 0.4 });
            return createScene();
        });
        expect(mesh!.material.alphaCutoff).toBe(0.4);
    });

    it('keeps a cut-out model solid: drawn with the solid ones, hiding what is behind it', async () => {
        const { isTransparentMesh } = await import('../src/render/shared/is_transparent_mesh');
        const { store } = createTestGame();
        let mesh: TMesh | null = null;
        startTestScene(store, 'Level', () => {
            mesh = createMesh({ geometry: useCubeGeometry(), alphaCutoff: 0.5 });
            return createScene();
        });
        expect(isTransparentMesh(mesh! as unknown as TDrawMesh)).toBe(false);
    });
});

describe('a file that cuts its picture out', () => {
    const docWith = (material: NonNullable<TGltfDoc['materials']>[number]): TGltfDoc =>
        ({ asset: { version: '2.0' }, materials: [material] }) as TGltfDoc;

    it('is read as cut at the cutoff it says, or at a half, and only with MASK', () => {
        expect(readMaterial(docWith({ alphaMode: 'MASK' }), 0).alphaCutoff).toBe(0.5);
        expect(readMaterial(docWith({ alphaMode: 'MASK', alphaCutoff: 0.3 }), 0).alphaCutoff).toBe(0.3);
        expect(readMaterial(docWith({ alphaMode: 'MASK', alphaCutoff: 4 }), 0).alphaCutoff).toBe(1);
        expect(readMaterial(docWith({ alphaMode: 'BLEND', alphaCutoff: 0.3 }), 0).alphaCutoff).toBeNull();
        expect(readMaterial(docWith({}), 0).alphaCutoff).toBeNull();
        expect(readMaterial(docWith({}), undefined).alphaCutoff).toBeNull();
        // Cut, not blended: it stays solid.
        expect(readMaterial(docWith({ alphaMode: 'MASK' }), 0).transparent).toBe(false);
    });

    const placed = async (alphaCutoff?: number): Promise<TModel> => {
        const { json, bin } = asGltf({
            nodes: [
                { name: 'Leaf', primitives: [{ ...TEST_QUAD, material: 0 }] },
                { name: 'Trunk', primitives: [{ ...TEST_QUAD, material: 1 }] },
            ],
            materials: [{ alphaMode: 'MASK', alphaCutoff: 0.25 }, {}],
        });
        const fake = serveGltf({ 'model.gltf': json, 'model.bin': bin });
        const { store } = createTestGame();
        let model: TModel | null = null;
        let source: TGltfModel | null = null;
        startTestScene(store, 'Level', () => {
            source = useLoadGltf({ src: 'model.gltf' });
            model = createModel({ model: source, ...(alphaCutoff !== undefined ? { alphaCutoff } : {}) });
            return createScene();
        });
        await whenLoaded(source as unknown as TGltfModel);
        fake.restore();
        expect(model!.parts).toHaveLength(2);
        return model!;
    };

    it('cuts that piece and leaves the others alone', async () => {
        const model = await placed();
        expect(model.parts.map((part) => part.material.alphaCutoff)).toEqual([0.25, undefined]);
    });

    it('gives way to what the game says', async () => {
        const model = await placed(0.6);
        expect(model.parts.map((part) => part.material.alphaCutoff)).toEqual([0.6, 0.6]);
    });
});

describe('a cutoff in a scene document', () => {
    const written = (alphaCutoff: number | undefined) => {
        const { store } = createTestGame();
        const root = startTestScene(store, 'Level', () => {
            useSpawn(function Fence() {
                useTransform({});
                createMesh({ geometry: useCubeGeometry(), ...(alphaCutoff !== undefined ? { alphaCutoff } : {}) });
            })();
            return createScene();
        });
        return serializeScene(root);
    };
    const materialOf = (doc: ReturnType<typeof written>) =>
        (doc.root.children[0]!.components.find((component) => component.type === 'mesh') as { material: { alphaCutoff?: unknown } }).material;

    it('is written only when it was asked for, and read back the same', () => {
        expect(materialOf(written(undefined))).not.toHaveProperty('alphaCutoff');
        const cut = written(0.5);
        expect(materialOf(cut).alphaCutoff).toBe(0.5);
        expect(parseSceneDoc(cut, '/scenes/level.scene')).toEqual(cut);
    });

    it('is drawn that way when the scene is made from it', () => {
        const { store } = createTestGame();
        const root = startTestScene(store, 'Level', sceneFromDoc(written(0.5)));
        const mesh = root.children[0]!.drawables.find((drawable) => drawable.type === 'mesh') as TMesh;
        expect(mesh.material.alphaCutoff).toBe(0.5);
    });

    it('leaves out one outside 0 to 1, or not a number', () => {
        for (const wrong of [2, -1, '0.5', null]) {
            const doc = written(0.5);
            materialOf(doc).alphaCutoff = wrong;
            expect(materialOf(parseSceneDoc(doc, '/scenes/level.scene'))).not.toHaveProperty('alphaCutoff');
        }
    });
});

describe('the cutoff on the card', () => {
    const drawMesh = (alphaCutoff?: number): TDrawMesh => ({
        type: 'mesh',
        geometry: null,
        transform: { x: 0, y: 0, z: 0, rotation: 0, rotationX: 0, rotationY: 0, scaleX: 1, scaleY: 1, scaleZ: 1 },
        skeleton: null,
        material: {
            id: 'm', name: null,
            fragment: null, fragmentGlsl: null, vertex: null, vertexGlsl: null,
            uniforms: null, uniformSig: null,
            texture: null,
            tint: { r: 1, g: 1, b: 1, a: 1 },
            emissive: { r: 0, g: 0, b: 0, a: 1 },
            specular: { r: 0, g: 0, b: 0, a: 1 },
            shininess: 32,
            alpha: 1,
            affine: true,
            ...(alphaCutoff !== undefined ? { alphaCutoff } : {}),
        },
    });

    it('rides in the spare number beside affine, zero when nothing is cut', () => {
        const space = fillCameraSpace(newCameraSpace(), null, 320, 240);
        const out = new Float32Array(MESH_UNIFORM_FLOATS);
        fillMeshUniforms(out, 0, drawMesh(), space);
        expect(out[46]).toBe(0);
        fillMeshUniforms(out, 0, drawMesh(0.5), space);
        expect(out[46]).toBe(0.5);
        // The numbers beside it are untouched.
        expect(out[47]).toBe(1);
    });

    it('is read by every colour stage of both cards, after the colour is made', () => {
        const wgsl = [
            ...CULLS.map((cull) => meshShaderFor(cull)),
            ...CULLS.map((cull) => skinnedShaderFor(cull)),
            ...CULLS.flatMap((cull) => [false, true].map((skinned) => buildMeshMaterialShader(null, null, {}, [], skinned, cull))),
        ];
        for (const code of wgsl) {
            expect(code).toMatch(/if \((color|shaded)\.a < uniforms\.normalMatrix\[3\]\.z\) \{\s*discard;/);
        }
        const glsl = [
            ...CULLS.map((cull) => meshFragmentGlsl(cull)),
            ...CULLS.flatMap((cull) => [false, true].map((skinned) => buildMeshMaterialShaderGlsl(null, null, {}, [], skinned, cull).fragment)),
        ];
        for (const code of glsl) {
            expect(code).toMatch(/if \((color|shaded)\.a < uniforms\.normalMatrix\[3\]\.z\) \{\s*discard;/);
        }
    });

    it('cuts the shadow out of the picture too, on both cards, and leaves the whole one alone', () => {
        expect(SHADOW_WGSL).not.toContain('discard');
        for (const code of [SHADOW_CUT_WGSL, SHADOW_CUT_SKINNED_WGSL]) {
            expect(code).toContain('@fragment');
            expect(code).toContain('if (alpha < shadow.cut.x)');
            expect(code).toContain('textureSample(meshTexture, meshSampler, in.uv).a * shadow.cut.y * in.alpha');
        }
        // The bones blended as the whole shadow blends them.
        expect(SHADOW_CUT_SKINNED_WGSL).toContain('weights.w * joints[u32(bones.w)]');
        expect(SHADOW_CUT_FRAGMENT_GLSL).toContain('texture(uTexture, vUv).a * uCut.y * vAlpha < uCut.x');
        expect(SHADOW_CUT_VERTEX_GLSL).toContain('vUv = aUv;');
        expect(SHADOW_CUT_SKINNED_VERTEX_GLSL).toContain('aWeights.w * boneMatrix(int(aBones.w))');
    });
});

describe('the casters that take a material\'s slot in the shadow', () => {
    const material = (fields: Record<string, unknown>) => ({ vertex: null, fragment: null, ...fields }) as never;

    it('counts one cut out by its colour hook alone, as well as one whose hook moves it', () => {
        expect(castsThroughHook(material({ vertex: 'fn vertex() {}' }))).toBe(true);
        expect(castsThroughHook(material({ fragment: 'fn effect() {}', alphaCutoff: 0.5 }))).toBe(true);
        // Not cut, its colour hook is not run in the shadow.
        expect(castsThroughHook(material({ fragment: 'fn effect() {}' }))).toBe(false);
        expect(castsThroughHook(material({ alphaCutoff: 0.5 }))).toBe(false);
    });
});
