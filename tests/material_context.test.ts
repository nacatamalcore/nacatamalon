import { describe, expect, it } from 'bun:test';
import { buildMeshMaterialShader } from '../src/render/webgpu/material/mesh_material_shader';
import { buildMeshMaterialShaderGlsl } from '../src/render/webgl2/material/mesh_material_shader';
import { MESH_DETAIL } from '../src/render/webgpu/mesh/pipeline_state';

/**
 * What a material is told on top of the light: where on the screen it is, the frame of its surface
 * (tangent and bitangent) and a second picture coordinate. Written twice, once per card, so the two
 * are held to saying the same thing.
 */

const HOOK = 'fn effect(surface: vec4<f32>, ctx: FragContext) -> vec4<f32> { return surface; }';
const HOOK_GLSL = 'vec4 effect(vec4 surface, FragContext ctx) { return surface; }';

/**
 * The body of screenOf, without spaces or the language's spelling of a vector, so the two can be
 * compared as arithmetic.
 */
const screenMath = (source: string): string =>
    source.split('screenOf(')[1]!.split('}')[0]!
        .split('{')[1]!
        .replace(/vec2<f32>/g, 'vec2')
        .replace(/\blet\b|\bvec2 ndc\b/g, (m) => (m === 'let' ? '' : 'ndc'))
        .replace(/\s+/g, '');

describe('the detail a material reads', () => {
    it('comes from the same two slots on both cards', () => {
        const wgsl = buildMeshMaterialShader(HOOK, null, {});
        const glsl = buildMeshMaterialShaderGlsl(HOOK_GLSL, null, {}).vertex;

        expect(wgsl).toContain('@location(6) cornerTangent: vec4<f32>');
        expect(wgsl).toContain('@location(7) cornerUv2: vec2<f32>');
        expect(glsl).toContain('layout(location = 6) in vec4 aTangent;');
        expect(glsl).toContain('layout(location = 7) in vec2 aUv2;');
        // And the run the card reads them from puts them there: four numbers, then two.
        expect(MESH_DETAIL.arrayStride).toBe(24);
        expect(MESH_DETAIL.attributes.map((a) => a.shaderLocation)).toEqual([6, 7]);
    });

    it('bends the tangent with the bones the same way it bends the facing', () => {
        const wgsl = buildMeshMaterialShader(HOOK, null, {}, [], true);
        const glsl = buildMeshMaterialShaderGlsl(HOOK_GLSL, null, {}, [], true).vertex;

        expect(wgsl).toContain('let facing = turn * shaped;');
        expect(wgsl).toContain('let across = turn * cornerTangent.xyz;');
        expect(glsl).toContain('vec3 facing = mat3(skin) * shaped;');
        expect(glsl).toContain('vec3 across = mat3(skin) * aTangent.xyz;');
    });

    it('works out the bitangent from the facing and the hand, never carrying it', () => {
        const wgsl = buildMeshMaterialShader(HOOK, null, {});
        const glsl = buildMeshMaterialShaderGlsl(HOOK_GLSL, null, {}).fragment;

        // From the facing the hook is handed, which is the corner's own unless the other side of a
        // two-sided one is drawn.
        expect(wgsl).toContain('ctx.normal = in.normal.xyz;');
        expect(wgsl).toContain('ctx.bitangent = cross(normalize(ctx.normal), ctx.tangent) * in.tangent.w;');
        expect(glsl).toContain('ctx.normal = vNormal.xyz;');
        expect(glsl).toContain('ctx.bitangent = cross(normalize(ctx.normal), ctx.tangent) * vTangent.w;');
    });
});

describe('where on the screen a material is', () => {
    it('is the corner on the screen, divided at the pixel, the same on both cards', () => {
        const wgsl = buildMeshMaterialShader(HOOK, null, {});
        const glsl = buildMeshMaterialShaderGlsl(HOOK_GLSL, null, {});

        expect(wgsl).toContain('out.screen = vec4<f32>(out.position.xyw, cornerUv2.y);');
        expect(glsl.vertex).toContain('vScreen = vec4(gl_Position.xyw, aUv2.y);');
        // The second picture's place rides in the spare fourth numbers of the facing and of this.
        expect(wgsl).toContain('ctx.uv2 = vec2<f32>(in.normal.w, in.screen.w);');
        expect(glsl.fragment).toContain('ctx.uv2 = vec2(vNormal.w, vScreen.w);');
        expect(screenMath(glsl.fragment)).toBe(screenMath(wgsl));
        // In the game's pixels, top left first: y turned over, then times the size of the game.
        expect(screenMath(wgsl)).toContain('0.5-ndc.y*0.5');
        expect(screenMath(wgsl)).toContain('*mu.resolution');
    });
});
