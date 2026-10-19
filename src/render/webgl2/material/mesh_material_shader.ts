import { MAX_MATERIAL_MAPS } from '../../shared/material_maps';
import {
    MESH_FRAGMENT_HEAD_GLSL, MESH_SAMPLE_LIGHT_GLSL, MESH_VERTEX_ATTRIBUTES_GLSL,
} from '../mesh/mesh_shader';
import { MAX_LIGHTS } from '../../../light';
import { glslUniformBlock } from './uniform_block';
import type { TUniformSignature } from '../../../materials';

/**
 * How far apart the two samples are taken when a moved surface has to be re-measured.
 */
const EPSILON = 0.01;

/**
 * What the corner hook is told, the same members its twin declares.
 */
const VERT_CONTEXT = /* glsl */ `
struct VertContext {
    vec3 normal;
    vec2 uv;
    vec4 color;
};
`;

/**
 * What the colour hook is told, the same members its twin declares.
 */
const FRAG_CONTEXT = /* glsl */ `
struct FragContext {
    vec2 uv;
    vec3 normal;
    vec3 worldPos;
    vec3 light;
    vec3 shine;
    vec3 emissive;
    vec3 viewDir;
    vec4 color;
};
`;

/**
 * What a material's vertex carries on: wider than the built-in one, and it pays for the extra.
 */
const VARYINGS = (direction: 'out' | 'in'): string => /* glsl */ `
${direction} vec3 vUv;
${direction} vec3 vLight;
${direction} vec3 vShine;
${direction} vec3 vNormal;
${direction} vec3 vWorldPos;
${direction} vec3 vViewDir;
// The casting light's own share of vLight and vShine, so the ending can take that one away and no
// other. Where the corner falls in the map is not carried: this one already carries the world
// position, so the ending works it out from that and saves a number across every triangle.
${direction} vec3 vCasterLight;
${direction} vec3 vCasterShine;
${direction} vec4 vColor;
${direction} float vFog;
`;

/**
 * Reading the picture, in a form a hook may call from inside a branch.
 */
const SAMPLE = /* glsl */ `
vec4 sampleTexture(vec2 uv) {
    return textureLod(meshTexture, uv, 0.0);
}
`;

/**
 * The material's extra maps: always all four samplers, and one reader per name the shader uses, in
 * the order it first reads them. The same readers by the same names as its WGSL twin.
 *
 * `envUv` is where a reflection of the world lands on a round picture of its surroundings.
 */
const maps = (names: readonly string[]): string => {
    const slots = Array.from({ length: MAX_MATERIAL_MAPS }, (_, i) => `uniform sampler2D meshMap${i};`).join('\n');
    const readers = names.map((name, i) =>
        `vec4 sampleMap_${name}(vec2 uv) {\n    return textureLod(meshMap${i}, uv, 0.0);\n}`).join('\n');
    return `${slots}

vec2 envUv(FragContext ctx) {
    vec3 r = reflect(-ctx.viewDir, normalize(ctx.normal));
    float m = max(2.0 * sqrt(r.x * r.x + r.y * r.y + (r.z + 1.0) * (r.z + 1.0)), 0.0001);
    return vec2(r.x / m + 0.5, 0.5 - r.y / m);
}
${readers}
`;
};

/**
 * A corner hook that moves nothing.
 */
const DEFAULT_VERTEX = /* glsl */ `
vec3 vertex(vec3 pos, VertContext ctx) {
    return pos;
}
`;

/**
 * A colour hook that does what the engine would have done, word for word.
 */
const DEFAULT_EFFECT = /* glsl */ `
vec4 effect(vec4 surface, FragContext ctx) {
    return vec4(surface.rgb * ctx.light + ctx.shine + ctx.emissive, surface.a);
}
`;

/**
 * The surface kept as it was.
 */
const PLAIN_NORMAL = /* glsl */ `
    vec3 shaped = ctx.normal;
`;

/**
 * The surface measured again after the corners moved.
 *
 * **The branches are the other way round from its twin.** WGSL's `select` takes the false value
 * first and a ternary takes the true one, so the two say the same thing written in opposite orders.
 * Copying one into the other without swapping them is the easiest mistake in this file, and it looks
 * like broken lighting at the poles rather than like a typo.
 */
const DEFORMED_NORMAL = /* glsl */ `
    vec3 reference = abs(ctx.normal.y) > 0.9 ? vec3(1.0, 0.0, 0.0) : vec3(0.0, 1.0, 0.0);
    vec3 tangent = normalize(cross(ctx.normal, reference));
    vec3 bitangent = cross(ctx.normal, tangent);
    vec3 moved1 = vertex(aPosition + tangent * ${EPSILON}, ctx);
    vec3 moved2 = vertex(aPosition + bitangent * ${EPSILON}, ctx);
    vec3 shaped = normalize(cross(moved1 - local, moved2 - local));
`;

/**
 * The bones, read from the run of them the engine keeps in a texture, and how a corner names them.
 * Word for word the built-in bending (mesh/skinned_shader.ts).
 */
const SKIN_HEAD = /* glsl */ `
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
`;

