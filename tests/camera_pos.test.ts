import { describe, expect, it } from 'bun:test';
import { buildMeshMaterialShader, buildMeshMaterialShadowShader } from '../src/render/webgpu/material/mesh_material_shader';
import { buildMeshMaterialShaderGlsl, buildMeshMaterialShadowShaderGlsl } from '../src/render/webgl2/material/mesh_material_shader';
import { SHADOW_CUT_UNIFORMS_WGSL } from '../src/render/webgpu/shadow/shadow_shader';
import { compileShader } from '../src/shader_composer/compile_shader';
import { compileShaderGraph } from '../src/shader_composer/compile_shader_graph';
import { SHADER_GRAPH_FORMAT } from '../src/shader_composer/document';
import { composerCameraPos, composerDistance, composerMul, composerSurface, composerWorldPos } from '../src/shader_composer';
import type { TCullMode } from '../src/materials';
import type { TShaderGraphDoc } from '../src/shader_composer/types/t_shader_graph_doc';

/**
 * `ctx.cameraPos`: where the camera stands, told to a model material's colour hook, so how far away
 * a point is can be worked out without a uniform moved by hand every frame.
 *
 * Pinned here: every colour stage a hook is written into fills it, from the place the fog measures
 * from in the pass that lights the scene and from the camera's own place in the shadow of one that is
 * cut out, so what a hook leaves out by distance is left out of its shadow too; and the composer
 * reads it in both languages.
 */

const CULLS: TCullMode[] = ['back', 'front', 'none'];
const EFFECT = 'fn effect(surface: vec4<f32>, ctx: FragContext) -> vec4<f32> { return vec4<f32>(surface.rgb, distance(ctx.cameraPos, ctx.worldPos)); }';
const EFFECT_GLSL = 'vec4 effect(vec4 surface, FragContext ctx) { return vec4(surface.rgb, distance(ctx.cameraPos, ctx.worldPos)); }';

describe('where the camera stands, for a colour hook', () => {
    it('is in the context on both cards, and filled from the fog\'s own place in every drawn model', () => {
        for (const cull of CULLS) {
            for (const [skinned, instanced] of [[false, false], [true, false], [false, true]] as const) {
                const name = `${cull}, ${skinned ? 'bones' : instanced ? 'instances' : 'plain'}`;
                const wgsl = buildMeshMaterialShader(EFFECT, null, {}, [], skinned, cull, instanced);
                const glsl = buildMeshMaterialShaderGlsl(EFFECT_GLSL, null, {}, [], skinned, cull, instanced).fragment;
                expect([name, wgsl.includes('cameraPos: vec3<f32>,')]).toEqual([name, true]);
                expect([name, wgsl.includes('ctx.cameraPos = uniforms.cameraPosition.xyz;')]).toEqual([name, true]);
                expect([name, glsl.includes('vec3 cameraPos;')]).toEqual([name, true]);
                expect([name, glsl.includes('ctx.cameraPos = uniforms.cameraPosition.xyz;')]).toEqual([name, true]);
            }
        }
    });

    it('is the camera\'s in the shadow of one cut out, not the light\'s', () => {
        expect(SHADOW_CUT_UNIFORMS_WGSL).toContain('eye: vec4<f32>,');
        for (const instanced of [false, true]) {
            const wgsl = buildMeshMaterialShadowShader(null, {}, [], false, { fragment: EFFECT }, instanced);
            expect(wgsl).toContain('ctx.cameraPos = shadow.eye.xyz;');
            const glsl = buildMeshMaterialShadowShaderGlsl(null, {}, [], false, { fragment: EFFECT_GLSL }, instanced).fragment;
            expect(glsl).toContain('uniform vec3 uEye;');
            expect(glsl).toContain('ctx.cameraPos = uEye;');
        }
    });
});

describe('where the camera stands, in the shader composer', () => {
    it('is read in the colour stage in both languages, and how far away is one distance', () => {
        const far = composerDistance(composerCameraPos(), composerWorldPos());
        const compiled = compileShader({ shader: 'mesh3d', color: composerMul(composerSurface(), far) });
        expect(compiled.fragment).toContain('ctx.cameraPos');
        expect(compiled.fragmentGlsl).toContain('ctx.cameraPos');
    });

    it('is refused in the corner stage, where there is no such thing', () => {
        expect(() => compileShader({ shader: 'mesh3d', position: composerCameraPos() })).toThrow();
    });

    it('is a node in a graph file', () => {
        const doc = {
            format: SHADER_GRAPH_FORMAT,
            kind: 'shadergraph',
            target: 'mesh3d',
            nodes: [
                { id: 'eye', type: 'cameraPos', pos: [0, 0] },
                { id: 'at', type: 'worldPos', pos: [0, 0] },
                { id: 'far', type: 'distance', pos: [0, 0] },
                { id: 'rgba', type: 'combine.rgba', pos: [0, 0] },
                { id: 'out', type: 'output.color', pos: [0, 0] },
            ],
            edges: [
                { from: 'eye', out: 'value', to: 'far', in: 'a' },
                { from: 'at', out: 'value', to: 'far', in: 'b' },
                { from: 'at', out: 'value', to: 'rgba', in: 'rgb' },
                { from: 'far', out: 'value', to: 'rgba', in: 'a' },
                { from: 'rgba', out: 'value', to: 'out', in: 'color' },
            ],
        } as TShaderGraphDoc;
        const compiled = compileShaderGraph(doc);
        expect(compiled.fragment).toContain('distance(ctx.cameraPos, ctx.worldPos)');
        expect(compiled.fragmentGlsl).toContain('distance(ctx.cameraPos, ctx.worldPos)');
    });
});
