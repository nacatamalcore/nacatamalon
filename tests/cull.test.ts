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
import { meshShaderFor, MESH_SHADER } from '../src/render/webgpu/mesh/mesh_shader';
import { skinnedShaderFor } from '../src/render/webgpu/mesh/skinned_shader';
import { buildMeshMaterialShader } from '../src/render/webgpu/material/mesh_material_shader';
import { meshFragmentGlsl, meshVertexGlsl, MESH_VERTEX_GLSL } from '../src/render/webgl2/mesh/mesh_shader';
import { buildMeshMaterialShaderGlsl } from '../src/render/webgl2/material/mesh_material_shader';
import { compileShader } from '../src/shader_composer/compile_shader';
import { composerFrontFacing, composerMix, composerSurface, composerVec4 } from '../src/shader_composer';
import { createTestGame, startTestScene } from './helpers/test_game';
import { asGltf, serveGltf, TEST_QUAD } from './helpers/test_gltf';
import type { TGltfDoc } from '../src/loaders/gltf/types/t_gltf_doc';
import type { TGltfModel } from '../src/loaders';
import type { TModel } from '../src/gameobjects/model';
import type { TMesh } from '../src/gameobjects/mesh';
import type { TCullMode } from '../src/materials';

/**
 * Which side of a model's triangles is thrown away, and how what is kept is lit.
 *
 * The cards do the throwing away; what is worth pinning down here is everything the engine decides
 * around it: what a material keeps, what a file and a document say, and what each shader is told,
 * so that the usual side stays exactly what it always was.
 */

afterEach(() => { mock.restore(); });

/**
 * The places a vertex output hands across, counted. A card promises sixteen.
 */
const locationsOf = (wgsl: string): number[] => {
    const struct = wgsl.slice(wgsl.indexOf('struct VertexOutput {'));
    const body = struct.slice(0, struct.indexOf('};'));
    return [...body.matchAll(/@location\((\d+)\)/g)].map((match) => Number(match[1]));
};

describe('the side a material throws away', () => {
    it('is left out unless asked, and kept when asked, even for the usual side', () => {
        expect(createMaterial({ shader: 'mesh3d' }).cull).toBeUndefined();
        // Asked for, the usual side is a decision: it is what keeps a piece whose file says both.
        expect(createMaterial({ shader: 'mesh3d', cull: 'back' }).cull).toBe('back');
        expect(createMaterial({ shader: 'mesh3d', cull: 'none' }).cull).toBe('none');
        expect(createMaterial({ shader: 'mesh3d', cull: 'front' }).cull).toBe('front');
        // A word the engine does not know draws as the usual side, rather than as nothing.
        expect(createMaterial({ shader: 'mesh3d', cull: 'both' as TCullMode }).cull).toBeUndefined();
    });

    it('goes with a model made without a material of its own', () => {
        const { store } = createTestGame();
        let mesh: TMesh | null = null;
        startTestScene(store, 'Level', () => {
            mesh = createMesh({ geometry: useCubeGeometry(), cull: 'none' });
            return createScene();
        });
        expect(mesh!.material.cull).toBe('none');
    });
});

describe('a file that says both sides are seen', () => {
    const docWith = (material: NonNullable<TGltfDoc['materials']>[number]): TGltfDoc =>
        ({ asset: { version: '2.0' }, materials: [material] }) as TGltfDoc;

    it('is read as such, and only when it says so', () => {
        expect(readMaterial(docWith({ doubleSided: true }), 0).doubleSided).toBe(true);
        expect(readMaterial(docWith({}), 0).doubleSided).toBe(false);
        expect(readMaterial(docWith({}), undefined).doubleSided).toBe(false);
    });

    const placed = async (cull?: TCullMode): Promise<TModel> => {
        const { json, bin } = asGltf({
            nodes: [
                { name: 'Leaf', primitives: [{ ...TEST_QUAD, material: 0 }] },
                { name: 'Trunk', primitives: [{ ...TEST_QUAD, material: 1 }] },
            ],
            materials: [{ doubleSided: true }, {}],
        });
        const fake = serveGltf({ 'model.gltf': json, 'model.bin': bin });
        const { store } = createTestGame();
        let model: TModel | null = null;
        let source: TGltfModel | null = null;
        startTestScene(store, 'Level', () => {
            source = useLoadGltf({ src: 'model.gltf' });
            model = createModel({ model: source, ...(cull !== undefined ? { cull } : {}) });
            return createScene();
        });
        await whenLoaded(source as unknown as TGltfModel);
        fake.restore();
        // Both pieces, or the answers below would hold of nothing.
        expect(model!.parts).toHaveLength(2);
        return model!;
    };

    it('draws that piece on both sides and leaves the others alone', async () => {
        const model = await placed();
        expect(model.parts.map((part) => part.material.cull)).toEqual(['none', undefined]);
    });

    it('gives way to what the game says', async () => {
        const model = await placed('back');
        expect(model.parts.map((part) => part.material.cull)).toEqual(['back', 'back']);
    });
});

