/**
 * Cheap noise both languages agree on, for grain, flicker and anything else that wants to look
 * random without being so.
 *
 * `hash12` gives one number from 0 to 1 for a place; `valueNoise` blends four of them so the result
 * is smooth between whole coordinates. Both take a plain `vec2`, so a caller that wants it to move
 * adds time to the place it asks about. No trig in the hash: a `sin`-based one shows patterns on
 * some cards once the numbers grow.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const NOISE_WGSL = /* wgsl */ `
fn hash12(at: vec2<f32>) -> f32 {
    var p = fract(vec3<f32>(at.x, at.y, at.x) * 0.1031);
    p = p + dot(p, p.yzx + 33.33);
    return fract((p.x + p.y) * p.z);
}

fn valueNoise(at: vec2<f32>) -> f32 {
    let cell = floor(at);
    let part = fract(at);
    let s = part * part * (3.0 - 2.0 * part);
    let a = hash12(cell);
    let b = hash12(cell + vec2<f32>(1.0, 0.0));
    let c = hash12(cell + vec2<f32>(0.0, 1.0));
    let d = hash12(cell + vec2<f32>(1.0, 1.0));
    return mix(mix(a, b, s.x), mix(c, d, s.x), s.y);
}
`;

/**
 * The same two in GLSL.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const NOISE_GLSL = /* glsl */ `
float hash12(vec2 at) {
    vec3 p = fract(vec3(at.x, at.y, at.x) * 0.1031);
    p += dot(p, p.yzx + 33.33);
    return fract((p.x + p.y) * p.z);
}

float valueNoise(vec2 at) {
    vec2 cell = floor(at);
    vec2 part = fract(at);
    vec2 s = part * part * (3.0 - 2.0 * part);
    float a = hash12(cell);
    float b = hash12(cell + vec2(1.0, 0.0));
    float c = hash12(cell + vec2(0.0, 1.0));
    float d = hash12(cell + vec2(1.0, 1.0));
    return mix(mix(a, b, s.x), mix(c, d, s.x), s.y);
}
`;
