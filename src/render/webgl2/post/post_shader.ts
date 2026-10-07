import { glslUniformBlock } from '../material/uniform_block';
import { POST_ENGINE_FIELDS } from '../../shared/material_uniforms';
import type { TUniformSignature } from '../../../materials';

/**
 * The full-screen triangle, worked out from which corner this is.
 *
 * No vertex buffer and no attributes at all, which is why the caller binds an empty array object
 * around the whole chain: the pointers a sprite left set up must not still be live during a draw
 * that reads none of them.
 */
const VERTEX = /* glsl */ `#version 300 es
precision highp float;

out vec2 vUv;

void main() {
    float x = float((gl_VertexID << 1) & 2);
    float y = float(gl_VertexID & 2);
    // The same uv its WGSL twin hands the hook: y downwards, so an effect reading uv.y means the
    // same thing on both cards. sampleTexture turns it back over to do the actual read, and the
    // two flips cancel: what is stored bottom-up is read bottom-up.
    vUv = vec2(x, 1.0 - y);
    gl_Position = vec4(vec2(x, y) * 2.0 - 1.0, 0.0, 1.0);
}
`;

/**
 * Version and precision first, which is the only place GLSL will take them.
 */
const HEAD = /* glsl */ `#version 300 es
precision highp float;
precision highp int;

in vec2 vUv;
out vec4 fragColor;

uniform sampler2D sceneTexture;
uniform sampler2D dataTexture;
uniform sampler2D inputTexture;
uniform sampler2D historyTexture;
uniform sampler2D smoothTexture;
`;

/**
 * The same helpers by the same names, so one effect file runs on either card.
 *
 * `smoothTexture` is the same picture as `sceneTexture` on a unit of its own: in GL the filtering
 * belongs to the unit, so one picture read two ways needs two units.
 *
 * **The picture is turned upside down here and not in the vertex half**, which is where its WGSL
 * twin does it. A framebuffer in GL has its origin at the bottom, so what was drawn into it is
 * already the right way up in its own terms and only the reading is upside down. Turning the
 * triangle over instead would work for the frame and then turn the *data* texture over with it,
 * which would read the palette backwards. That would be the bug, not the fix.
 */
const HELPERS = /* glsl */ `
vec4 sampleTexture(vec2 uv) {
    return textureLod(sceneTexture, vec2(uv.x, 1.0 - uv.y), 0.0);
}

vec4 sampleTextureSmooth(vec2 uv) {
    return textureLod(smoothTexture, vec2(uv.x, 1.0 - uv.y), 0.0);
}

vec4 sampleInput(vec2 uv) {
    return textureLod(inputTexture, vec2(uv.x, 1.0 - uv.y), 0.0);
}

vec4 sampleHistory(vec2 uv) {
    return textureLod(historyTexture, vec2(uv.x, 1.0 - uv.y), 0.0);
}

int paletteSize() {
    return textureSize(dataTexture, 0).x;
}

vec3 paletteColor(int index) {
    return texelFetch(dataTexture, ivec2(index, 0), 0).rgb;
}

int lutSize() {
    return textureSize(dataTexture, 0).y;
}

vec3 lutTexel(float x, float y, float slice, float size) {
    return texelFetch(dataTexture, ivec2(int(slice * size + x), int(y)), 0).rgb;
}

vec3 lutColor(vec3 rgb) {
    float size = float(lutSize());
    if (size < 2.0) { return rgb; }
    float last = size - 1.0;

    vec3 at = clamp(rgb, 0.0, 1.0) * last;
    vec3 low = floor(at);
    vec3 high = min(low + 1.0, vec3(last));
    vec3 part = at - low;

    vec3 c000 = lutTexel(low.r, low.g, low.b, size);
    vec3 c100 = lutTexel(high.r, low.g, low.b, size);
    vec3 c010 = lutTexel(low.r, high.g, low.b, size);
    vec3 c110 = lutTexel(high.r, high.g, low.b, size);
    vec3 c001 = lutTexel(low.r, low.g, high.b, size);
    vec3 c101 = lutTexel(high.r, low.g, high.b, size);
    vec3 c011 = lutTexel(low.r, high.g, high.b, size);
    vec3 c111 = lutTexel(high.r, high.g, high.b, size);

    vec3 near = mix(mix(c000, c100, part.r), mix(c010, c110, part.r), part.g);
    vec3 far = mix(mix(c001, c101, part.r), mix(c011, c111, part.r), part.g);
    return mix(near, far, part.b);
}
`;

/**
 * The ending, which hands the hook the same `uv` its twin does.
 *
 * `vUv` is the triangle's own, the right way up for an effect, and only `sampleTexture` knows the
 * frame is stored the other way. So an effect reading `uv.y` means the same thing on both cards.
 */
const TAIL = /* glsl */ `
void main() {
    fragColor = effect(sampleTexture(vUv), vUv);
}
`;

/**
 * Builds one screen-wide effect's two halves for this backend.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const buildPostShaderGlsl = (
    fragment: string,
    sig: TUniformSignature,
): { vertex: string; fragment: string } => ({
    vertex: VERTEX,
    fragment: [HEAD, glslUniformBlock(sig, POST_ENGINE_FIELDS), HELPERS, fragment, TAIL].join('\n'),
});
