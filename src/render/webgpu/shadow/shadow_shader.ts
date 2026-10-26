/**
 * Where a caster's corners are seen from: the light's view and the caster's own placement. The same
 * block in every shadow shader, a material's included.
 *
 * @internal
 */
export const SHADOW_UNIFORMS_WGSL = /* wgsl */ `struct ShadowUniforms {
    lightViewProj: mat4x4<f32>,
    model: mat4x4<f32>,
};

@group(0) @binding(0) var<uniform> shadow: ShadowUniforms;
`;

/**
 * What is drawn into the shadow map: where a corner lands from the light, and nothing else.
 *
 * **There is no fragment stage at all**, and that is the point of the pass rather than an economy.
 * Nothing is being coloured: the only thing wanted is how far away the nearest surface is along each
 * line out of the light, and the card writes that by itself. A colour stage here would compute a
 * pixel that is thrown away 2048 times across.
 *
 * Its twin in GLSL is `webgl2/shadow/shadow_shader.ts`, and the two have to say the same thing.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const SHADOW_WGSL = /* wgsl */ `
${SHADOW_UNIFORMS_WGSL}
@vertex
fn vs(@location(0) position: vec3<f32>) -> @builtin(position) vec4<f32> {
    return shadow.lightViewProj * shadow.model * vec4<f32>(position, 1.0);
}
`;

/**
 * The same, for a model that bends around its bones.
 *
 * A character casts **the pose it is in**, not the pose it was exported in, and that takes saying
 * the bone blend a second time: the map is drawn by its own pipeline, which shares no stage with the
 * one that lights the scene. The blend is word for word the one in `webgpu/mesh/skinned_shader.ts`,
 * and it has to be: a shadow worked out from a slightly different pose is a shadow that slides off
 * its own character.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const SHADOW_SKINNED_WGSL = /* wgsl */ `
struct ShadowUniforms {
    lightViewProj: mat4x4<f32>,
    model: mat4x4<f32>,
};

@group(0) @binding(0) var<uniform> shadow: ShadowUniforms;
@group(1) @binding(0) var<storage, read> joints: array<mat4x4<f32>>;

@vertex
fn vs(
    @location(0) position: vec3<f32>,
    @location(3) bones: vec4<f32>,
    @location(4) weights: vec4<f32>,
) -> @builtin(position) vec4<f32> {
    // Mixed first and applied once, which is what keeps a bend smooth: moving the corner four
    // times and averaging where it lands pinches the surface at every joint.
    let skin =
        weights.x * joints[u32(bones.x)] +
        weights.y * joints[u32(bones.y)] +
        weights.z * joints[u32(bones.z)] +
        weights.w * joints[u32(bones.w)];
    return shadow.lightViewProj * shadow.model * (skin * vec4<f32>(position, 1.0));
}
`;

/**
 * Where a cut-out caster's corners are seen from, and how it is cut: the same two matrices, then
 * `cut` (x = the alpha below which a pixel is cut out, y = the material's own alpha times its tint's).
 * The same block in every cut-out shadow shader, a material's included.
 *
 * @internal
 */
export const SHADOW_CUT_UNIFORMS_WGSL = /* wgsl */ `struct ShadowUniforms {
    lightViewProj: mat4x4<f32>,
    model: mat4x4<f32>,
    cut: vec4<f32>,
};

@group(0) @binding(0) var<uniform> shadow: ShadowUniforms;
`;

/**
 * What a cut-out caster carries to its colour stage: where in the picture, and its corners' alpha.
 */
const SHADOW_CUT_OUTPUT_WGSL = /* wgsl */ `struct CutOutput {
    @builtin(position) position: vec4<f32>,
    @location(0) uv: vec2<f32>,
    @location(1) alpha: f32,
};
`;

/**
 * The colour stage of a cut-out caster, which colours nothing either: it only throws away the pixels
 * the model itself does not draw, by the same alpha and the same cutoff, so a fence casts bars and a
 * leaf a leaf rather than the square of its picture.
 */
const shadowCutFragment = (group: number): string => /* wgsl */ `
@group(${group}) @binding(0) var meshSampler: sampler;
@group(${group}) @binding(1) var meshTexture: texture_2d<f32>;

@fragment
fn fs(in: CutOutput) {
    let alpha = textureSample(meshTexture, meshSampler, in.uv).a * shadow.cut.y * in.alpha;
    if (alpha < shadow.cut.x) {
        discard;
    }
}
`;

/**
 * What is drawn into the shadow map by a model whose material cuts its picture out (`alphaCutoff`):
 * where a corner lands from the light, and the pixels its picture leaves out left out.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const SHADOW_CUT_WGSL = /* wgsl */ `
${SHADOW_CUT_UNIFORMS_WGSL}
${SHADOW_CUT_OUTPUT_WGSL}
@vertex
fn vs(@location(0) position: vec3<f32>, @location(2) uv: vec2<f32>, @location(5) color: vec4<f32>) -> CutOutput {
    var out: CutOutput;
    out.position = shadow.lightViewProj * shadow.model * vec4<f32>(position, 1.0);
    out.uv = uv;
    out.alpha = color.a;
    return out;
}
${shadowCutFragment(1)}`;

/**
 * The same, for a model that bends around its bones: the pose it is in, cut out of its picture.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const SHADOW_CUT_SKINNED_WGSL = /* wgsl */ `
${SHADOW_CUT_UNIFORMS_WGSL}
${SHADOW_CUT_OUTPUT_WGSL}
@group(1) @binding(0) var<storage, read> joints: array<mat4x4<f32>>;

@vertex
fn vs(
    @location(0) position: vec3<f32>,
    @location(2) uv: vec2<f32>,
    @location(3) bones: vec4<f32>,
    @location(4) weights: vec4<f32>,
    @location(5) color: vec4<f32>,
) -> CutOutput {
    // The blend of SHADOW_SKINNED_WGSL, word for word.
    let skin =
        weights.x * joints[u32(bones.x)] +
        weights.y * joints[u32(bones.y)] +
        weights.z * joints[u32(bones.z)] +
        weights.w * joints[u32(bones.w)];
    var out: CutOutput;
    out.position = shadow.lightViewProj * shadow.model * (skin * vec4<f32>(position, 1.0));
    out.uv = uv;
    out.alpha = color.a;
    return out;
}
${shadowCutFragment(2)}`;
