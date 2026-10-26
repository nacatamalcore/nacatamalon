import { describe, expect, it } from 'bun:test';
import { buildMeshMaterialShader, buildMeshMaterialShadowShader } from '../src/render/webgpu/material/mesh_material_shader';
import { buildMeshMaterialShaderGlsl, buildMeshMaterialShadowShaderGlsl } from '../src/render/webgl2/material/mesh_material_shader';
import { compileShader } from '../src/shader_composer/compile_shader';
import { compileShaderGraph } from '../src/shader_composer/compile_shader_graph';
import { SHADER_GRAPH_FORMAT } from '../src/shader_composer/document';
import {
    composerAdd, composerCarry, composerMix, composerMul, composerSin, composerSmoothstep, composerSurface, composerTime,
    composerUv, composerVec4, composerVertexNormal, composerVertexPosition, composerX,
} from '../src/shader_composer';
import type { TCullMode } from '../src/materials';
import type { TShaderGraphDoc } from '../src/shader_composer/types/t_shader_graph_doc';

/**
 * `carry`: four numbers a model material's vertex hook hands on to its colour hook.
 *
 * The smearing across the triangle is the card's; what is pinned here is that every shader a hook
 * is written into has somewhere to put it, keeps it before the surface is measured again, and hands
 * it on in a place no other value takes, within what a card promises, and that the shader composer
 * writes it with the corner from one graph.
 */

const CULLS: TCullMode[] = ['back', 'front', 'none'];
const HOOK = 'fn vertex(pos: vec3<f32>, ctx: VertContext) -> vec3<f32> { carry = vec4<f32>(pos, 1.0); return pos; }';
const HOOK_GLSL = 'vec3 vertex(vec3 pos, VertContext ctx) { carry = vec4(pos, 1.0); return pos; }';
const EFFECT = 'fn effect(surface: vec4<f32>, ctx: FragContext) -> vec4<f32> { return vec4<f32>(surface.rgb, ctx.carry.w); }';
const EFFECT_GLSL = 'vec4 effect(vec4 surface, FragContext ctx) { return vec4(surface.rgb, ctx.carry.w); }';

/**
 * The places a struct hands across, by name.
 */
const placesOf = (wgsl: string, struct: string): Map<string, number> => {
    const body = wgsl.slice(wgsl.indexOf(`struct ${struct} {`));
    const fields = body.slice(0, body.indexOf('};'));
    return new Map([...fields.matchAll(/@location\((\d+)\) (\w+):/g)].map((m) => [m[2], Number(m[1])]));
};

describe('what a vertex hook carries to the colour hook, on WebGPU', () => {
    it('has a place of its own in every way a model is drawn, within what a card promises', () => {
        for (const skinned of [false, true]) {
            for (const cull of CULLS) {
                const wgsl = buildMeshMaterialShader(EFFECT, HOOK, {}, [], skinned, cull);
                const places = placesOf(wgsl, 'VertexOutput');
                expect(places.get('carry')).toBe(9);
                // No two values in one place, and room left for which side is drawn.
                expect(new Set(places.values()).size).toBe(places.size);
                expect(places.size).toBeLessThanOrEqual(15);
                expect(Math.max(...places.values())).toBeLessThanOrEqual(15);
            }
        }
    });

    it('is kept before the surface is measured again, and handed on to ctx.carry', () => {
        const wgsl = buildMeshMaterialShader(EFFECT, HOOK, {}, [], false, 'back');
        expect(wgsl).toContain('var<private> carry: vec4<f32>;');
        const kept = wgsl.indexOf('let carried = carry;');
        expect(kept).toBeGreaterThan(wgsl.indexOf('let local = vertex(position, ctx);'));
        // The hook is called twice more to measure the moved surface, after it was kept.
        expect(wgsl.indexOf('vertex(position + tangent')).toBeGreaterThan(kept);
        expect(wgsl).toContain('out.carry = carried;');
        expect(wgsl).toContain('ctx.carry = in.carry;');
    });

    it('takes the fog into the world position\'s fourth number to make its room', () => {
        const wgsl = buildMeshMaterialShader(EFFECT, HOOK, {}, [], false, 'none');
        expect(wgsl).toContain('out.worldPos = vec4<f32>(worldPos, fogAt(worldPos));');
        expect(wgsl).toContain('mix(shaded.rgb, lights.fog.rgb, in.worldPos.w)');
        expect(placesOf(wgsl, 'VertexOutput').has('fog')).toBe(false);
    });

    it('is there to write in the shadow, and carried to the colour stage of one cut out', () => {
        expect(buildMeshMaterialShadowShader(HOOK, {}, [], false)).toContain('var<private> carry: vec4<f32>;');
        const cut = buildMeshMaterialShadowShader(HOOK, {}, [], true, { fragment: EFFECT });
        expect(placesOf(cut, 'CutOutput').get('carry')).toBe(6);
        expect(cut).toContain('out.carry = carried;');
        expect(cut).toContain('ctx.carry = in.carry;');
    });
});

