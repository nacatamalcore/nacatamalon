import { LINE_DEPTH_NUDGE } from '../../shared/line_vertex';

/**
 * The GLSL twin of `render/webgpu/lines/lines_shader.ts`: each corner through the scene's camera, in
 * its own colour.
 *
 * Anything changed in one of the two has to be changed in the other, the nudge towards the camera
 * included.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const LINES_VERTEX_SHADER = /* glsl */ `#version 300 es
precision highp float;

uniform mat4 viewProjection;

layout(location = 0) in vec3 position;
layout(location = 1) in vec4 color;

out vec4 vColor;

void main() {
    gl_Position = viewProjection * vec4(position, 1.0);
    // The same nudge as WebGPU's, doubled: this depth runs from -1 to 1 instead of 0 to 1.
    gl_Position.z -= ${2 * LINE_DEPTH_NUDGE} * gl_Position.w;
    vColor = color;
}
`;

/**
 * The colour of each fragment is the colour of its line, blended along it.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const LINES_FRAGMENT_SHADER = /* glsl */ `#version 300 es
precision highp float;

in vec4 vColor;
out vec4 fragColor;

void main() {
    fragColor = vColor;
}
`;
