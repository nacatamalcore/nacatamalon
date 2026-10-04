import { MESH_SHADER_COMMON, MESH_SHADER_FRAGMENT } from './mesh_shader';

/**
 * What draws a model that bends around its bones.
 *
 * **Everything but the corners is shared with the ordinary one**, word for word: the same lights,
 * the same surface, the same colour on screen. Bending is something that happens to a corner on its
 * way to the screen, and by the time anything is painted there is nothing left to tell apart. That
 * is why this file is short, and why the two cannot drift.
 *
 * Each corner names up to four bones and says how much of each it belongs to. Its place is worked
 * out from all four at once, which is what makes a shoulder bend smoothly instead of tearing: a
 * corner halfway down the arm is carried half by the upper arm and half by the forearm.
 *
 * The bones arrive as **a run as long as the rig needs**, rather than a block of a size chosen in
 * advance. A file's bone count is not known until it arrives.
 *
 * Its twin in GLSL is `webgl2/mesh/skinned_shader.ts`, and the two have to say the same thing.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const SKINNED_SHADER = MESH_SHADER_COMMON + /* wgsl */ `
@group(3) @binding(0) var<storage, read> joints: array<mat4x4<f32>>;

@vertex
fn vs(
    @location(0) position: vec3<f32>,
    @location(1) normal: vec3<f32>,
    @location(2) uv: vec2<f32>,
    @location(3) bones: vec4<f32>,
    @location(4) weights: vec4<f32>,
    @location(5) color: vec4<f32>,
) -> VertexOutput {
    // The four bones, mixed by how much of the corner each one owns. Mixing the movements and
    // applying the result once is what keeps a bend smooth: moving the corner four times and
    // averaging where it lands pinches the surface at every joint.
    let skin =
        weights.x * joints[u32(bones.x)] +
        weights.y * joints[u32(bones.y)] +
        weights.z * joints[u32(bones.z)] +
        weights.w * joints[u32(bones.w)];

    let bent = skin * vec4<f32>(position, 1.0);
    // The way the surface faces is turned by the same mixture, with the move dropped: a direction
    // has no place. Without this an arm bends and is lit as though it never had.
    let bentNormal = mat3x3<f32>(skin[0].xyz, skin[1].xyz, skin[2].xyz) * normal;

    var out: VertexOutput;
    out.position = snapToPixels(uniforms.mvp * bent);

    let worldPos = (uniforms.model * bent).xyz;
    let worldNormal = normalize((uniforms.normalMatrix * vec4<f32>(bentNormal, 0.0)).xyz);
    let viewDir = normalize(uniforms.cameraPosition.xyz - worldPos);

    let surface = litBy(worldPos, worldNormal, viewDir);
    out.light = surface.diffuse;
    out.shine = surface.shine;
    out.casterLight = surface.casterDiffuse;
    out.casterShine = surface.casterShine;
    // The pose it is in, exactly as the map was drawn from it.
    out.shadowCoord = shadowCoordOf(worldPos);
    out.uv = affineUv(uv, out.position);
    out.color = color;
    out.fog = fogAt(worldPos);
    return out;
}
` + MESH_SHADER_FRAGMENT;