describe('what a vertex hook carries to the colour hook, on WebGL2', () => {
    it('is declared, kept and handed on in both halves of every program', () => {
        for (const skinned of [false, true]) {
            for (const cull of CULLS) {
                const { vertex, fragment } = buildMeshMaterialShaderGlsl(EFFECT_GLSL, HOOK_GLSL, {}, [], skinned, cull);
                expect(vertex).toContain('vec4 carry = vec4(0.0);');
                expect(vertex).toContain('out vec4 vCarry;');
                expect(vertex).toContain('vCarry = carried;');
                expect(vertex.indexOf('vec4 carried = carry;')).toBeGreaterThan(vertex.indexOf('vec3 local = vertex(aPosition, ctx);'));
                expect(fragment).toContain('in vec4 vCarry;');
                expect(fragment).toContain('ctx.carry = vCarry;');
            }
        }
    });

    it('is there in the shadow, and carried in one cut out', () => {
        expect(buildMeshMaterialShadowShaderGlsl(HOOK_GLSL, {}, true).vertex).toContain('vec4 carry = vec4(0.0);');
        const cut = buildMeshMaterialShadowShaderGlsl(HOOK_GLSL, {}, false, { fragment: EFFECT_GLSL, mapNames: [] });
        expect(cut.vertex).toContain('vCarry = carried;');
        expect(cut.fragment).toContain('ctx.carry = vCarry;');
    });
});

describe('carry in the shader composer', () => {
    const lift = () => composerMul(composerSin(composerAdd(composerX(composerVertexPosition()), composerTime())), 0.2);

    it('is written in the vertex hook with the corner, what they share worked out once', () => {
        const height = lift();
        const sea = compileShader({
            shader: 'mesh3d',
            position: composerAdd(composerVertexPosition(), composerMul(composerVertexNormal(), height)),
            carry: height,
            color: composerMix(composerSurface(), composerVec4(1, 1, 1, 1), composerSmoothstep(0.12, 0.2, composerX(composerCarry()))),
        });
        // The wave once, then into carry and into the corner.
        expect(sea.vertex!.match(/sin\(/g)).toHaveLength(1);
        expect(sea.vertex).toMatch(/carry = vec4<f32>\(v\d+, 0\.0, 0\.0, 0\.0\);/);
        expect(sea.vertexGlsl).toMatch(/carry = vec4\(v\d+, 0\.0, 0\.0, 0\.0\);/);
        expect(sea.fragment).toContain('ctx.carry');
        expect(sea.fragmentGlsl).toContain('ctx.carry');
    });

    it('leaves the corner where it is when it carries without moving it, and fills a smaller one with zeros', () => {
        const local = compileShader({ shader: 'mesh3d', carry: composerVertexPosition(), color: composerCarry() });
        expect(local.vertex).toContain('carry = vec4<f32>(pos, 0.0);');
        expect(local.vertex).toContain('return pos;');
        const two = compileShader({ shader: 'mesh3d', carry: composerUv(), color: composerCarry() });
        expect(two.vertex).toContain('carry = vec4<f32>(ctx.uv, 0.0, 0.0);');
    });

    it('is refused where there is no vertex stage, or as more than four numbers, or read outside a model\'s colour', () => {
        expect(() => compileShader({ shader: 'sprite2d', color: composerSurface(), carry: composerUv() as never }))
            .toThrow('a sprite2d shader has no vertex stage, so it carries nothing');
        expect(() => compileShader({ shader: 'sprite2d', color: composerCarry() })).toThrow();
        expect(() => compileShader({ shader: 'mesh3d', position: composerAdd(composerVertexPosition(), composerX(composerCarry())) })).toThrow();
    });

    it('is wired in a graph file to its own output, and read with its own node', () => {
        const doc: TShaderGraphDoc = {
            format: SHADER_GRAPH_FORMAT,
            kind: 'shadergraph',
            target: 'mesh3d',
            nodes: [
                { id: 'p', type: 'vertexPosition', pos: [0, 0] },
                { id: 'outCarry', type: 'output.carry', pos: [0, 0] },
                { id: 'c', type: 'carry', pos: [0, 0] },
                { id: 'outColor', type: 'output.color', pos: [0, 0] },
            ],
            edges: [
                { from: 'p', out: 'value', to: 'outCarry', in: 'carry' },
                { from: 'c', out: 'value', to: 'outColor', in: 'color' },
            ],
        } as TShaderGraphDoc;
        const compiled = compileShaderGraph(doc);
        expect(compiled.vertex).toContain('carry = vec4<f32>(pos, 0.0);');
        expect(compiled.fragment).toContain('ctx.carry');
        expect(compiled.vertexGlsl).toContain('carry = vec4(pos, 0.0);');
    });
});
