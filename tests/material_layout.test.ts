import { describe, expect, it } from 'bun:test';
import { buildSpriteMaterialShader } from '../src/render/webgpu/material/sprite_material_shader';
import { buildSpriteMaterialShaderGlsl } from '../src/render/webgl2/material/sprite_material_shader';
import { buildMeshMaterialShader } from '../src/render/webgpu/material/mesh_material_shader';
import { buildMeshMaterialShaderGlsl } from '../src/render/webgl2/material/mesh_material_shader';
import { MESH_SHADER_FRAGMENT } from '../src/render/webgpu/mesh/mesh_shader';
import { SPRITE_SHADER_HEAD, SPRITE_SHADER } from '../src/render/webgpu/sprite/sprite_shader';
import { SPRITE_FRAGMENT_SHADER, SPRITE_VERTEX_SHADER } from '../src/render/webgl2/sprite/sprite_shader';
import { buildUniformLayout } from '../src/render/shared/material_uniforms';
import type { TUniformSignature } from '../src/materials';

/**
 * The two texts a material turns into, one per card.
 *
 * They are written apart, in two languages, and they have to say the same thing. What can drift is
 * the parameter block: one of them gaining a member, or the same members in another order, and
 * either would be read as whatever number happened to be at that offset. So the members are
 * compared as text, which is the only place the two say it separately.
 */

/**
 * The member names a block declares, in order, from either language.
 */
const membersOf = (source: string, block: string): string[] => {
    const body = source.split(block)[1]!.split('}')[0]!;
    return [...body.matchAll(/(?:^|\n)\s*(?:(\w+)\s+(\w+)|(\w+)\s*:\s*[\w<>,\s]+)\s*[;,]/g)]
        .map((m) => m[2] ?? m[3])
        .filter((name): name is string => name !== undefined);
};

const SIG: TUniformSignature = { strength: 'f32', rim: 'vec4<f32>' };
const HOOK = 'fn effect(color: vec4f, uv: vec2f) -> vec4f { return color * mu.strength; }';
const HOOK_GLSL = 'vec4 effect(vec4 color, vec2 uv) { return color * mu.strength; }';

describe('the two sprite material shaders', () => {
    it('declares the same parameters, in the same order, in both languages', () => {
        const wgsl = membersOf(buildSpriteMaterialShader(HOOK, SIG), 'struct MaterialUniforms {');
        const glsl = membersOf(buildSpriteMaterialShaderGlsl(HOOK_GLSL, SIG).fragment, 'uniform MaterialUniforms {');

        expect(glsl).toEqual(wgsl);
        expect(wgsl).toEqual(['time', 'resolution', 'strength', 'rim']);
    });

    it('declares them in the order the numbers were laid out, not some other order', () => {
        const { offsets } = buildUniformLayout(SIG);
        const declared = membersOf(buildSpriteMaterialShader(HOOK, SIG), 'struct MaterialUniforms {');

        // Sorted by where each one actually sits, the declaration has to come out unchanged.
        expect([...declared].sort((a, b) => offsets[a]! - offsets[b]!)).toEqual(declared);
    });

    it('begins with the very same preamble the built-in shader does, not a copy of it', () => {
        expect(buildSpriteMaterialShader(HOOK, SIG).startsWith(SPRITE_SHADER_HEAD)).toBe(true);
        expect(SPRITE_SHADER.startsWith(SPRITE_SHADER_HEAD)).toBe(true);
    });

    it('leaves the vertex half of the built-in alone, because a flat square has nothing to move', () => {
        expect(buildSpriteMaterialShaderGlsl(HOOK_GLSL, SIG).vertex).toBe(SPRITE_VERTEX_SHADER);
    });

    it('puts the author hook in whole, and after everything it can read', () => {
        const wgsl = buildSpriteMaterialShader(HOOK, SIG);
        const glsl = buildSpriteMaterialShaderGlsl(HOOK_GLSL, SIG).fragment;

        expect(wgsl).toContain(HOOK);
        expect(glsl).toContain(HOOK_GLSL);
        // GLSL insists a thing is declared before it is used, and the block and the helper are both
        // things the hook may use.
        expect(glsl.indexOf('uniform MaterialUniforms')).toBeLessThan(glsl.indexOf(HOOK_GLSL));
        expect(glsl.indexOf('vec4 sampleTexture')).toBeLessThan(glsl.indexOf(HOOK_GLSL));
        expect(glsl.indexOf(HOOK_GLSL)).toBeLessThan(glsl.indexOf('void main()'));
    });

    it('hands the hook the sheet already read and already tinted, as the built-in would have drawn it', () => {
        const wgsl = buildSpriteMaterialShader(HOOK, SIG);
        const glsl = buildSpriteMaterialShaderGlsl(HOOK_GLSL, SIG).fragment;

        expect(wgsl).toContain('effect(sampleTexture(insideWindow(in.uv, in.window)) * in.tint, in.uv)');
        expect(glsl).toContain('effect(sampleTexture(insideWindow(vUv, vWindow)) * vTint, vUv)');
        // Which is the same read the built-in ending does on its own, kept inside the sprite's own
        // window in the sheet exactly the same way. If only one of the two clamped, a sprite would
        // show the frame next door along its edge as soon as it was given an effect, and the line
        // above would stop being true without anything saying so.
        expect(SPRITE_FRAGMENT_SHADER).toContain('texture(spriteTexture, insideWindow(vUv, vWindow)) * vTint');
    });

    it('says version and precision first, which GLSL will not take anywhere else', () => {
        const glsl = buildSpriteMaterialShaderGlsl(HOOK_GLSL, SIG).fragment;

        expect(glsl.startsWith('#version 300 es\nprecision highp float;')).toBe(true);
    });
});

