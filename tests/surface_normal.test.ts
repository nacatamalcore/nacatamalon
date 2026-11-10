import { describe, expect, it } from 'bun:test';
import { buildMeshMaterialShader, buildMeshMaterialShadowShader } from '../src/render/webgpu/material/mesh_material_shader';
import { buildMeshMaterialShaderGlsl, buildMeshMaterialShadowShaderGlsl } from '../src/render/webgl2/material/mesh_material_shader';
import { compileShader } from '../src/shader_composer/compile_shader';
import { compileShaderGraph } from '../src/shader_composer/compile_shader_graph';
import { SHADER_GRAPH_FORMAT } from '../src/shader_composer/document';
import { composerAdd, composerSurface, composerUv, composerVec3, composerVertexPosition, composerX } from '../src/shader_composer';
import type { TCullMode } from '../src/materials';
import type { TShaderGraphDoc } from '../src/shader_composer/types/t_shader_graph_doc';

/**
 * `surfaceNormal`: which way a model material's vertex hook says the surface faces, for the light,
 * in place of the facing measured where it moved the corner.
 *
 * What is pinned here is that every shader a hook is written into has somewhere to put it, keeps it
 * from the hook's own call at the corner and not from the two calls beside it, uses it only when it
 * was written, and carries nothing more to the colour stage; and that the composer writes it.
 */

const CULLS: TCullMode[] = ['back', 'front', 'none'];
const HOOK = 'fn vertex(pos: vec3<f32>, ctx: VertContext) -> vec3<f32> { surfaceNormal = vec3<f32>(0.0, 2.0, 0.0); return pos; }';
const HOOK_GLSL = 'vec3 vertex(vec3 pos, VertContext ctx) { surfaceNormal = vec3(0.0, 2.0, 0.0); return pos; }';

/** Every way a material's corner stage is built, by name, in each language. */
const stages = (): Array<[string, string, string]> => {
    const all: Array<[string, string, string]> = [];
    for (const cull of CULLS) {
        for (const [kind, skinned, instanced] of [['plain', false, false], ['bones', true, false], ['instances', false, true]] as const) {
            all.push([`${kind}, ${cull}`, buildMeshMaterialShader(null, HOOK, {}, [], skinned, cull, instanced), buildMeshMaterialShaderGlsl(null, HOOK_GLSL, {}, [], skinned, cull, instanced).vertex]);
        }
    }
    for (const instanced of [false, true]) {
        all.push([`cut shadow${instanced ? ', instances' : ''}`, buildMeshMaterialShadowShader(HOOK, {}, [], false, { fragment: null }, instanced), buildMeshMaterialShadowShaderGlsl(HOOK_GLSL, {}, [], false, { fragment: null }, instanced).vertex]);
    }
    return all;
};

