import { FACING_TURN, INSTANCE_INPUTS, INSTANCE_PLACE, meshFragment, meshShaderCommon, TWO_SIDED_WRITE, worldNormalOf } from './mesh_shader';
import type { TCullMode } from '../../../materials/types/t_material';

/**
 * What draws a model as many instances of its shape in one go (`createMeshInstances`).
 *
 * **Everything but the corners is shared with the ordinary one**, word for word, as it is for a model
 * that bends: an instance's placement is something that happens to a corner on its way to the screen,
 * where a bone mix would be, and by the time anything is painted there is nothing left to tell apart.
 *
 * Each instance brings its placement inside the model, a colour that multiplies the one painted on
 * the corners, and four numbers only a material reads.
 *
 * Its twin in GLSL is `webgl2/mesh/instanced_shader.ts`, and the two have to say the same thing.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const instancedShaderFor = (cull: TCullMode, secondUv = false): string => meshShaderCommon(cull, secondUv) + /* wgsl */ `
${FACING_TURN}
@vertex
fn vs(
    @location(0) position: vec3<f32>,
    @location(1) normal: vec3<f32>,
    @location(2) uv: vec2<f32>,
    @location(5) color: vec4<f32>,${secondUv ? `
    @location(7) uv2: vec2<f32>,` : ''}${INSTANCE_INPUTS}
) -> VertexOutput {${INSTANCE_PLACE}
    let placed = instance * vec4<f32>(position, 1.0);
    // The way the surface faces is turned by the same placement, with the move dropped, and by its
    // inverse, so an instance stretched more one way than another is still lit along its surface.
    let placedNormal = facingTurnOf(mat3x3<f32>(instance[0].xyz, instance[1].xyz, instance[2].xyz)) * normal;

    var out: VertexOutput;
    out.position = snapToPixels(uniforms.mvp * placed);

    let worldPos = (uniforms.model * placed).xyz;
    let worldNormal = ${worldNormalOf(cull, 'placedNormal')};
    let viewDir = viewDirOf(worldPos);

    let surface = litBy(worldPos, worldNormal, viewDir);
    out.light = surface.diffuse;
    out.shine = surface.shine;
    out.casterLight = surface.casterDiffuse;
    out.casterShine = surface.casterShine;${cull === 'none' ? TWO_SIDED_WRITE : ''}
    out.shadowCoord = shadowCoordOf(worldPos);
    out.uv = affineUv(uv, out.position);
    // Its own colour over the one painted on the corners: white leaves the shape as it is.
    out.color = color * instanceColor;
    out.fog = vec2<f32>(fogAt(worldPos), skyward(worldNormal));${secondUv ? `
    out.uv2 = affineUv(uv2, out.position).xy;` : ''}
    return out;
}
` + meshFragment(cull, secondUv);