describe('the two model material shaders', () => {
    const MESH_SIG: TUniformSignature = { bands: 'f32', rim: 'vec4<f32>' };
    const FRAG = 'fn effect(surface: vec4<f32>, ctx: FragContext) -> vec4<f32> { return surface; }';
    const FRAG_GLSL = 'vec4 effect(vec4 surface, FragContext ctx) { return surface; }';
    const VERT = 'fn vertex(pos: vec3<f32>, ctx: VertContext) -> vec3<f32> { return pos; }';
    const VERT_GLSL = 'vec3 vertex(vec3 pos, VertContext ctx) { return pos; }';

    it('declares the same parameters in both languages', () => {
        const wgsl = membersOf(buildMeshMaterialShader(FRAG, null, MESH_SIG), 'struct MaterialUniforms {');
        const glsl = membersOf(
            buildMeshMaterialShaderGlsl(FRAG_GLSL, null, MESH_SIG).fragment,
            'uniform MaterialUniforms {',
        );

        expect(glsl).toEqual(wgsl);
        expect(wgsl).toEqual(['time', 'resolution', 'bands', 'rim']);
    });

    it('tells the hooks the same things, in the same order', () => {
        const wgsl = buildMeshMaterialShader(FRAG, VERT, MESH_SIG);
        const glsl = buildMeshMaterialShaderGlsl(FRAG_GLSL, VERT_GLSL, MESH_SIG);

        expect(membersOf(glsl.fragment, 'struct FragContext {'))
            .toEqual(membersOf(wgsl, 'struct FragContext {'));
        expect(membersOf(glsl.vertex, 'struct VertContext {'))
            .toEqual(membersOf(wgsl, 'struct VertContext {'));
        expect(membersOf(wgsl, 'struct FragContext {'))
            .toEqual(['uv', 'normal', 'worldPos', 'light', 'shine', 'emissive', 'viewDir', 'color']);
    });

    it('stands in for a hook that was not written, and says what the engine would have said', () => {
        // No colour hook: the engine's own has to reproduce the built-in ending exactly, or a
        // material that only moves corners would come out a different colour than before.
        const wgsl = buildMeshMaterialShader(null, VERT, MESH_SIG);
        const glsl = buildMeshMaterialShaderGlsl(null, VERT_GLSL, MESH_SIG).fragment;

        expect(wgsl).toContain('surface.rgb * ctx.light + ctx.shine + ctx.emissive');
        expect(glsl).toContain('surface.rgb * ctx.light + ctx.shine + ctx.emissive');
        // And the built-in ending really does add those three the same way.
        expect(MESH_SHADER_FRAGMENT).toContain('color.rgb + shine + uniforms.emissive.rgb');
    });

    it('only measures the surface again when a corner hook actually moved it', () => {
        const without = buildMeshMaterialShader(FRAG, null, MESH_SIG);
        const with_ = buildMeshMaterialShader(FRAG, VERT, MESH_SIG);

        expect(without).not.toContain('tangent');
        expect(with_).toContain('tangent');
        // Without one, the surface is left exactly as the model gave it.
        expect(without).toContain('let shaped = ctx.normal;');
    });

    it('swaps the branches between select and a ternary, which is the easy one to get wrong', () => {
        const wgsl = buildMeshMaterialShader(FRAG, VERT, MESH_SIG);
        const glsl = buildMeshMaterialShaderGlsl(FRAG_GLSL, VERT_GLSL, MESH_SIG).vertex;

        // WGSL's select takes the FALSE value first.
        expect(wgsl).toContain('select(vec3<f32>(0.0, 1.0, 0.0), vec3<f32>(1.0, 0.0, 0.0), abs(ctx.normal.y) > 0.9)');
        // A ternary takes the TRUE one, so the same rule reads the other way round.
        expect(glsl).toContain('abs(ctx.normal.y) > 0.9 ? vec3(1.0, 0.0, 0.0) : vec3(0.0, 1.0, 0.0)');
    });

    it('never lets a model that bends also take a corner hook, on either card', () => {
        // Nothing in the material shaders knows about bones: the two paths are separate pipelines,
        // and the draw picks the bending one first. Pinned here because it is a rule, not an
        // accident of what has been written so far.
        const wgsl = buildMeshMaterialShader(FRAG, VERT, MESH_SIG);

        expect(wgsl).not.toContain('joints');
    });
});
