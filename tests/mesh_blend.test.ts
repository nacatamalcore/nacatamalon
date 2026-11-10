import { describe, expect, it } from 'bun:test';
import { createScene } from '../src/scene/create_scene';
import { createMesh } from '../src/gameobjects/mesh/create_mesh';
import { createMeshInstances } from '../src/gameobjects/mesh/create_mesh_instances';
import { createMaterial } from '../src/gameobjects/material/create_material';
import { useCubeGeometry } from '../src/hooks/geometry/use_cube_geometry';
import { useSpawn } from '../src/hooks/spawn/use_spawn';
import { useTransform } from '../src/hooks/transform/use_transform';
import { parseSceneDoc, sceneFromDoc, serializeScene } from '../src/scene/document';
import { fillMeshUniforms, MESH_UNIFORM_FLOATS } from '../src/render/shared';
import { fillCameraSpace, newCameraSpace } from '../src/render/shared/compute_mvp_3d';
import { isTransparentMesh } from '../src/render/shared/is_transparent_mesh';
import { findShadowSources } from '../src/render/shared/light_space';
import { addingTwinOf, describeMeshPipeline, keepSeeThrough, makeMeshPipeline } from '../src/render/webgpu/mesh/pipeline_state';
import { ADDITIVE_BLEND } from '../src/render/webgpu/frame/blend';
import { meshShaderFor } from '../src/render/webgpu/mesh/mesh_shader';
import { buildMeshMaterialShader } from '../src/render/webgpu/material/mesh_material_shader';
import { meshFragmentGlsl } from '../src/render/webgl2/mesh/mesh_shader';
import { buildMeshMaterialShaderGlsl } from '../src/render/webgl2/material/mesh_material_shader';
import { createTestGame, startTestScene } from './helpers/test_game';
import type { TDrawItem, TDrawLight, TDrawMesh, TDrawView3d, TFrameContext } from '../src/render/interface';
import type { TMesh } from '../src/gameobjects/mesh';

/**
 * `blend: 'additive'` on a model: it adds its colour rather than covering, the flashes, holograms,
 * shields and beams of light that alpha only imitates.
 *
 * Pinned here: what a material, a model and a document keep; that one that adds is always drawn
 * see-through and casts nothing; the number that tells the fog; and the pipeline that adds, made
 * from the see-through one. That it looks right is checked in a browser.
 */

const at = () => ({ x: 0, y: 0, z: 0, rotation: 0, rotationX: 0, rotationY: 0, scaleX: 1, scaleY: 1, scaleZ: 1 });

const drawMesh = (material: Partial<TDrawMesh['material']> = {}, fields: Partial<TDrawMesh> = {}): TDrawMesh => ({
    type: 'mesh',
    geometry: null,
    transform: at(),
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
        ...material,
    },
    ...fields,
});

describe('a model that adds its colour', () => {
    it('is left out of a material unless asked, and kept as asked', () => {
        expect(createMaterial({ shader: 'mesh3d' })).not.toHaveProperty('blend');
        expect(createMaterial({ shader: 'mesh3d', blend: 'additive' }).blend).toBe('additive');
    });

    it('goes with a model made without a material of its own, one at a time or many', () => {
        const { store } = createTestGame();
        let one: TMesh | null = null;
        let many: TMesh | null = null;
        startTestScene(store, 'Level', () => {
            one = createMesh({ geometry: useCubeGeometry(), blend: 'additive' });
            many = createMeshInstances({ geometry: useCubeGeometry(), capacity: 4, blend: 'additive' }) as unknown as TMesh;
            return createScene();
        });
        expect(one!.material.blend).toBe('additive');
        expect(many!.material.blend).toBe('additive');
    });

    it('is drawn see-through whatever else it says, so what it adds to is there first', () => {
        expect(isTransparentMesh(drawMesh({ blend: 'additive' }))).toBe(true);
        expect(isTransparentMesh(drawMesh({ blend: 'additive', transparent: false }))).toBe(true);
        // Covering, it is as it was: solid at full alpha.
        expect(isTransparentMesh(drawMesh({ blend: 'alpha' }))).toBe(false);
        expect(isTransparentMesh(drawMesh())).toBe(false);
    });

    it('casts nothing, since light added blocks none', () => {
        const glow = drawMesh({ blend: 'additive' });
        const crate = drawMesh();
        const sun: TDrawLight = { type: 'directional', color: { r: 1, g: 1, b: 1, a: 1 }, intensity: 1, castShadow: true, transform: at() };
        const view: TDrawView3d = { camera: null, lights: [sun], ambient: { r: 0, g: 0, b: 0, a: 1 } };
        const ctx = { time: 0, passes: [{ views3d: [view], drawables: [glow, crate] as TDrawItem[], viewIndex: [0, 0] }] } as unknown as TFrameContext;
        expect(findShadowSources(ctx)[0]!.casters).toEqual([crate]);
    });

    it('tells the fog in the spare number of the facing turn, zero for one that covers', () => {
        const space = fillCameraSpace(newCameraSpace(), null, 320, 240);
        const out = new Float32Array(MESH_UNIFORM_FLOATS);
        fillMeshUniforms(out, 0, drawMesh({ blend: 'additive' }), space);
        expect(out[43]).toBe(1);
        fillMeshUniforms(out, 0, drawMesh(), space);
        expect(out[43]).toBe(0);
    });

    it('fades into the fog by adding less, in every colour stage of both cards', () => {
        const fogged = 'lights.fog.rgb * (1.0 - uniforms.normalMatrix[2].w)';
        for (const cull of ['back', 'front', 'none'] as const) {
            expect(meshShaderFor(cull)).toContain(fogged);
            expect(meshFragmentGlsl(cull)).toContain(fogged);
            expect(buildMeshMaterialShader('fn effect(surface: vec4<f32>, ctx: FragContext) -> vec4<f32> { return surface; }', null, {}, [], false, cull)).toContain(fogged);
            expect(buildMeshMaterialShaderGlsl('vec4 effect(vec4 surface, FragContext ctx) { return surface; }', null, {}, [], false, cull).fragment).toContain(fogged);
        }
    });
});

