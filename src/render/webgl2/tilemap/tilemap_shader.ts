/**
 * The GLSL twin of `render/webgpu/tilemap/tilemap_shader.ts`. Same picture, other language, and the
 * differences are only the ones the two APIs force: the views arrive in a `std140` block laid out
 * byte for byte like the WGSL one, and the layer's own numbers are plain uniforms rather than a
 * third bind group, because there is nothing to gain from a block for six values.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const TILEMAP_VERTEX_SHADER = /* glsl */ `#version 300 es
precision highp float;

struct View { vec2 position; float rotation; float zoom; };
layout(std140) uniform Uniforms {
    vec2 resolution;
    vec2 padding;
    View views[16];
} u;

uniform vec2 layerPosition;
uniform vec2 layerScale;
uniform float layerRotation;
uniform float layerView;

layout(location = 0) in vec2 corner;
layout(location = 1) in vec2 uv;
layout(location = 2) in vec4 window;

out vec2 vUv;
// The cell's own piece of the sheet, half a texel in from each edge. The same at every corner of a
// cell, so it is not blended across it.
flat out vec4 vWindow;

void main() {
    vec2 scaled = corner * layerScale;
    float c = cos(layerRotation);
    float s = sin(layerRotation);
    vec2 turned = vec2(scaled.x * c - scaled.y * s, scaled.x * s + scaled.y * c);
    vec2 pixel = layerPosition + turned;

    View v = u.views[int(layerView)];
    vec2 fromCamera = pixel - v.position;
    float vc = cos(-v.rotation);
    float vs = sin(-v.rotation);
    vec2 screen = vec2(fromCamera.x * vc - fromCamera.y * vs, fromCamera.x * vs + fromCamera.y * vc) * v.zoom;

    vec2 clip = screen / u.resolution * 2.0 - 1.0;

    gl_Position = vec4(clip.x, -clip.y, 0.0, 1.0);
    vUv = uv;
    vWindow = window;
}
`;

/**
 * Fragment half of `TILEMAP_VERTEX_SHADER`: the sheet multiplied by the layer's colour.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const TILEMAP_FRAGMENT_HEAD_GLSL = /* glsl */ `#version 300 es
precision highp float;

uniform sampler2D tilesTexture;
uniform vec4 layerTint;

in vec2 vUv;
flat in vec4 vWindow;
out vec4 fragColor;

// Where a fragment reads the sheet: where the cell says, kept inside the cell's window. The corners
// show the tile's whole square, so each texel is as wide as the next; this is what keeps a cell drawn
// at a fractional position from reading the tile next door along its edge.
vec2 tileUv() {
    return clamp(vUv, vWindow.xy, vWindow.zw);
}
`;

/**
 * The built-in ending. Split from the declarations so a layer's material keeps those and brings its
 * own ending, sharing the value rather than copying the text.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const TILEMAP_FRAGMENT_MAIN_GLSL = /* glsl */ `
void main() {
    fragColor = texture(tilesTexture, tileUv()) * layerTint;
}
`;

/**
 * The whole built-in fragment half.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const TILEMAP_FRAGMENT_SHADER = TILEMAP_FRAGMENT_HEAD_GLSL + TILEMAP_FRAGMENT_MAIN_GLSL;
