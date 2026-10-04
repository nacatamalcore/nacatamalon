import { MESH_SHADER_TYPES } from '../mesh/mesh_shader';
import { buildUniformLayout } from '../../shared/material_uniforms';
import type { TUniformSignature } from '../../../materials';

/**
 * Where a model material's own parameters are bound.
 *
 * Groups 0, 1 and 2 are the lights, the picture and the model's own numbers, all three shared with
 * the built-in pipeline. Group 3 is where a skeleton's bones go, and a model that bends never takes
 * this path, so the two can never want it at once.
 */
export const MESH_MATERIAL_GROUP = 3;

/**
 * How far apart the two samples are taken when a moved surface has to be re-measured.
 */
const EPSILON = 0.01;

/**
 * What the corner hook is told about the corner it is moving.
 */
const VERT_CONTEXT = /* wgsl */ `
struct VertContext {
    normal: vec3<f32>,
    uv: vec2<f32>,
    // The colour painted on the corner: a wind sway can be weighted by it, which is how the era
    // kept the foot of a tree still while its top moved.
    color: vec4<f32>,
};
`;

/**
 * What the colour hook is told about the place it is colouring.
 *
 * `light` and `shine` arrived from the corners, because this engine works the light out there and
 * lets the card smear it in between. That is the look of the era and it is why these are here rather
 * than worked out afresh per pixel.
 */
const FRAG_CONTEXT = /* wgsl */ `
struct FragContext {
    uv: vec2<f32>,
    normal: vec3<f32>,
    worldPos: vec3<f32>,
    light: vec3<f32>,
    shine: vec3<f32>,
    emissive: vec3<f32>,
    viewDir: vec3<f32>,
    // The colour painted on the corners, smeared across the triangle. It is already in the surface
    // the hook is handed; this is it on its own, for a hook that uses it as something else, such as
    // how much of a second picture to show.
    color: vec4<f32>,
};
`;

/**
 * What the vertex carries to the fragment for a material.
 *
 * Wider than the built-in one, which carries only what the built-in ending reads. A material may ask
 * where the surface is and which way it faces, so those are carried too, and carrying them costs
 * something across every triangle. That cost is why the ordinary model does not pay it.
 */
const VERTEX_OUTPUT = /* wgsl */ `
struct VertexOutput {
    @builtin(position) position: vec4<f32>,
    @location(0) uv: vec3<f32>,
    @location(1) light: vec3<f32>,
    @location(2) shine: vec3<f32>,
    @location(3) normal: vec3<f32>,
    @location(4) worldPos: vec3<f32>,
    @location(5) viewDir: vec3<f32>,
    // The casting light's own share of the two above, so the ending can take that one away and no
    // other. Where the corner falls in the map is **not** carried: this one already carries the
    // world position, so the ending works it out from that and saves a number across every
    // triangle.
    @location(6) casterLight: vec3<f32>,
    @location(7) casterShine: vec3<f32>,
    @location(8) color: vec4<f32>,
    @location(9) fog: f32,
};
`;

/**
 * Reading the picture, in a form a hook may call from inside a branch.
 */
const SAMPLE = /* wgsl */ `
fn sampleTexture(uv: vec2<f32>) -> vec4<f32> {
    return textureSampleLevel(meshTexture, meshSampler, uv, 0.0);
}
`;

/**
 * A corner hook that moves nothing, for a material that only recolours.
 */
const DEFAULT_VERTEX = /* wgsl */ `
fn vertex(pos: vec3<f32>, ctx: VertContext) -> vec3<f32> {
    return pos;
}
`;

/**
 * A colour hook that does what the engine would have done.
 *
 * Word for word the built-in ending, rearranged around what the hook is handed. So a material with
 * only a corner hook draws exactly as an ordinary model does, and an author writing a colour hook
 * starts from this rather than from nothing.
 */
const DEFAULT_EFFECT = /* wgsl */ `
fn effect(surface: vec4<f32>, ctx: FragContext) -> vec4<f32> {
    return vec4<f32>(surface.rgb * ctx.light + ctx.shine + ctx.emissive, surface.a);
}
`;

/**
 * The surface kept as it was, for a material that never moves a corner.
 */
const PLAIN_NORMAL = /* wgsl */ `
    let shaped = ctx.normal;
`;

/**
 * The surface measured again after the corners moved.
 *
 * Two more samples of the hook, a small step away across the surface, and the way the moved triangle
 * they make now faces. Without this a model that ripples is lit as though it were still flat, which
 * reads as the light being broken rather than the shape being moved.
 *
 * The reference direction is switched near the poles because crossing two nearly parallel vectors
 * gives nothing to normalise.
 */