describe('a facing given by the vertex hook', () => {
    it('has a place in every shader a hook is written into, on both cards', () => {
        for (const [name, wgsl, glsl] of stages()) {
            expect([name, wgsl.includes('var<private> surfaceNormal: vec3<f32>;')]).toEqual([name, true]);
            expect([name, glsl.includes('vec3 surfaceNormal = vec3(0.0);')]).toEqual([name, true]);
        }
    });

    it('is kept from the call at the corner, before the surface is measured again beside it', () => {
        for (const [name, wgsl, glsl] of stages()) {
            const kept = wgsl.indexOf('let given = surfaceNormal;');
            expect([name, kept > wgsl.indexOf('let local = vertex(rest, ctx);')]).toEqual([name, true]);
            expect([name, wgsl.indexOf('vertex(rest + tangent') > kept]).toEqual([name, true]);
            const keptGlsl = glsl.indexOf('vec3 given = surfaceNormal;');
            expect([name, keptGlsl > glsl.indexOf('vec3 local = vertex(rest, ctx);')]).toEqual([name, true]);
            expect([name, glsl.indexOf('vertex(rest + tangent') > keptGlsl]).toEqual([name, true]);
        }
    });

    it('stands in for the measured facing only when it was written, brought back to length one', () => {
        const wgsl = buildMeshMaterialShader(null, HOOK, {});
        const glsl = buildMeshMaterialShaderGlsl(null, HOOK_GLSL, {}).vertex;
        expect(wgsl).toContain('let shaped = select(measured, normalize(given), dot(given, given) > 0.0);');
        expect(glsl).toContain('vec3 shaped = dot(given, given) > 0.0 ? normalize(given) : measured;');
        // And the facing that comes out of it is the one the light and the bones use, as before.
        expect(wgsl).toContain('let facing = shaped;');
        expect(buildMeshMaterialShader(null, HOOK, {}, [], true)).toContain('let facing = facingTurnOf(turn) * shaped;');
    });

    it('leaves a material with no corner hook measuring nothing, and its own facing as it was', () => {
        const wgsl = buildMeshMaterialShader('fn effect(surface: vec4<f32>, ctx: FragContext) -> vec4<f32> { return surface; }', null, {});
        expect(wgsl).toContain('let measured = ctx.normal;');
        expect(wgsl).not.toContain('vertex(rest + tangent');
    });

    it('carries nothing more to the colour stage', () => {
        const outs = (vertex: string) => [...vertex.matchAll(/^\s*out\s+\w+\s+\w+\s*;/gm)].map((m) => m[0].trim());
        const without = 'vec3 vertex(vec3 pos, VertContext ctx) { return pos; }';
        for (const cull of CULLS) {
            expect(outs(buildMeshMaterialShaderGlsl(null, HOOK_GLSL, {}, [], false, cull).vertex))
                .toEqual(outs(buildMeshMaterialShaderGlsl(null, without, {}, [], false, cull).vertex));
        }
    });
});

describe('a facing in the shader composer', () => {
    it('is written with the corner, in both languages, after what is carried', () => {
        const compiled = compileShader({
            shader: 'mesh3d',
            position: composerVertexPosition(),
            carry: composerX(composerUv()),
            normal: composerVec3(0, 1, 0),
        });
        expect(compiled.vertex).toContain('surfaceNormal = vec3<f32>(0.0, 1.0, 0.0);');
        expect(compiled.vertexGlsl).toContain('surfaceNormal = vec3(0.0, 1.0, 0.0);');
        expect(compiled.vertex!.indexOf('carry =')).toBeLessThan(compiled.vertex!.indexOf('surfaceNormal ='));
    });

    it('needs no corner moved: the corner then stays where it is', () => {
        const compiled = compileShader({ shader: 'mesh3d', normal: composerVec3(0, 1, 0) });
        expect(compiled.vertex).toContain('surfaceNormal = vec3<f32>(0.0, 1.0, 0.0);');
        expect(compiled.vertex).toContain('return pos;');
    });

    it('is refused where there is no vertex stage, or as anything but a vec3', () => {
        expect(() => compileShader({ shader: 'sprite2d', color: composerSurface(), normal: composerVec3(0, 1, 0) } as never))
            .toThrow('a sprite2d shader has no vertex stage, so it takes no "normal"');
        expect(() => compileShader({ shader: 'mesh3d', normal: composerAdd(composerUv(), 1) }))
            .toThrow('"normal" must be a vec3, got a vec2<f32>');
    });

    it('is wired in a graph file to its own output, alone if need be', () => {
        const doc = {
            format: SHADER_GRAPH_FORMAT,
            kind: 'shadergraph',
            target: 'mesh3d',
            nodes: [
                { id: 'n', type: 'vertexNormal', pos: [0, 0] },
                { id: 'out', type: 'output.normal', pos: [0, 0] },
            ],
            edges: [{ from: 'n', out: 'value', to: 'out', in: 'normal' }],
        } as TShaderGraphDoc;
        const compiled = compileShaderGraph(doc);
        expect(compiled.vertex).toContain('surfaceNormal = ctx.normal;');
        expect(compiled.vertexGlsl).toContain('surfaceNormal = ctx.normal;');
    });
});
