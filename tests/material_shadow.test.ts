import { describe, expect, it } from 'bun:test';
import { buildMeshMaterialShader, buildMeshMaterialShadowShader } from '../src/render/webgpu/material/mesh_material_shader';
import { buildMeshMaterialShaderGlsl, buildMeshMaterialShadowShaderGlsl } from '../src/render/webgl2/material/mesh_material_shader';
import { SHADOW_FRAGMENT_GLSL } from '../src/render/webgl2/shadow/shadow_shader';
import { cullOf } from '../src/render/shared/cull_of';
import { compileShader } from '../src/shader_composer/compile_shader';
import { composerAdd, composerFbm, composerMul, composerSimplexNoise, composerUv, composerVec4, composerVertexNormal, composerVertexPosition } from '../src/shader_composer';

/**
 * The shadow of a material that moves its corners.
 *
 * The map used to hold the shape the file made, so a flag waved by its hook cast a flat sheet, and
 * that flat ghost shadowed the cloth wherever the wave took it behind: a dark band across the flag.
 * What is pinned down here is that the shadow says the same thing about a corner as the drawn model
 * does, in both languages; the cards themselves are checked by the scene that waves one.
 */

const HOOK = 'fn vertex(pos: vec3<f32>, ctx: VertContext) -> vec3<f32> { return pos + ctx.normal * sin(mu.time) * mu.amount; }';
const HOOK_GLSL = 'vec3 vertex(vec3 pos, VertContext ctx) { return pos + ctx.normal * sin(mu.time) * mu.amount; }';
const SIG = { amount: 'f32' } as const;

/**
 * The lines between two markers, to compare what two shaders tell a hook.
 */
const between = (text: string, from: string, to: string): string => {
    const start = text.indexOf(from);
    return text.slice(start, text.indexOf(to, start));
};

describe('the shadow of a material that moves its corners', () => {
    it('moves each corner with the same hook, told the same things, as the drawn model', () => {
        for (const skinned of [false, true]) {
            const drawn = buildMeshMaterialShader(null, HOOK, SIG, [], skinned);
            const shadow = buildMeshMaterialShadowShader(HOOK, SIG, [], skinned);
            expect(shadow).toContain(HOOK);
            expect(between(shadow, 'var ctx: VertContext;', 'let local')).toBe(between(drawn, 'var ctx: VertContext;', 'let local'));
            expect(between(shadow, 'struct MaterialUniforms', '};')).toBe(between(drawn, 'struct MaterialUniforms', '};'));
            expect(shadow).toContain('@group(3) @binding(0) var<uniform> mu: MaterialUniforms;');
            expect(shadow).toContain('return shadow.lightViewProj * shadow.model * placed;');
            // Nothing is lit or coloured: no fragment, no lights.
            expect(shadow).not.toContain('@fragment');
            expect(shadow).not.toContain('litBy');
        }
    });

    it('bends a model that bends after the hook, as the drawn one does', () => {
        const shadow = buildMeshMaterialShadowShader(HOOK, SIG, [], true);
        expect(shadow).toContain('var<storage, read> joints: array<mat4x4<f32>>');
        expect(shadow).toContain('let placed = skin * vec4<f32>(local, 1.0);');
        expect(buildMeshMaterialShadowShader(HOOK, SIG, [], false)).not.toContain('joints');
    });

    it('can read the material\'s maps, which sit in its own group there as here', () => {
        expect(buildMeshMaterialShadowShader(HOOK, SIG, ['noise'], false)).toContain('fn sampleMap_noise(uv: vec2<f32>) -> vec4<f32>');
    });

    it('says the same on the other card', () => {
        for (const skinned of [false, true]) {
            const drawn = buildMeshMaterialShaderGlsl(null, HOOK_GLSL, SIG, [], skinned).vertex;
            const shadow = buildMeshMaterialShadowShaderGlsl(HOOK_GLSL, SIG, skinned);
            expect(shadow.vertex).toContain(HOOK_GLSL);
            expect(between(shadow.vertex, 'VertContext ctx;', 'vec3 local')).toBe(between(drawn, 'VertContext ctx;', 'vec3 local'));
            expect(between(shadow.vertex, 'uniform MaterialUniforms', '} mu;')).toBe(between(drawn, 'uniform MaterialUniforms', '} mu;'));
            expect(shadow.vertex).toContain('gl_Position = uLightViewProj * uModel * placed;');
            expect(shadow.fragment).toBe(SHADOW_FRAGMENT_GLSL);
        }
        expect(buildMeshMaterialShadowShaderGlsl(HOOK_GLSL, SIG, true).vertex).toContain('vec4 placed = skin * vec4(local, 1.0);');
    });
});

