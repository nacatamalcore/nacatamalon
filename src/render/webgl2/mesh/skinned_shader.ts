import { MESH_VERTEX_HEAD_GLSL, MESH_VERTEX_LIGHT_GLSL } from './mesh_shader';

/**
 * What draws a model that bends around its bones, in GLSL.
 *
 * **Everything but where a corner ends up is shared with the ordinary one**, word for word: the
 * same lights, the same surface, and the same fragment shader, which is used unchanged. Bending is
 * something that happens to a corner on its way to the screen.
 *
 * The bones arrive **as a picture of numbers** rather than a block of them, because a block has to
 * have its length written into the shader when the shader is built, and a file's bone count is not
 * known until it arrives. Four dots a bone, one per column of its matrix, read by position rather
 * than sampled, so nothing is blurred or wrapped.
 *
 * Its twin in WGSL is `webgpu/mesh/skinned_shader.ts`, and the two have to say the same thing.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const SKINNED_VERTEX_GLSL = MESH_VERTEX_HEAD_GLSL + /* glsl */ `
layout(location = 3) in vec4 aBones;
layout(location = 4) in vec4 aWeights;

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
    // The four bones, mixed by how much of the corner each one owns. Mixing the movements and
    // applying the result once is what keeps a bend smooth: moving the corner four times and
    // averaging where it lands pinches the surface at every joint.
    mat4 skin =
        aWeights.x * boneMatrix(int(aBones.x)) +
        aWeights.y * boneMatrix(int(aBones.y)) +
        aWeights.z * boneMatrix(int(aBones.z)) +
        aWeights.w * boneMatrix(int(aBones.w));

    vec4 bent = skin * vec4(aPosition, 1.0);
    // The way the surface faces is turned by the same mixture, with the move dropped: a direction
    // has no place. Without this an arm bends and is lit as though it never had.
    vec3 bentNormal = mat3(skin) * aNormal;

    gl_Position = snapToPixels(uniforms.mvp * bent);

    vec3 worldPos = (uniforms.model * bent).xyz;
    vec3 worldNormal = normalize((uniforms.normalMatrix * vec4(bentNormal, 0.0)).xyz);
` + MESH_VERTEX_LIGHT_GLSL;
