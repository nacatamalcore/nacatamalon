import { FACED_LIGHT, FACING_TURN, MESH_SHADER_TYPES, twoSidedOutput, TWO_SIDED_WRITE, worldNormalOf } from '../mesh/mesh_shader';
import { buildUniformLayout } from '../../shared/material_uniforms';
import { SHADOW_CUT_UNIFORMS_WGSL, SHADOW_UNIFORMS_WGSL } from '../shadow/shadow_shader';
import { MAX_MATERIAL_MAPS } from '../../shared/material_maps';
import type { TCullMode, TUniformSignature } from '../../../materials';

/**
 * Where a model material's own parameters are bound.
 *
 * Groups 0, 1 and 2 are the lights, the picture and the model's own numbers, all three shared with
 * the built-in pipeline. Group 3 is the material's: its knobs, its maps, and, for a model that bends,
 * its bones too. The built-in pipeline keeps a model's bones in group 3 as well, and WebGPU promises
 * no more than four groups, so a material on a model that bends carries them in its own group rather
 * than in a fifth.
 */
export const MESH_MATERIAL_GROUP = 3;

/**
 * Where a bending model's bones are bound inside the material's group: after the knobs (0) and the
 * maps (1 to 8).
 */
export const MESH_MATERIAL_JOINTS_BINDING = 1 + MAX_MATERIAL_MAPS * 2;

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
    // Which way across the surface the picture runs, and which way down: with the normal, the
    // frame a hook moves the picture over the surface in.
    tangent: vec3<f32>,
    bitangent: vec3<f32>,
    // A second picture coordinate: the file's own, or the first again.
    uv2: vec2<f32>,
};