describe('a model that adds, in a scene document', () => {
    const written = (blend: 'alpha' | 'additive' | undefined) => {
        const { store } = createTestGame();
        const root = startTestScene(store, 'Level', () => {
            useSpawn(function Glow() {
                useTransform({});
                createMesh({ geometry: useCubeGeometry(), ...(blend !== undefined ? { blend } : {}) });
            })();
            return createScene();
        });
        return serializeScene(root);
    };
    const materialOf = (doc: ReturnType<typeof written>) =>
        (doc.root.children[0]!.components.find((component) => component.type === 'mesh') as { material: { blend?: unknown } }).material;

    it('is written only when it adds, and read back the same', () => {
        expect(materialOf(written(undefined))).not.toHaveProperty('blend');
        expect(materialOf(written('alpha'))).not.toHaveProperty('blend');
        const glow = written('additive');
        expect(materialOf(glow).blend).toBe('additive');
        expect(parseSceneDoc(glow, '/scenes/level.scene')).toEqual(glow);
    });

    it('is drawn that way when the scene is made from it, and a word it does not know covers', () => {
        const { store } = createTestGame();
        const root = startTestScene(store, 'Level', sceneFromDoc(written('additive')));
        const mesh = root.children[0]!.drawables.find((drawable) => drawable.type === 'mesh') as TMesh;
        expect(mesh.material.blend).toBe('additive');

        const odd = written('additive');
        materialOf(odd).blend = 'add';
        expect(materialOf(parseSceneDoc(odd, '/scenes/level.scene'))).not.toHaveProperty('blend');
    });
});

describe('the pipeline that adds', () => {
    // A card that hands back what it was asked for, so what was asked can be read.
    const made: GPURenderPipelineDescriptor[] = [];
    const device = {
        createRenderPipeline: (descriptor: GPURenderPipelineDescriptor) => {
            made.push(descriptor);
            return { descriptor } as unknown as GPURenderPipeline;
        },
    } as unknown as GPUDevice;
    const describeOne = (writesDepth: boolean) =>
        describeMeshPipeline('mesh', {} as GPUShaderModule, {} as GPUPipelineLayout, [], 'bgra8unorm', 4, writesDepth, 'none');

    it('is the see-through one in everything but how it lands, made once', () => {
        const glass = makeMeshPipeline(device, describeOne(false));
        const twin = addingTwinOf(device, glass);
        const asked = (twin as unknown as { descriptor: GPURenderPipelineDescriptor }).descriptor;
        expect(asked.fragment!.targets[0]!.blend).toEqual(ADDITIVE_BLEND);
        expect(asked.depthStencil!.depthWriteEnabled).toBe(false);
        expect(asked.primitive).toEqual(describeOne(false).primitive);
        expect(asked.multisample).toEqual({ count: 4 });
        expect(addingTwinOf(device, glass)).toBe(twin);
    });

    it('is made for a material\'s, kept apart, too', () => {
        const descriptor = describeOne(false);
        const glass = keepSeeThrough({} as GPURenderPipeline, descriptor);
        expect(addingTwinOf(device, glass)).not.toBe(glass);
    });

    it('is not made from a solid one, which a model that adds is never drawn with', () => {
        const solid = makeMeshPipeline(device, describeOne(true));
        expect(addingTwinOf(device, solid)).toBe(solid);
    });
});
