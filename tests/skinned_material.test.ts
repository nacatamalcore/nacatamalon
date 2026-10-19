import { describe, expect, it } from 'bun:test';
import { buildMeshMaterialShader, MESH_MATERIAL_GROUP, MESH_MATERIAL_JOINTS_BINDING } from '../src/render/webgpu/material/mesh_material_shader';
import { buildMeshMaterialShaderGlsl } from '../src/render/webgl2/material/mesh_material_shader';
import { SKINNED_SHADER } from '../src/render/webgpu/mesh/skinned_shader';
import { SKINNED_VERTEX_GLSL } from '../src/render/webgl2/mesh/skinned_shader';
import { MAX_MATERIAL_MAPS } from '../src/render/shared/material_maps';

/**
 * A material on a model that bends: the same hooks, with the bones bending the corner after the
 * corner hook has moved it. The bones have to be read exactly as the built-in bending reads them, or
 * a model would change its pose when it put a material on.
 */

const HOOK = 'fn effect(surface: vec4<f32>, ctx: FragContext) -> vec4<f32> { return surface; }';
const VERTEX = 'fn vertex(pos: vec3<f32>, ctx: VertContext) -> vec3<f32> { return pos * 1.1; }';
const VERTEX_GLSL = 'vec3 vertex(vec3 pos, VertContext ctx) { return pos * 1.1; }';

/**
 * The bone blend, the one line both bendings must write the same way.
 */
const blendOf = (source: string): string => source.split('weights.x')[1]!.split(';')[0]!.replace(/\s+/g, ' ');
const blendOfGlsl = (source: string): string => source.split('aWeights.x')[1]!.split(';')[0]!.replace(/\s+/g, ' ');

describe('a material on a model that bends, WGSL', () => {
    const skinned = buildMeshMaterialShader(HOOK, VERTEX, {}, [], true);
    const still = buildMeshMaterialShader(HOOK, VERTEX, {}, []);

    it('binds the bones inside the material group, after the knobs and the maps', () => {
        expect(MESH_MATERIAL_JOINTS_BINDING).toBe(1 + MAX_MATERIAL_MAPS * 2);
        expect(skinned).toContain(
            `@group(${MESH_MATERIAL_GROUP}) @binding(${MESH_MATERIAL_JOINTS_BINDING}) var<storage, read> joints: array<mat4x4<f32>>;`,
        );
        expect(skinned).toContain('@location(3) bones: vec4<f32>');
        expect(skinned).toContain('@location(4) weights: vec4<f32>');
    });

    it('leaves a model that does not bend exactly as it was: no bones, no skin', () => {
        expect(still).not.toContain('joints');
        expect(still).not.toContain('@location(3) bones');
        expect(still).toContain('let placed = vec4<f32>(local, 1.0);');
    });

    it('bends what the corner hook made, so a ripple goes with the arm it is on', () => {
        expect(skinned.indexOf('let local = vertex(position, ctx);')).toBeLessThan(skinned.indexOf('let skin ='));
        expect(skinned).toContain('let placed = skin * vec4<f32>(local, 1.0);');
        expect(skinned).toContain('out.position = snapToPixels(uniforms.mvp * placed);');
    });

    it('mixes the bones as the built-in bending does', () => {
        expect(blendOf(skinned)).toBe(blendOf(SKINNED_SHADER));
    });
});

describe('a material on a model that bends, GLSL', () => {
    const skinned = buildMeshMaterialShaderGlsl(null, VERTEX_GLSL, {}, [], true).vertex;
    const still = buildMeshMaterialShaderGlsl(null, VERTEX_GLSL, {}, []).vertex;

    it('reads the bones from the texture and the corners that name them', () => {
        expect(skinned).toContain('layout(location = 3) in vec4 aBones;');
        expect(skinned).toContain('layout(location = 4) in vec4 aWeights;');
        expect(skinned).toContain('uniform highp sampler2D uJoints;');
        // The version line has to stay first, which GLSL insists on.
        expect(skinned.startsWith('#version 300 es')).toBe(true);
    });

    it('leaves a model that does not bend exactly as it was', () => {
        expect(still).not.toContain('uJoints');
        expect(still).toContain('vec4 placed = vec4(local, 1.0);');
    });

    it('bends what the corner hook made', () => {
        expect(skinned.indexOf('vec3 local = vertex(aPosition, ctx);')).toBeLessThan(skinned.indexOf('mat4 skin ='));
        expect(skinned).toContain('vec4 placed = skin * vec4(local, 1.0);');
    });

    it('mixes the bones as the built-in bending does', () => {
        expect(blendOfGlsl(skinned)).toBe(blendOfGlsl(SKINNED_VERTEX_GLSL));
    });
});
