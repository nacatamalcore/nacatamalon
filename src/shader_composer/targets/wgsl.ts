import type { TInputKind } from '../types/t_composer_node';
import type { TShaderTarget, TStageCtx } from '../types/t_shader_target';

/**
 * What each leaf reads in WGSL, per stage. A stage missing from a row is a stage where that leaf
 * does not exist, and the compiler refuses it there.
 */
const INPUT_SOURCE: Record<TInputKind, Partial<Record<TStageCtx, string>>> = {
    uv:             { 'sprite2d.frag': 'uv', 'mesh3d.frag': 'ctx.uv', 'mesh3d.vert': 'ctx.uv', 'preview.frag': 'uv' },
    time:           { 'sprite2d.frag': 'mu.time', 'mesh3d.frag': 'mu.time', 'mesh3d.vert': 'mu.time', 'preview.frag': 'mu.time' },
    resolution:     { 'sprite2d.frag': 'mu.resolution', 'mesh3d.frag': 'mu.resolution', 'mesh3d.vert': 'mu.resolution', 'preview.frag': 'mu.resolution' },
    surface:        { 'sprite2d.frag': 'color', 'mesh3d.frag': 'surface', 'preview.frag': 'color' },
    worldNormal:    { 'mesh3d.frag': 'ctx.normal', 'preview.frag': 'sgPreviewNormal(uv)' },
    worldPos:       { 'mesh3d.frag': 'ctx.worldPos', 'preview.frag': 'sgPreviewPos(uv)' },
    viewDir:        { 'mesh3d.frag': 'ctx.viewDir', 'preview.frag': 'vec3<f32>(0.0, 0.0, 1.0)' },
    light:          { 'mesh3d.frag': 'ctx.light', 'preview.frag': 'sgPreviewLight(uv)' },
    emissive:       { 'mesh3d.frag': 'ctx.emissive', 'preview.frag': 'vec3<f32>(0.0, 0.0, 0.0)' },
    shine:          { 'mesh3d.frag': 'ctx.shine', 'preview.frag': 'vec3<f32>(0.0, 0.0, 0.0)' },
    envUv:          { 'mesh3d.frag': 'envUv(ctx)', 'preview.frag': 'uv' },
    vertexPosition: { 'mesh3d.vert': 'pos', 'preview.frag': 'sgPreviewPos(uv)' },
    vertexNormal:   { 'mesh3d.vert': 'ctx.normal', 'preview.frag': 'sgPreviewNormal(uv)' },
    vertexColor:    { 'mesh3d.frag': 'ctx.color', 'mesh3d.vert': 'ctx.color', 'preview.frag': 'vec4<f32>(1.0, 1.0, 1.0, 1.0)' },
};

/**
 * The pretend surface a node's small picture is shaded on: a sphere seen head on, worked out from
 * the square's coordinate and lit by one fixed lamp. A sphere rather than the flat square, because
 * a normal, a rim or a light is the same everywhere on a flat square and would show as one colour.
 */
const PREVIEW_PRELUDE = /* wgsl */ `
fn sgPreviewPos(uv: vec2<f32>) -> vec3<f32> {
    let p = uv * 2.0 - 1.0;
    return vec3<f32>(p.x, -p.y, 0.0);
}

fn sgPreviewNormal(uv: vec2<f32>) -> vec3<f32> {
    let p = uv * 2.0 - 1.0;
    // Outside the sphere the z term clamps to 0, so the normal turns to face sideways
    // rather than becoming NaN, and the corners of the square stay drawable.
    let z = sqrt(max(0.0, 1.0 - min(dot(p, p), 1.0)));
    return normalize(vec3<f32>(p.x, -p.y, z + 0.0001));
}

fn sgPreviewLight(uv: vec2<f32>) -> vec3<f32> {
    let n = sgPreviewNormal(uv);
    let l = normalize(vec3<f32>(0.4, 0.7, 0.6));
    return vec3<f32>(0.15) + vec3<f32>(max(dot(n, l), 0.0));
}`;

/**
 * WGSL, the language WebGPU compiles, and the one the GLSL target is checked against.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const WGSL_TARGET: TShaderTarget = {
    language: 'wgsl',
    // The engine's own type names are WGSL's, so there is nothing to translate.
    type: (t) => t,
    declare: (_type, name, expr) => `    let ${name} = ${expr};`,
    fn: (stage, lines, result) => {
        const sig = stage === 'sprite2d.frag'
            ? 'fn effect(color: vec4<f32>, uv: vec2<f32>) -> vec4<f32>'
            : stage === 'mesh3d.vert'
                ? 'fn vertex(pos: vec3<f32>, ctx: VertContext) -> vec3<f32>'
                : 'fn effect(surface: vec4<f32>, ctx: FragContext) -> vec4<f32>';
        return `${sig} {\n${lines.join('\n')}${lines.length ? '\n' : ''}    return ${result};\n}`;
    },
    input: (kind, stage) => INPUT_SOURCE[kind][stage],
    previewPrelude: PREVIEW_PRELUDE,
};
