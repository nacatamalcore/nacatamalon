import { FACING_TURN_GLSL, INSTANCE_HEAD_GLSL, meshVertexHeadGlsl, meshVertexLightGlsl, worldNormalOfGlsl } from './mesh_shader';
import type { TCullMode } from '../../../materials/types/t_material';

/**
 * What draws a model as many instances of its shape in one go, in GLSL.
 *
 * **Everything but where a corner ends up is shared with the ordinary one**, word for word, and the
 * fragment shader is used unchanged: an instance's placement is something that happens to a corner
 * on its way to the screen, where a bone mix would be.
 *
 * Its twin in WGSL is `webgpu/mesh/instanced_shader.ts`, and the two have to say the same thing.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const instancedVertexGlsl = (cull: TCullMode, secondUv = false): string => meshVertexHeadGlsl(cull, secondUv) + INSTANCE_HEAD_GLSL + FACING_TURN_GLSL + /* glsl */ `
void main() {
    mat4 instance = instancePlace();
    vec4 placed = instance * vec4(aPosition, 1.0);
    // The way the surface faces is turned by the same placement, with the move dropped, and by its
    // inverse, so an instance stretched more one way than another is still lit along its surface.
    vec3 placedNormal = facingTurnOf(mat3(instance)) * aNormal;

    gl_Position = snapToPixels(uniforms.mvp * placed);

    vec3 worldPos = (uniforms.model * placed).xyz;
    vec3 worldNormal = ${worldNormalOfGlsl(cull, 'placedNormal')};
` + meshVertexLightGlsl(cull, secondUv, 'aColor * aInstanceColor');