describe('a composed shader\'s shadow', () => {
    it('brings the helpers its corner hook calls, so the shadow can be drawn with that hook alone', () => {
        const compiled = compileShader({
            shader: 'mesh3d',
            color: composerVec4(composerFbm(composerUv(), 3), 0, 0, 1),
            position: composerAdd(composerVertexPosition(), composerMul(composerVertexNormal(), composerSimplexNoise(composerVertexPosition()))),
        });
        const shadow = buildMeshMaterialShadowShader(compiled.vertex!, {}, [], false);
        expect(shadow).toContain('fn sgNoise3(');
        expect(buildMeshMaterialShadowShaderGlsl(compiled.vertexGlsl!, {}, false).vertex).toContain('float sgNoise3(');
    });
});

describe('the shadow on the other card', () => {
    it('declares none of the drawn model\'s blocks, so a hook cannot read another model\'s numbers', () => {
        const shadow = buildMeshMaterialShadowShaderGlsl(HOOK_GLSL, SIG, false).vertex;
        expect(shadow).not.toContain('uniform Uniforms');
        expect(shadow).not.toContain('uniform Lights');
    });
});

describe('a side that is not one of the three', () => {
    it('draws as the usual side on both cards', () => {
        const mesh = (cull: unknown) => ({ material: { cull } }) as never;
        expect(cullOf(mesh('both'))).toBe('back');
        expect(cullOf(mesh(undefined))).toBe('back');
        expect(cullOf(mesh('none'))).toBe('none');
        expect(cullOf(mesh('front'))).toBe('front');
    });
});