const DEFORMED_NORMAL = /* wgsl */ `
    // select takes the FALSE value first. Its twin in GLSL is a ternary, which takes the true one,
    // so the two read in opposite orders and say the same thing.
    let reference = select(vec3<f32>(0.0, 1.0, 0.0), vec3<f32>(1.0, 0.0, 0.0), abs(ctx.normal.y) > 0.9);
    let tangent = normalize(cross(ctx.normal, reference));
    let bitangent = cross(ctx.normal, tangent);
    let moved1 = vertex(position + tangent * ${EPSILON}, ctx);
    let moved2 = vertex(position + bitangent * ${EPSILON}, ctx);
    let shaped = normalize(cross(moved1 - local, moved2 - local));
`;

const body = (normal: string): string => /* wgsl */ `
@vertex
fn vs(
    @location(0) position: vec3<f32>,
    @location(1) normal: vec3<f32>,
    @location(2) uv: vec2<f32>,
    @location(5) color: vec4<f32>,
) -> VertexOutput {
    var ctx: VertContext;
    ctx.normal = normal;
    ctx.uv = uv;
    ctx.color = color;

    let local = vertex(position, ctx);
${normal}
    var out: VertexOutput;
    out.position = snapToPixels(uniforms.mvp * vec4<f32>(local, 1.0));

    let worldPos = (uniforms.model * vec4<f32>(local, 1.0)).xyz;
    let worldNormal = normalize((uniforms.normalMatrix * vec4<f32>(shaped, 0.0)).xyz);
    let viewDir = normalize(uniforms.cameraPosition.xyz - worldPos);

    let surface = litBy(worldPos, worldNormal, viewDir);
    out.light = surface.diffuse;
    out.shine = surface.shine;
    out.casterLight = surface.casterDiffuse;
    out.casterShine = surface.casterShine;
    out.uv = affineUv(uv, out.position);
    out.normal = worldNormal;
    out.worldPos = worldPos;
    out.viewDir = viewDir;
    out.color = color;
    out.fog = fogAt(worldPos);
    return out;
}

@fragment
fn fs(in: VertexOutput) -> @location(0) vec4<f32> {
    // A shader you wrote yourself receives shadow, and receives it without being told about it:
    // ctx.light simply arrives already darkened where the casting light cannot see. Core leaves a
    // material out of the shadow on purpose, and the consequence is awkward enough to be worth
    // avoiding: a blob shadow's own disc is a material, so it would not receive either. There is
    // one model here, and it is that a model is a model.
    let coord = shadowCoordOf(in.worldPos);
    // The floor is a floor and not an addition, exactly as the built-in ending has it.
    let lit = max(litWithShadow(in.light, in.casterLight, coord), lights.ambient.rgb);

    // Divided here, once: a shader of your own receives the picture already stretched when the
    // material is affine, and the corrected one when it is not (see affineUv).
    let uv = in.uv.xy / in.uv.z;
    var ctx: FragContext;
    ctx.uv = uv;
    ctx.normal = in.normal;
    ctx.worldPos = in.worldPos;
    ctx.light = lit;
    ctx.shine = litWithShadow(in.shine, in.casterShine, coord);
    ctx.emissive = uniforms.emissive.rgb;
    ctx.viewDir = in.viewDir;
    ctx.color = in.color;

    // The painted colour is part of the surface, as it is in the built-in ending. The fog goes over
    // what the hook made, so a shader of your own sits in the scene's fog without asking for it.
    let shaded = effect(sampleTexture(uv) * uniforms.tint * in.color, ctx);
    return vec4<f32>(mix(shaded.rgb, lights.fog.rgb, in.fog), shaded.a);
}
`;

/**
 * Builds the whole shader for a model material: the engine's own declarations, the knobs the author
 * declared, whichever hooks they wrote, and the body that calls them.
 *
 * Either hook may be left out and the engine's own stands in, so a material that only recolours does
 * not have to repeat how a corner is placed, and one that only ripples does not have to repeat how
 * light becomes a colour.
 *
 * The declarations are the **same value** the built-in shader is built from, not a copy, so the two
 * cannot drift apart.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const buildMeshMaterialShader = (
    fragment: string | null,
    vertex: string | null,
    sig: TUniformSignature,
): string => {
    const { structText } = buildUniformLayout(sig);

    return [
        MESH_SHADER_TYPES,
        structText,
        `@group(${MESH_MATERIAL_GROUP}) @binding(0) var<uniform> mu: MaterialUniforms;`,
        VERT_CONTEXT,
        FRAG_CONTEXT,
        VERTEX_OUTPUT,
        SAMPLE,
        vertex ?? DEFAULT_VERTEX,
        fragment ?? DEFAULT_EFFECT,
        body(vertex === null ? PLAIN_NORMAL : DEFORMED_NORMAL),
    ].join('\n');
};