describe('a side in a scene document', () => {
    const written = (cull: TCullMode | undefined) => {
        const { store } = createTestGame();
        const root = startTestScene(store, 'Level', () => {
            useSpawn(function Sheet() {
                useTransform({});
                createMesh({ geometry: useCubeGeometry(), ...(cull !== undefined ? { cull } : {}) });
            })();
            return createScene();
        });
        return serializeScene(root);
    };
    const materialOf = (doc: ReturnType<typeof written>) =>
        (doc.root.children[0]!.components.find((component) => component.type === 'mesh') as { material: { cull?: string } }).material;

    it('is written only when it was asked for, and read back the same', () => {
        expect(materialOf(written(undefined))).not.toHaveProperty('cull');
        expect(materialOf(written('back')).cull).toBe('back');
        const both = written('none');
        expect(materialOf(both).cull).toBe('none');
        expect(parseSceneDoc(both, '/scenes/level.scene')).toEqual(both);
        expect(materialOf(written('front')).cull).toBe('front');
    });

    it('is drawn that way when the scene is made from it', () => {
        const doc = written('none');
        const { store } = createTestGame();
        const root = startTestScene(store, 'Level', sceneFromDoc(doc));
        const mesh = root.children[0]!.drawables.find((drawable) => drawable.type === 'mesh') as TMesh;
        expect(mesh.material.cull).toBe('none');
    });

    it('leaves out a side it does not know', () => {
        const doc = written('none');
        materialOf(doc).cull = 'sideways';
        expect(materialOf(parseSceneDoc(doc, '/scenes/level.scene'))).not.toHaveProperty('cull');
    });
});

describe('the shaders for each side', () => {
    it('leaves the usual one exactly as it was', () => {
        expect(meshShaderFor('back')).toBe(MESH_SHADER);
        expect(meshVertexGlsl('back')).toBe(MESH_VERTEX_GLSL);
        expect(MESH_SHADER).not.toContain('front_facing');
        expect(MESH_VERTEX_GLSL).not.toContain('vBack0');
    });

    it('lights the inside of a shape seen from inside', () => {
        for (const wgsl of [meshShaderFor('front'), skinnedShaderFor('front'), buildMeshMaterialShader(null, null, {}, [], false, 'front')]) {
            expect(wgsl).toContain('let worldNormal = -normalize(');
            expect(wgsl).not.toContain('back0');
        }
        expect(meshVertexGlsl('front')).toContain('vec3 worldNormal = -normalize(');
        expect(buildMeshMaterialShaderGlsl(null, null, {}, [], false, 'front').vertex).toContain('vec3 worldNormal = -normalize(');
    });

    it('lights both sides of one seen from both, and takes the side being drawn', () => {
        for (const wgsl of [meshShaderFor('none'), skinnedShaderFor('none')]) {
            expect(wgsl).toContain('let back = litBy(worldPos, -worldNormal, viewDir);');
            expect(wgsl).toContain('@builtin(front_facing) front: bool');
            expect(wgsl).toContain('let side = facedLight(in, front);');
            expect(wgsl).toContain('litWithShadow(side.light, side.casterLight, in.shadowCoord)');
        }
        expect(meshVertexGlsl('none')).toContain('litBy(worldPos, -worldNormal, viewDir, backDiffuse');
        expect(meshFragmentGlsl('none')).toContain('bool front = gl_FrontFacing;');
        expect(meshFragmentGlsl('none')).toContain('litWithShadow(sideLight, sideCasterLight, vShadowCoord)');
    });

    it('fits what a material carries into what a card promises, on both sides', () => {
        for (const skinned of [false, true]) {
            for (const cull of ['back', 'front', 'none'] as const) {
                const places = locationsOf(buildMeshMaterialShader(null, null, {}, [], skinned, cull));
                // Fifteen at most and none past the last, leaving one for which side is drawn.
                expect(places.length).toBeLessThanOrEqual(15);
                expect(Math.max(...places)).toBeLessThan(16);
            }
        }
        expect(locationsOf(meshShaderFor('none')).length).toBe(11);
    });

    it('turns a material\'s surface round on the far side, and tells its hook which side it is', () => {
        const wgsl = buildMeshMaterialShader(null, null, {}, [], false, 'none');
        expect(wgsl).toContain('let normal = select(-in.normal, in.normal, front);');
        expect(wgsl).toContain('ctx.normal = normal;');
        expect(wgsl).toContain('ctx.viewDir = viewDirOf(in.worldPos.xyz);');
        expect(wgsl).toContain('ctx.frontFacing = front;');
        const glsl = buildMeshMaterialShaderGlsl(null, null, {}, [], false, 'none');
        expect(glsl.fragment).toContain('ctx.normal = (gl_FrontFacing ? vNormal : -vNormal);');
        expect(glsl.fragment).toContain('ctx.viewDir = viewDirOf(vWorldPos);');
        expect(glsl.fragment).toContain('ctx.frontFacing = gl_FrontFacing;');
        expect(glsl.vertex).not.toContain('vViewDir');
    });

    it('lets a composed shader tell the two sides apart', () => {
        const shader = compileShader({
            shader: 'mesh3d',
            color: composerMix(composerVec4(0, 0, 1, 1), composerSurface(), composerFrontFacing()),
        });
        expect(shader.fragment).toContain('select(0.0, 1.0, ctx.frontFacing)');
        expect(shader.fragmentGlsl).toContain('(ctx.frontFacing ? 1.0 : 0.0)');
    });
});