describe('the shadow of a material cut out of its picture', () => {
    const EFFECT = 'fn effect(surface: vec4<f32>, ctx: FragContext) -> vec4<f32> { return vec4<f32>(surface.rgb, step(0.5, fract(ctx.uv.x * 4.0 + mu.amount))); }';
    const EFFECT_GLSL = 'vec4 effect(vec4 surface, FragContext ctx) { return vec4(surface.rgb, step(0.5, fract(ctx.uv.x * 4.0 + mu.amount))); }';

    it('cuts by the alpha its colour hook makes, with no corner hook of its own', () => {
        const shadow = buildMeshMaterialShadowShader(null, SIG, [], false, { fragment: EFFECT });
        expect(shadow).toContain(EFFECT);
        expect(shadow).toContain('fn vertex(pos: vec3<f32>, ctx: VertContext) -> vec3<f32> {\n    return pos;');
        expect(shadow).toContain('@fragment\nfn fs(in: CutOutput, @builtin(front_facing) front: bool) {');
        expect(shadow).toContain('let shaded = effect(sampleTexture(in.uv) * vec4<f32>(1.0, 1.0, 1.0, shadow.cut.y) * in.color, ctx);');
        expect(shadow).toMatch(/if \(shaded\.a < shadow\.cut\.x\) \{\s*discard;/);
        // Its picture where the drawn model reads it, and its block telling how it is cut.
        expect(shadow).toContain('@group(1) @binding(1) var meshTexture: texture_2d<f32>;');
        expect(shadow).toContain('cut: vec4<f32>,');
    });

    it('cuts a model its corner hook moves by its picture, as the built-in ending would', () => {
        const shadow = buildMeshMaterialShadowShader(HOOK, SIG, [], true, { fragment: null });
        expect(shadow).toContain(HOOK);
        expect(shadow).toContain('return vec4<f32>(surface.rgb * ctx.light + ctx.shine + ctx.emissive, surface.a);');
        expect(shadow).toContain('let turn = mat3x3<f32>(skin[0].xyz, skin[1].xyz, skin[2].xyz);');
        // The usual one, when nothing is cut, is what it was: no colour stage.
        expect(buildMeshMaterialShadowShader(HOOK, SIG, [], false)).not.toContain('@fragment');
    });

    it('hands the colour hook the facing the drawn model has, a model stretched unevenly too', () => {
        // The drawn model's facing is turned by its normal matrix, the inverse of its placement
        // flipped; the shadow works the same out of its placement, on both cards.
        for (const skinned of [false, true]) {
            const shadow = buildMeshMaterialShadowShader(null, SIG, [], skinned, { fragment: EFFECT });
            expect(shadow).toContain('fn facingTurnOf(m: mat3x3<f32>) -> mat3x3<f32> {');
            expect(shadow).toContain(skinned
                ? 'out.normal = normalize(facingTurnOf(place) * (facingTurnOf(turn) * shaped));'
                : 'out.normal = normalize(facingTurnOf(place) * shaped);');
            const glsl = buildMeshMaterialShadowShaderGlsl(null, SIG, skinned, { fragment: EFFECT_GLSL, mapNames: [] });
            expect(glsl.vertex).toContain('mat3 facingTurnOf(mat3 m) {');
            expect(glsl.vertex).toContain(skinned
                ? 'vNormal = normalize(facingTurnOf(mat3(uModel)) * (facingTurnOf(turn) * shaped));'
                : 'vNormal = normalize(facingTurnOf(mat3(uModel)) * shaped);');
            // Declared once, whether the bones bring it or the shadow does.
            expect(glsl.vertex.split('mat3 facingTurnOf(').length).toBe(2);
            expect(shadow.split('fn facingTurnOf(').length).toBe(2);
        }
        // A shadow that cuts nothing has no facing to work out.
        expect(buildMeshMaterialShadowShader(null, SIG, [], false)).not.toContain('facingTurnOf');
        expect(buildMeshMaterialShadowShaderGlsl(null, SIG, false).vertex).not.toContain('facingTurnOf');
    });

    it('reads the maps its colour hook reads', () => {
        expect(buildMeshMaterialShadowShader(null, SIG, ['noise'], false, { fragment: EFFECT })).toContain('fn sampleMap_noise(uv: vec2<f32>) -> vec4<f32>');
    });

    it('says the same on the other card', () => {
        for (const skinned of [false, true]) {
            const shadow = buildMeshMaterialShadowShaderGlsl(null, SIG, skinned, { fragment: EFFECT_GLSL, mapNames: ['noise'] });
            expect(shadow.vertex).toContain('vec3 vertex(vec3 pos, VertContext ctx) {\n    return pos;');
            expect(shadow.fragment).toContain(EFFECT_GLSL);
            expect(shadow.fragment).toContain('vec4 shaded = effect(sampleTexture(vUv) * vec4(1.0, 1.0, 1.0, uCut.y) * vColor, ctx);');
            expect(shadow.fragment).toMatch(/if \(shaded\.a < uCut\.x\) \{\s*discard;/);
            expect(shadow.fragment).toContain('vec4 sampleMap_noise(vec2 uv)');
            expect(shadow.vertex).toContain(skinned ? 'mat3 turn = mat3(skin);' : 'mat3 turn = mat3(1.0);');
        }
        expect(buildMeshMaterialShadowShaderGlsl(HOOK_GLSL, SIG, false).fragment).toBe(SHADOW_FRAGMENT_GLSL);
    });
});

describe('the shadow a material receives', () => {
    // A hook is not told about the map: the light it is handed is already darkened where the casting
    // light cannot see. Every side, still or bending, on both cards.
    const CULLS = ['back', 'front', 'none'] as const;

    it('hands the colour hook its light and its shine through the map', () => {
        for (const cull of CULLS) {
            for (const skinned of [false, true]) {
                const wgsl = buildMeshMaterialShader(null, null, {}, [], skinned, cull);
                expect(wgsl).toContain('let coord = shadowCoordOf(in.worldPos.xyz);');
                expect(wgsl).toMatch(/let lit = max\(litWithShadow\([^)]*, coord\), lights\.ambient\.rgb\);/);
                expect(wgsl).toContain('ctx.light = lit;');
                expect(wgsl).toMatch(/ctx\.shine = litWithShadow\([^)]*, coord\);/);

                const glsl = buildMeshMaterialShaderGlsl(null, null, {}, [], skinned, cull).fragment;
                expect(glsl).toContain('vec4 coord = shadowCoordOf(vWorldPos);');
                expect(glsl).toMatch(/vec3 lit = max\(litWithShadow\([^)]*, coord\), lights\.ambient\.rgb\);/);
                expect(glsl).toContain('ctx.light = lit;');
                expect(glsl).toMatch(/ctx\.shine = litWithShadow\([^)]*, coord\);/);
            }
        }
    });
});
