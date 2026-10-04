/**
 * What is drawn into the shadow map: where a corner lands from the light, and nothing else.
 *
 * Its twin in WGSL is `webgpu/shadow/shadow_shader.ts`, and the two have to say the same thing.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const SHADOW_VERTEX_GLSL = /* glsl */ `#version 300 es
layout(location = 0) in vec3 aPosition;

uniform mat4 uLightViewProj;
uniform mat4 uModel;

void main() {
    gl_Position = uLightViewProj * uModel * vec4(aPosition, 1.0);
}
`;

/**
 * The same, for a model that bends around its bones.
 *
 * The bones arrive as a picture of numbers, four dots apiece, read by position and never sampled,
 * which is the same way the pass that lights the scene reads them. The blend is word for word the
 * one in `webgl2/mesh/skinned_shader.ts`: a shadow worked out from a slightly different pose is a
 * shadow that slides off its own character.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const SHADOW_SKINNED_VERTEX_GLSL = /* glsl */ `#version 300 es
layout(location = 0) in vec3 aPosition;
layout(location = 3) in vec4 aBones;
layout(location = 4) in vec4 aWeights;

uniform mat4 uLightViewProj;
uniform mat4 uModel;
uniform highp sampler2D uJoints;

mat4 boneMatrix(int bone) {
    int x = bone * 4;
    return mat4(
        texelFetch(uJoints, ivec2(x, 0), 0),
        texelFetch(uJoints, ivec2(x + 1, 0), 0),
        texelFetch(uJoints, ivec2(x + 2, 0), 0),
        texelFetch(uJoints, ivec2(x + 3, 0), 0)
    );
}

void main() {
    mat4 skin =
        aWeights.x * boneMatrix(int(aBones.x)) +
        aWeights.y * boneMatrix(int(aBones.y)) +
        aWeights.z * boneMatrix(int(aBones.z)) +
        aWeights.w * boneMatrix(int(aBones.w));

    gl_Position = uLightViewProj * uModel * (skin * vec4(aPosition, 1.0));
}
`;

/**
 * The colour stage that colours nothing.
 *
 * WebGPU lets a pipeline have no fragment stage at all, which is what the other half does. This
 * card insists on one, so it gets one that writes no outputs: the framebuffer has no colour
 * attachment to write to, and depth is filled in by the card either way. It is the same pass, said
 * in the only way this card will hear it.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const SHADOW_FRAGMENT_GLSL = /* glsl */ `#version 300 es
precision highp float;

void main() {}
`;
