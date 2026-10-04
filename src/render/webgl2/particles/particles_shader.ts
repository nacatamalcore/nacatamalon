/**
 * The GLSL twin of `render/webgpu/particles/particles_shader.ts`.
 *
 * The two have to draw the same picture, so the arithmetic is the same line for line and only the
 * language changes. The view block is the **same** `std140` layout the sprites use and is filled
 * from the same `Float32Array`, which is what keeps a cloud following the camera its sprites follow.
 *
 * Anything changed in one of the two has to be changed in the other.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const PARTICLES_VERTEX_SHADER = /* glsl */ `#version 300 es
precision highp float;

struct View { vec2 position; float rotation; float zoom; };
layout(std140) uniform Uniforms {
    vec2 resolution;
    vec2 padding;
    View views[16];
} u;

layout(location = 0) in vec2 corner;
layout(location = 1) in vec2 position;
layout(location = 2) in float size;
layout(location = 3) in float rotation;
layout(location = 4) in vec4 tint;
layout(location = 5) in float view;

out vec4 vTint;
out vec2 vUv;

void main() {
    // Square, and turned about its own middle: no anchor, because a particle has nothing to stand on.
    vec2 local = corner * size;
    float c = cos(rotation);
    float s = sin(rotation);
    vec2 turned = vec2(local.x * c - local.y * s, local.x * s + local.y * c);
    vec2 pixel = position + turned;

    View v = u.views[int(view)];
    vec2 fromCamera = pixel - v.position;
    float vc = cos(-v.rotation);
    float vs = sin(-v.rotation);
    vec2 screen = vec2(fromCamera.x * vc - fromCamera.y * vs, fromCamera.x * vs + fromCamera.y * vc) * v.zoom;

    vec2 clip = screen / u.resolution * 2.0 - 1.0;

    gl_Position = vec4(clip.x, -clip.y, 0.0, 1.0);
    vTint = tint;
    vUv = corner + 0.5;
}
`;

/**
 * The ending: the picture read where the corner says, multiplied by the particle's own colour.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const PARTICLES_FRAGMENT_SHADER = /* glsl */ `#version 300 es
precision highp float;

uniform sampler2D particleTexture;

in vec4 vTint;
in vec2 vUv;
out vec4 fragColor;

void main() {
    fragColor = texture(particleTexture, vUv) * vTint;
}
`;

/**
 * The vertex half for a particle in three dimensions: a square built per corner from the camera's
 * right and up, so it always faces the camera.
 *
 * The same reasoning as the other backend's, line for line: the point is placed first and the
 * square spread around it along the camera's axes, and `up` is subtracted because the corners are
 * laid out with y growing downwards. The fragment half is the flat one's, unchanged.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const PARTICLES_3D_VERTEX_SHADER = /* glsl */ `#version 300 es
precision highp float;

uniform mat4 viewProjection;
uniform vec3 cameraRight;
uniform vec3 cameraUp;

layout(location = 0) in vec2 corner;
layout(location = 1) in vec3 position;
layout(location = 2) in float size;
layout(location = 3) in float rotation;
layout(location = 4) in vec4 tint;

out vec4 vTint;
out vec2 vUv;

void main() {
    vec2 local = corner * size;
    float c = cos(rotation);
    float s = sin(rotation);
    vec2 turned = vec2(local.x * c - local.y * s, local.x * s + local.y * c);
    vec3 world = position + cameraRight * turned.x - cameraUp * turned.y;

    gl_Position = viewProjection * vec4(world, 1.0);
    vTint = tint;
    vUv = corner + 0.5;
}
`;
