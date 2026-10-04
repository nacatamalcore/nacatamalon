/**
 * The soft disc under a thing: a fake shadow that costs one extra model and nothing from the
 * shadow map.
 *
 * It is a **mesh material**, not a feature of the renderer, and that is the whole reason it is
 * cheap: the disc goes down the ordinary model path, so nothing here needs a pass, a texture or a
 * binding of its own. A game can have fifty of them on a machine that could not afford one real
 * shadow map.
 *
 * **The falloff is measured in world space, not from the disc's own uv**, and that is not a
 * preference. `addDiskFan` puts the middle vertex at uv `(0.5, 0.5)` and lays the whole rim along
 * one line at `v = 0.5`, so there is no radial gradient in the uv to read: the distance from the
 * middle of the uv square is not the distance from the middle of the disc. Measuring the world
 * position against the disc's own centre and radii is what gives a real circle.
 *
 * What it costs: this is right for any disc that has been moved and scaled while staying flat, and
 * wrong for one that has been **turned** with a non-uniform scale, because the two radii are
 * recovered from the model's columns and then measured along world axes. A blob shadow lying on the
 * ground is never in that state.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const BLOB_SHADOW_WGSL = /* wgsl */ `
fn effect(surface: vec4<f32>, ctx: FragContext) -> vec4<f32> {
    let center = uniforms.model[3].xyz;
    let radiusX = 0.5 * length(uniforms.model[0].xyz);
    let radiusZ = 0.5 * length(uniforms.model[2].xyz);
    let dx = (ctx.worldPos.x - center.x) / max(radiusX, 0.0001);
    let dz = (ctx.worldPos.z - center.z) / max(radiusZ, 0.0001);
    // 0 in the middle, 1 at the rim.
    let d = sqrt(dx * dx + dz * dz);
    let edge = 1.0 - clamp(mu.softness, 0.0, 1.0);
    let falloff = 1.0 - smoothstep(edge, 1.0, d);
    // Unlit on purpose: a shadow that took the light would brighten as the light moved, which is
    // the opposite of what a shadow does.
    return vec4<f32>(surface.rgb, surface.a * falloff);
}
`;

/**
 * The same, in GLSL, by the same names.
 *
 * Indexing a `mat4` by column reads the same in both languages, so this really is the same
 * arithmetic and not a rewrite of it.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const BLOB_SHADOW_GLSL = /* glsl */ `
vec4 effect(vec4 surface, FragContext ctx) {
    vec3 center = uniforms.model[3].xyz;
    float radiusX = 0.5 * length(uniforms.model[0].xyz);
    float radiusZ = 0.5 * length(uniforms.model[2].xyz);
    float dx = (ctx.worldPos.x - center.x) / max(radiusX, 0.0001);
    float dz = (ctx.worldPos.z - center.z) / max(radiusZ, 0.0001);
    float d = sqrt(dx * dx + dz * dz);
    float edge = 1.0 - clamp(mu.softness, 0.0, 1.0);
    float falloff = 1.0 - smoothstep(edge, 1.0, d);
    return vec4(surface.rgb, surface.a * falloff);
}
`;
