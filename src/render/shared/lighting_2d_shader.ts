/**
 * The 2D lighting of one view, as the shaders read it: the base colour with the number of lamps in
 * its fourth number, then eight lamps, each where it is (`xy`), how far it reaches (`z`) and how it
 * fades (`w`), and its colour already times its strength. Laid out like `fillLighting2d` writes it.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const LIGHTING_2D_STRUCT_WGSL = `
struct Lamp2d { place: vec4f, color: vec4f };
struct Lighting2d { ambient: vec4f, lamps: array<Lamp2d, 8> };
`;

/**
 * The GLSL twin of `LIGHTING_2D_STRUCT_WGSL`: in `std140` it takes the same bytes.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const LIGHTING_2D_STRUCT_GLSL = `
struct Lamp2d { vec4 place; vec4 color; };
struct Lighting2d { vec4 ambient; Lamp2d lamps[8]; };
`;

/**
 * Lights a colour where it is in the world: the base light plus each lamp that reaches it, fading
 * towards its edge, times the colour. Its alpha is kept. A view with no 2D lights is white with no
 * lamps, so the colour comes out as it went in.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const LIGHTING_2D_WGSL = `
fn illuminate2d(color: vec4f, pixel: vec2f, view: u32) -> vec4f {
    var light = u.lighting2d[view].ambient.rgb;
    let count = u32(u.lighting2d[view].ambient.a);
    for (var i = 0u; i < count; i++) {
        let lamp = u.lighting2d[view].lamps[i];
        let distance = length(pixel - lamp.place.xy);
        if (lamp.place.z > 0.0 && distance < lamp.place.z) {
            let falloff = pow(max(1.0 - distance / lamp.place.z, 0.000001), lamp.place.w);
            light += lamp.color.rgb * falloff;
        }
    }
    return vec4f(color.rgb * light, color.a);
}
`;

/**
 * The GLSL twin of `LIGHTING_2D_WGSL`, line for line.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const LIGHTING_2D_GLSL = `
vec4 illuminate2d(vec4 color, vec2 pixel, int view) {
    vec3 light = u.lighting2d[view].ambient.rgb;
    int count = int(u.lighting2d[view].ambient.a);
    for (int i = 0; i < count; i++) {
        Lamp2d lamp = u.lighting2d[view].lamps[i];
        float distance = length(pixel - lamp.place.xy);
        if (lamp.place.z > 0.0 && distance < lamp.place.z) {
            float falloff = pow(max(1.0 - distance / lamp.place.z, 0.000001), lamp.place.w);
            light += lamp.color.rgb * falloff;
        }
    }
    return vec4(color.rgb * light, color.a);
}
`;

/**
 * The frame block of the flat pipelines, sprites and maps, in GLSL. Written once and used by both
 * halves of each program, because GLSL only links a block both stages declare the same way.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const FLAT_FRAME_GLSL = `
struct View { vec2 position; float rotation; float zoom; };
${LIGHTING_2D_STRUCT_GLSL}
layout(std140) uniform Uniforms {
    vec2 resolution;
    vec2 padding;
    View views[16];
    Lighting2d lighting2d[16];
} u;
`;

/**
 * `illuminate2d` for a pass with no 2D lights: the colour as it came. The frame block is the same, but
 * nothing in it is read, so a game that never lights its world pays nothing per pixel for the lights.
 */
const UNLIT_2D_WGSL = `
fn illuminate2d(color: vec4f, pixel: vec2f, view: u32) -> vec4f {
    return color;
}
`;

/**
 * The GLSL twin of `UNLIT_2D_WGSL`.
 */
const UNLIT_2D_GLSL = `
vec4 illuminate2d(vec4 color, vec2 pixel, int view) {
    return color;
}
`;

/**
 * The same flat shader for a pass that has no 2D lights: its `illuminate2d` handed the colour back as
 * it came. Every flat shader is written once, lit, and this is the other one, so the two cannot drift
 * apart. A shader that does not light (one of the masks) comes back as it was.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const withoutLights2d = (code: string): string =>
    code.replace(LIGHTING_2D_WGSL, UNLIT_2D_WGSL).replace(LIGHTING_2D_GLSL, UNLIT_2D_GLSL);

/**
 * The 2D lighting of one view as a plugin's kind of drawing reads it: the structs, and
 * `illuminate2d(lighting, color, pixel)`, the same light a sprite is given, from a block the kind
 * keeps itself (`TDrawableCamera.lights`). Its arithmetic is `LIGHTING_2D_WGSL`'s, line for line.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const LIGHTS_2D_WGSL = `${LIGHTING_2D_STRUCT_WGSL}
fn illuminate2d(lighting: Lighting2d, color: vec4f, pixel: vec2f) -> vec4f {
    var light = lighting.ambient.rgb;
    let count = u32(lighting.ambient.a);
    for (var i = 0u; i < count; i++) {
        let lamp = lighting.lamps[i];
        let distance = length(pixel - lamp.place.xy);
        if (lamp.place.z > 0.0 && distance < lamp.place.z) {
            let falloff = pow(max(1.0 - distance / lamp.place.z, 0.000001), lamp.place.w);
            light += lamp.color.rgb * falloff;
        }
    }
    return vec4f(color.rgb * light, color.a);
}
`;

/**
 * The GLSL twin of `LIGHTS_2D_WGSL`.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const LIGHTS_2D_GLSL = `${LIGHTING_2D_STRUCT_GLSL}
vec4 illuminate2d(Lighting2d lighting, vec4 color, vec2 pixel) {
    vec3 light = lighting.ambient.rgb;
    int count = int(lighting.ambient.a);
    for (int i = 0; i < count; i++) {
        Lamp2d lamp = lighting.lamps[i];
        float distance = length(pixel - lamp.place.xy);
        if (lamp.place.z > 0.0 && distance < lamp.place.z) {
            float falloff = pow(max(1.0 - distance / lamp.place.z, 0.000001), lamp.place.w);
            light += lamp.color.rgb * falloff;
        }
    }
    return vec4(color.rgb * light, color.a);
}
`;