/**
 * The bones, mixed by how much of the corner each one owns, applied after the corner hook: the hook
 * moves the model as it stands at rest, and the bones bend what it made.
 */
const SKIN = /* glsl */ `
    mat4 skin =
        aWeights.x * boneMatrix(int(aBones.x)) +
        aWeights.y * boneMatrix(int(aBones.y)) +
        aWeights.z * boneMatrix(int(aBones.z)) +
        aWeights.w * boneMatrix(int(aBones.w));
    vec4 placed = skin * vec4(local, 1.0);
    vec3 facing = mat3(skin) * shaped;
`;

/**
 * The corner where the hook left it, for a model that does not bend.
 */
const STILL = /* glsl */ `
    vec4 placed = vec4(local, 1.0);
    vec3 facing = shaped;
`;

const vertexBody = (normal: string, skinned: boolean): string => /* glsl */ `
void main() {
    VertContext ctx;
    ctx.normal = aNormal;
    ctx.uv = aUv;
    ctx.color = aColor;

    vec3 local = vertex(aPosition, ctx);
${normal}${skinned ? SKIN : STILL}
    gl_Position = snapToPixels(uniforms.mvp * placed);

    vec3 worldPos = (uniforms.model * placed).xyz;
    vec3 worldNormal = normalize((uniforms.normalMatrix * vec4(facing, 0.0)).xyz);
    vec3 viewDir = viewDirOf(worldPos);

    vec3 diffuse = vec3(0.0);
    vec3 shine = vec3(0.0);
    vec3 casterDiffuse = vec3(0.0);
    vec3 casterShine = vec3(0.0);
    int count = int(lights.ambient.w);
    int caster = int(lights.shadowParams.w);
    for (int i = 0; i < ${MAX_LIGHTS}; i++) {
        if (i >= count) break;
        vec3 d;
        vec3 s;
        sampleLight(i, worldPos, worldNormal, viewDir, d, s);
        diffuse += d;
        shine += s;
        if (i == caster) {
            casterDiffuse = d;
            casterShine = s;
        }
    }

    vLight = diffuse;
    vShine = shine;
    vCasterLight = casterDiffuse;
    vCasterShine = casterShine;
    vUv = affineUv(aUv, gl_Position);
    vNormal = worldNormal;
    vWorldPos = worldPos;
    vViewDir = viewDir;
    vColor = aColor;
    vFog = fogAt(worldPos);
}
`;

const FRAGMENT_BODY = /* glsl */ `
out vec4 fragColor;

void main() {
    // A shader you wrote yourself receives shadow, and receives it without being told about it:
    // ctx.light simply arrives already darkened where the casting light cannot see.
    vec4 coord = lights.shadowMatrix * vec4(vWorldPos, 1.0);
    vec3 lit = max(litWithShadow(vLight, vCasterLight, coord), lights.ambient.rgb);

    // Divided here, once: a shader of your own receives the picture already stretched when the
    // material is affine, and the corrected one when it is not (see affineUv).
    vec2 uv = vUv.xy / vUv.z;
    FragContext ctx;
    ctx.uv = uv;
    ctx.normal = vNormal;
    ctx.worldPos = vWorldPos;
    ctx.light = lit;
    ctx.shine = litWithShadow(vShine, vCasterShine, coord);
    ctx.emissive = uniforms.emissive.rgb;
    ctx.viewDir = vViewDir;
    ctx.color = vColor;

    // The painted colour is part of the surface, as it is in the built-in ending. The fog goes over
    // what the hook made, so a shader of your own sits in the scene's fog without asking for it.
    vec4 shaded = effect(sampleTexture(uv) * uniforms.tint * vColor, ctx);
    fragColor = vec4(mix(shaded.rgb, lights.fog.rgb, vFog), shaded.a);
}
`;

/**
 * Builds a model material's two halves for this backend.
 *
 * Everything is in the order GLSL insists on, which is what most of the shuffling here is for: a
 * thing has to be declared before whatever uses it, and the light helper, the contexts and the
 * hooks are all things the body uses.
 *
 * `skinned` is the same shader for a model that bends: it also reads the bones each corner names and
 * bends the corner around them, after the corner hook has moved it.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const buildMeshMaterialShaderGlsl = (
    fragment: string | null,
    vertex: string | null,
    sig: TUniformSignature,
    mapNames: readonly string[] = [],
    skinned = false,
): { vertex: string; fragment: string } => ({
    vertex: [
        MESH_VERTEX_ATTRIBUTES_GLSL,
        skinned ? SKIN_HEAD : '',
        glslUniformBlock(sig),
        VARYINGS('out'),
        MESH_SAMPLE_LIGHT_GLSL,
        VERT_CONTEXT,
        vertex ?? DEFAULT_VERTEX,
        vertexBody(vertex === null ? PLAIN_NORMAL : DEFORMED_NORMAL, skinned),
    ].join('\n'),
    fragment: [
        MESH_FRAGMENT_HEAD_GLSL,
        glslUniformBlock(sig),
        VARYINGS('in'),
        FRAG_CONTEXT,
        SAMPLE,
        maps(mapNames),
        fragment ?? DEFAULT_EFFECT,
        FRAGMENT_BODY,
    ].join('\n'),
});
