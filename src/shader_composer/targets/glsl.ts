import type { TUniformType } from '../../materials/types/t_uniforms';
import type { TInputKind } from '../types/t_composer_node';
import type { TShaderTarget, TStageCtx } from '../types/t_shader_target';

/**
 * The engine's type names in GLSL. They are WGSL's everywhere else (scene files, `@uniform`
 * headers), because they are the engine's names rather than one backend's, and this is where they
 * become GLSL.
 */
const GLSL_TYPE: Record<TUniformType, string> = {
    'f32': 'float',
    'vec2<f32>': 'vec2',
    'vec3<f32>': 'vec3',
    'vec4<f32>': 'vec4',
};

/**
 * What each leaf reads in GLSL, per stage. The same as the WGSL table but for the vector spelling:
 * the hooks take the same `ctx` in both languages here.
 */
const INPUT_SOURCE: Record<TInputKind, Partial<Record<TStageCtx, string>>> = {
    uv:             { 'sprite2d.frag': 'uv', 'mesh3d.frag': 'ctx.uv', 'mesh3d.vert': 'ctx.uv', 'preview.frag': 'uv' },
    time:           { 'sprite2d.frag': 'mu.time', 'mesh3d.frag': 'mu.time', 'mesh3d.vert': 'mu.time', 'preview.frag': 'mu.time' },
    resolution:     { 'sprite2d.frag': 'mu.resolution', 'mesh3d.frag': 'mu.resolution', 'mesh3d.vert': 'mu.resolution', 'preview.frag': 'mu.resolution' },
    surface:        { 'sprite2d.frag': 'color', 'mesh3d.frag': 'surface', 'preview.frag': 'color' },
    worldNormal:    { 'mesh3d.frag': 'ctx.normal', 'preview.frag': 'sgPreviewNormal(uv)' },
    worldPos:       { 'mesh3d.frag': 'ctx.worldPos', 'preview.frag': 'sgPreviewPos(uv)' },
    viewDir:        { 'mesh3d.frag': 'ctx.viewDir', 'preview.frag': 'vec3(0.0, 0.0, 1.0)' },
    light:          { 'mesh3d.frag': 'ctx.light', 'preview.frag': 'sgPreviewLight(uv)' },
    emissive:       { 'mesh3d.frag': 'ctx.emissive', 'preview.frag': 'vec3(0.0, 0.0, 0.0)' },
    shine:          { 'mesh3d.frag': 'ctx.shine', 'preview.frag': 'vec3(0.0, 0.0, 0.0)' },
    envUv:          { 'mesh3d.frag': 'envUv(ctx)', 'preview.frag': 'uv' },
    vertexPosition: { 'mesh3d.vert': 'pos', 'preview.frag': 'sgPreviewPos(uv)' },
    vertexNormal:   { 'mesh3d.vert': 'ctx.normal', 'preview.frag': 'sgPreviewNormal(uv)' },
    vertexColor:    { 'mesh3d.frag': 'ctx.color', 'mesh3d.vert': 'ctx.color', 'preview.frag': 'vec4(1.0, 1.0, 1.0, 1.0)' },
};

/**
 * The GLSL twin of the WGSL preview surface: the same sphere and the same fixed lamp.
 */
const PREVIEW_PRELUDE = /* glsl */ `
vec3 sgPreviewPos(vec2 uv) {
    vec2 p = uv * 2.0 - 1.0;
    return vec3(p.x, -p.y, 0.0);
}

vec3 sgPreviewNormal(vec2 uv) {
    vec2 p = uv * 2.0 - 1.0;
    // Outside the sphere the z term clamps to 0, so the normal turns to face sideways rather
    // than becoming NaN, and the corners of the square stay drawable.
    float z = sqrt(max(0.0, 1.0 - min(dot(p, p), 1.0)));
    return normalize(vec3(p.x, -p.y, z + 0.0001));
}

vec3 sgPreviewLight(vec2 uv) {
    vec3 n = sgPreviewNormal(uv);
    vec3 l = normalize(vec3(0.4, 0.7, 0.6));
    return vec3(0.15) + vec3(max(dot(n, l), 0.0));
}`;

/**
 * GLSL ES 3.00, the language WebGL2 compiles.
 *
 * Two things keep this a short file instead of a second compiler. Every built-in function a node
 * can call (`clamp`, `cross`, `dot`, `mix`, `smoothstep`...) is spelled the same in both languages,
 * so calls need no translation. And the values are typed, so the one thing GLSL needs that WGSL
 * does not, a type on every local, is already there to read.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const GLSL_TARGET: TShaderTarget = {
    language: 'glsl',
    type: (t) => GLSL_TYPE[t],
    // GLSL has no `let`: a local needs its type, which the value carries.
    declare: (type, name, expr) => `    ${GLSL_TYPE[type]} ${name} = ${expr};`,
    fn: (stage, lines, result) => {
        const sig = stage === 'sprite2d.frag'
            ? 'vec4 effect(vec4 color, vec2 uv)'
            : stage === 'mesh3d.vert'
                ? 'vec3 vertex(vec3 pos, VertContext ctx)'
                : 'vec4 effect(vec4 surface, FragContext ctx)';
        return `${sig} {\n${lines.join('\n')}${lines.length ? '\n' : ''}    return ${result};\n}`;
    },
    input: (kind, stage) => INPUT_SOURCE[kind][stage],
    previewPrelude: PREVIEW_PRELUDE,
};