// Four numbers the corner hook hands on to the colour hook, smeared across the triangle like
// everything else a corner carries: how high a wave lifted it, a light of its own worked out at the
// corner, its place before it was moved. Written by the hook as carry = vec4<f32>(...), read as
// ctx.carry. Nothing written, it is nothing.
var<private> carry: vec4<f32>;
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
    // Where on the screen this is, in the game's pixels: (0, 0) at the top left. A dot screen or a
    // hatch laid over a model lines up with the screen through this, not with the model.
    screen: vec2<f32>,
    // Which way across the surface the picture runs, and which way down, in the world: with the
    // normal, the frame a relief or a ripple moves the picture in.
    tangent: vec3<f32>,
    bitangent: vec3<f32>,
    // A second picture coordinate: the file's own, or the first again.
    uv2: vec2<f32>,
    // Whether this is the side of the triangle facing the camera. Only ever false on a material that
    // keeps the other side (cull 'front' or 'none'): a liquid seen from below in another colour.
    frontFacing: bool,
    // What the corner hook put in carry, smeared across the triangle. Nothing put, nothing.
    carry: vec4<f32>,
    // How open this place is to the light from all around, 1 wide open to 0 shut in, from the
    // material's occlusion. Already in light; this is it on its own, for a hook that dims its shine
    // in a crease or dirties it. 1 with no occlusion.
    occlusion: f32,
};
`;

/**
 * What the vertex carries to the fragment for a material.
 *
 * Wider than the built-in one, which carries only what the built-in ending reads. A material may ask
 * where the surface is and which way it faces, so those are carried too, and carrying them costs
 * something across every triangle. That cost is why the ordinary model does not pay it.
 *
 * Drawn on both sides, the way it is seen is not carried but worked out again at the pixel, from
 * where the pixel is: that leaves room for the light of the other side, which a card promises room
 * for only just.
 */
const vertexOutput = (cull: TCullMode): string => /* wgsl */ `
struct VertexOutput {
    @builtin(position) position: vec4<f32>,
    @location(0) uv: vec3<f32>,
    @location(1) light: vec3<f32>,
    @location(2) shine: vec3<f32>,
    // Which way it faces, and in w the second picture's place across (see screen).
    @location(3) normal: vec4<f32>,
    // Where it is in the world, and in w how far into the fog: one number did not earn a place of
    // its own once carry needed one.
    @location(4) worldPos: vec4<f32>,
${cull === 'none' ? '' : `    @location(5) viewDir: vec3<f32>,
`}    // The casting light's own share of the two above, so the ending can take that one away and no
    // other. Where the corner falls in the map is **not** carried: this one already carries the
    // world position, so the ending works it out from that and saves a number across every
    // triangle.
    @location(6) casterLight: vec3<f32>,
    @location(7) casterShine: vec3<f32>,
    @location(8) color: vec4<f32>,
    // What the corner hook put in carry, in the place the fog left.
    @location(9) carry: vec4<f32>,
    // Where the corner lands on the screen, before the card divides by its depth (x, y and w).
    // Divided at the pixel instead: the card smears every number for depth, so the three arrive as
    // they are at that pixel and the division gives exactly where it is. See screenOf. In w the
    // second picture's place down: with normal's w that is the second picture's place, in two
    // numbers places already had spare, rather than a place of its own of the sixteen a card
    // promises, which a model drawn on both sides had filled.
    @location(10) screen: vec4<f32>,
    // The tangent in the world, with its hand in w.
    @location(11) tangent: vec4<f32>,${cull === 'none' ? twoSidedOutput(12) : ''}
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
/**
 * The material's extra maps: always all four slots, so every material shader has the same layout, and
 * one reader per name the shader uses. Which slot a name reads is the order the shader first reads it
 * in, which the caller works out once and binds by.
 *
 * `envUv` is where a reflection of the world lands on a round picture of its surroundings: the chrome
 * of the era, read as `sampleMap_env(envUv(ctx))`.
 */
const maps = (names: readonly string[]): string => {
    const slots = Array.from({ length: MAX_MATERIAL_MAPS }, (_, i) =>
        `@group(${MESH_MATERIAL_GROUP}) @binding(${1 + i * 2}) var mapSampler${i}: sampler;\n` +
        `@group(${MESH_MATERIAL_GROUP}) @binding(${2 + i * 2}) var mapTexture${i}: texture_2d<f32>;`).join('\n');
    const readers = names.map((name, i) =>
        `fn sampleMap_${name}(uv: vec2<f32>) -> vec4<f32> {\n    return textureSampleLevel(mapTexture${i}, mapSampler${i}, uv, 0.0);\n}`).join('\n');
    return `${slots}

fn envUv(ctx: FragContext) -> vec2<f32> {
    let r = reflect(-ctx.viewDir, normalize(ctx.normal));
    let m = max(2.0 * sqrt(r.x * r.x + r.y * r.y + (r.z + 1.0) * (r.z + 1.0)), 0.0001);
    return vec2<f32>(r.x / m + 0.5, 0.5 - r.y / m);
}
${readers}
`;
};

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

/**
 * The bones, mixed by how much of the corner each one owns, applied after the corner hook: the hook
 * moves the model as it stands at rest, and the bones bend what it made, so a ripple or a swell goes
 * with the arm it is on. Word for word the built-in bending (skinned_shader.ts), so a model looks the
 * same whichever path draws it.
 */
const SKIN = /* wgsl */ `
    let skin =
        weights.x * joints[u32(bones.x)] +
        weights.y * joints[u32(bones.y)] +
        weights.z * joints[u32(bones.z)] +
        weights.w * joints[u32(bones.w)];
    let placed = skin * vec4<f32>(local, 1.0);
    let turn = mat3x3<f32>(skin[0].xyz, skin[1].xyz, skin[2].xyz);
    // The facing by the inverse of the mix, so a bone stretched more one way than another leans it
    // the right way; what lies along the surface by the mix itself.
    let facing = facingTurnOf(turn) * shaped;
    let across = turn * cornerTangent.xyz;
`;

/**
 * The corner where the hook left it, for a model that does not bend.
 */
const STILL = /* wgsl */ `
    let placed = vec4<f32>(local, 1.0);
    let facing = shaped;
    let across = cornerTangent.xyz;
`;

/**
 * What a corner reads, and what its hook is told about it: the same in the pass that draws the model
 * and in the one that draws its shadow, so the hook moves the corner the same way in both.
 */
const cornerInputs = (skinned: boolean): string => /* wgsl */ `
    @location(0) position: vec3<f32>,
    @location(1) normal: vec3<f32>,
    @location(2) uv: vec2<f32>,
    @location(5) color: vec4<f32>,
    @location(6) cornerTangent: vec4<f32>,
    @location(7) cornerUv2: vec2<f32>,${skinned ? `
    @location(3) bones: vec4<f32>,
    @location(4) weights: vec4<f32>,` : ''}
`;

const CORNER_CONTEXT = /* wgsl */ `
    var ctx: VertContext;
    ctx.normal = normal;
    ctx.uv = uv;
    ctx.color = color;
    ctx.tangent = cornerTangent.xyz;
    ctx.bitangent = cross(normal, cornerTangent.xyz) * cornerTangent.w;
    ctx.uv2 = cornerUv2;

    let local = vertex(position, ctx);
    // Kept now: a surface measured again calls the hook twice more, at corners beside this one.
    let carried = carry;
`;

const body = (normal: string, skinned: boolean, cull: TCullMode): string => {
    // A model drawn on both sides reads the light of the side it is; any other has one.
    const lit = cull === 'none' ? 'side' : 'in';
    return /* wgsl */ `
${skinned ? `@group(${MESH_MATERIAL_GROUP}) @binding(${MESH_MATERIAL_JOINTS_BINDING}) var<storage, read> joints: array<mat4x4<f32>>;${FACING_TURN}` : ''}

@vertex
fn vs(${cornerInputs(skinned)}) -> VertexOutput {${CORNER_CONTEXT}${normal}${skinned ? SKIN : STILL}
    var out: VertexOutput;
    out.position = snapToPixels(uniforms.mvp * placed);

    let worldPos = (uniforms.model * placed).xyz;
    let worldNormal = ${worldNormalOf(cull, 'facing')};
    let viewDir = viewDirOf(worldPos);

    let surface = litBy(worldPos, worldNormal, viewDir);
    out.light = surface.diffuse;
    out.shine = surface.shine;
    out.casterLight = surface.casterDiffuse;
    out.casterShine = surface.casterShine;${cull === 'none' ? TWO_SIDED_WRITE : ''}
    out.uv = affineUv(uv, out.position);
    // The second picture coordinate stretched the way the first is, so whatever is laid out by it
    // stays on what the first lays out when the material is affine.
    let stretched2 = affineUv(cornerUv2, out.position).xy;
    out.normal = vec4<f32>(worldNormal, stretched2.x);
    out.worldPos = vec4<f32>(worldPos, fogAt(worldPos));${cull === 'none' ? '' : `
    out.viewDir = viewDir;`}
    out.color = color;
    out.screen = vec4<f32>(out.position.xyw, stretched2.y);
    // A direction, so it is moved by the model's own turn and stretch rather than the facing's.
    out.tangent = vec4<f32>(normalize((uniforms.model * vec4<f32>(across, 0.0)).xyz), cornerTangent.w);
    out.carry = carried;
    return out;
}

// Where a pixel is on the screen, in the game's pixels with (0, 0) at the top left: the corner's
// x and y divided by its w here, at the pixel, then from -1..1 (up) to 0..1 (down), times the size
// of the game. The twin of screenOf in webgl2/material/mesh_material_shader.ts.
fn screenOf(clip: vec3<f32>) -> vec2<f32> {
    let ndc = clip.xy / clip.z;
    return vec2<f32>(ndc.x * 0.5 + 0.5, 0.5 - ndc.y * 0.5) * mu.resolution;
}

@fragment
fn fs(in: VertexOutput, @builtin(front_facing) front: bool) -> @location(0) vec4<f32> {${cull === 'none' ? `
    // Drawn on both sides: lit as the side it is, and facing the way that side does.
    let side = facedLight(in, front);
    let normal = select(-in.normal.xyz, in.normal.xyz, front);` : ''}
    // A shader you wrote yourself receives shadow, and receives it without being told about it:
    // ctx.light simply arrives already darkened where the casting light cannot see. Core leaves a
    // material out of the shadow on purpose, and the consequence is awkward enough to be worth
    // avoiding: a blob shadow's own disc is a material, so it would not receive either. There is
    // one model here, and it is that a model is a model.
    let coord = shadowCoordOf(in.worldPos.xyz);

    // Divided here, once: a shader of your own receives the picture already stretched when the
    // material is affine, and the corrected one when it is not (see affineUv).
    let uv = in.uv.xy / in.uv.z;
    let uv2 = vec2<f32>(in.normal.w, in.screen.w) / in.uv.z;
    // Laid out by the coordinate the material says, which rides beside its amount (see
    // fill_mesh_uniforms.ts).
    let occlusion = occlusionAt(select(uv, uv2, uniforms.normalMatrix[1].w > 0.5));
    // The floor is a floor and not an addition, and a crease lowers it, exactly as the built-in
    // ending has it.
    let lit = max(litWithShadow(${lit}.light, ${lit}.casterLight, coord), lights.ambient.rgb * occlusion);

    var ctx: FragContext;
    ctx.uv = uv;
    ctx.normal = ${cull === 'none' ? 'normal' : 'in.normal.xyz'};
    ctx.worldPos = in.worldPos.xyz;
    ctx.light = lit;
    ctx.shine = litWithShadow(${lit}.shine, ${lit}.casterShine, coord);
    // The glow through its picture, so a shader of your own adds it the way the built-in one does.
    ctx.emissive = uniforms.emissive.rgb * textureSampleLevel(meshEmissive, meshSampler, uv, 0.0).rgb;
    ctx.viewDir = ${cull === 'none' ? 'viewDirOf(in.worldPos.xyz)' : 'in.viewDir'};
    ctx.color = in.color;
    ctx.screen = screenOf(in.screen.xyz);
    ctx.tangent = normalize(in.tangent.xyz);
    ctx.bitangent = cross(normalize(ctx.normal), ctx.tangent) * in.tangent.w;
    ctx.uv2 = uv2;
    ctx.frontFacing = front;
    ctx.carry = in.carry;
    ctx.occlusion = occlusion;

    // The painted colour is part of the surface, as it is in the built-in ending. The fog goes over
    // what the hook made, so a shader of your own sits in the scene's fog without asking for it.
    let shaded = effect(sampleTexture(uv) * uniforms.tint * in.color, ctx);
    // Cut out rather than blended: below the material's cutoff, by the alpha the hook made, the
    // pixel is not there at all, and above it is solid. It rides in a spare number of the turning
    // matrix; zero cuts nothing.
    if (shaded.a < uniforms.normalMatrix[3].z) {
        discard;
    }
    return vec4<f32>(mix(shaded.rgb, lights.fog.rgb, in.worldPos.w), shaded.a);
}
`;
};

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
 * `skinned` is the same shader for a model that bends: it also reads the bones each corner names and
 * bends the corner around them, after the corner hook has moved it.
 *
 * `cull` is the side of its triangles the material throws away, which decides how it is lit: from
 * inside for `'front'`, on both sides for `'none'`.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const buildMeshMaterialShader = (
    fragment: string | null,
    vertex: string | null,
    sig: TUniformSignature,
    mapNames: readonly string[] = [],
    skinned = false,
    cull: TCullMode = 'back',
): string => {
    const { structText } = buildUniformLayout(sig);

    return [
        MESH_SHADER_TYPES,
        structText,
        `@group(${MESH_MATERIAL_GROUP}) @binding(0) var<uniform> mu: MaterialUniforms;`,
        VERT_CONTEXT,
        FRAG_CONTEXT,
        vertexOutput(cull),
        ...(cull === 'none' ? [FACED_LIGHT] : []),
        SAMPLE,
        maps(mapNames),
        vertex ?? DEFAULT_VERTEX,
        fragment ?? DEFAULT_EFFECT,
        body(vertex === null ? PLAIN_NORMAL : DEFORMED_NORMAL, skinned, cull),
    ].join('\n');
};

/**
 * The shader a model material's shadow is drawn with: its corner hook, moving each corner exactly as
 * it does when the model is drawn, and then the corner seen from the light. Nothing else: no light,
 * no colour, no fragment at all, like the built-in shadow.
 *
 * Without it the map holds the model as its file made it, so a flag that waves casts a flat one, and
 * that flat ghost shadows the cloth wherever the wave takes it behind.
 *
 * **Cut out of its picture** (`cut`, for a material with `alphaCutoff`), it has a colour stage after
 * all, which colours nothing either: it works the alpha out as the drawn model does, its picture
 * times its corners' colour and its own alpha, run through its colour hook when it has one, and
 * throws away the pixels below the cutoff. So a dissolve casts what is left of it, and a waving flag
 * full of holes casts the holes. The hook is told the same place in the picture and on the surface;
 * the light it is told is plain white and the shine none, since no light has reached anything yet,
 * which a hook deciding its alpha by them would see. Its picture is then read in group 1, where the
 * drawn model reads it, and its block carries how it is cut.
 *
 * The material's own group is kept where it is (group 3), with its knobs, its maps and, for a model
 * that bends, its bones, so a hook reads `mu` and `sampleMap_<name>` here as it does there. The
 * groups between are left empty.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const buildMeshMaterialShadowShader = (
    vertex: string | null,
    sig: TUniformSignature,
    mapNames: readonly string[] = [],
    skinned = false,
    cut: { fragment: string | null } | null = null,
): string => {
    const { structText } = buildUniformLayout(sig);
    const bend = skinned ? `
    let skin =
        weights.x * joints[u32(bones.x)] +
        weights.y * joints[u32(bones.y)] +
        weights.z * joints[u32(bones.z)] +
        weights.w * joints[u32(bones.w)];
    let placed = skin * vec4<f32>(local, 1.0);` : `
    let placed = vec4<f32>(local, 1.0);`;

    return [
        cut === null ? SHADOW_UNIFORMS_WGSL : SHADOW_CUT_UNIFORMS_WGSL,
        cut === null ? '' : `@group(1) @binding(0) var meshSampler: sampler;
@group(1) @binding(1) var meshTexture: texture_2d<f32>;`,
        structText,
        `@group(${MESH_MATERIAL_GROUP}) @binding(0) var<uniform> mu: MaterialUniforms;`,
        VERT_CONTEXT,
        // Declared because the map readers bring a helper that names it; filled only when cut.
        FRAG_CONTEXT,
        cut === null ? '' : SAMPLE,
        cut === null ? '' : FACING_TURN,
        maps(mapNames),
        vertex ?? DEFAULT_VERTEX,
        cut === null ? '' : cut.fragment ?? DEFAULT_EFFECT,
        skinned ? `@group(${MESH_MATERIAL_GROUP}) @binding(${MESH_MATERIAL_JOINTS_BINDING}) var<storage, read> joints: array<mat4x4<f32>>;` : '',
        cut === null ? /* wgsl */ `
@vertex
fn vs(${cornerInputs(skinned)}) -> @builtin(position) vec4<f32> {${CORNER_CONTEXT}${bend}
    return shadow.lightViewProj * shadow.model * placed;
}
` : /* wgsl */ `
struct CutOutput {
    @builtin(position) position: vec4<f32>,
    @location(0) uv: vec2<f32>,
    @location(1) normal: vec3<f32>,
    @location(2) worldPos: vec3<f32>,
    @location(3) color: vec4<f32>,
    @location(4) tangent: vec4<f32>,
    @location(5) uv2: vec2<f32>,
    @location(6) carry: vec4<f32>,
};

@vertex
fn vs(${cornerInputs(skinned)}) -> CutOutput {${CORNER_CONTEXT}${vertex === null ? PLAIN_NORMAL : DEFORMED_NORMAL}${bend}
    // Turned as the model is, and measured again where the hook moved it, as the drawn model's is:
    // what the colour hook reads of the surface. The facing by the inverse of the placement, as the
    // drawn model's normal matrix turns it, so a model stretched unevenly is cut by the same facing.
    let turn = ${skinned ? 'mat3x3<f32>(skin[0].xyz, skin[1].xyz, skin[2].xyz)' : 'mat3x3<f32>(1.0, 0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0, 1.0)'};
    let place = mat3x3<f32>(shadow.model[0].xyz, shadow.model[1].xyz, shadow.model[2].xyz);
    var out: CutOutput;
    out.position = shadow.lightViewProj * shadow.model * placed;
    out.uv = uv;
    out.normal = normalize(facingTurnOf(place) * ${skinned ? '(facingTurnOf(turn) * shaped)' : 'shaped'});
    out.worldPos = (shadow.model * placed).xyz;
    out.color = color;
    out.tangent = vec4<f32>(normalize((shadow.model * vec4<f32>(turn * cornerTangent.xyz, 0.0)).xyz), cornerTangent.w);
    out.uv2 = cornerUv2;
    out.carry = carried;
    return out;
}

@fragment
fn fs(in: CutOutput, @builtin(front_facing) front: bool) {
    var ctx: FragContext;
    ctx.uv = in.uv;
    ctx.normal = select(-in.normal, in.normal, front);
    ctx.worldPos = in.worldPos;
    ctx.light = vec3<f32>(1.0);
    ctx.shine = vec3<f32>(0.0);
    ctx.emissive = vec3<f32>(0.0);
    ctx.viewDir = ctx.normal;
    ctx.color = in.color;
    ctx.screen = vec2<f32>(0.0);
    ctx.tangent = in.tangent.xyz;
    ctx.bitangent = cross(ctx.normal, ctx.tangent) * in.tangent.w;
    ctx.uv2 = in.uv2;
    ctx.frontFacing = front;
    ctx.carry = in.carry;
    ctx.occlusion = 1.0;
    // The alpha the drawn model is cut by: its tint's colour does not change it, its alpha does.
    let shaded = effect(sampleTexture(in.uv) * vec4<f32>(1.0, 1.0, 1.0, shadow.cut.y) * in.color, ctx);
    if (shaded.a < shadow.cut.x) {
        discard;
    }
}
`,
    ].join('\n');
};
