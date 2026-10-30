import { MAX_MATERIAL_MAPS } from '../../shared/material_maps';
import {
    FACED_LIGHT_GLSL, FACING_TURN_GLSL, LIT_BY_GLSL, MESH_FRAGMENT_HEAD_GLSL, MESH_SAMPLE_LIGHT_GLSL, MESH_VERTEX_ATTRIBUTES_GLSL,
    TWO_SIDED_VARYINGS_GLSL, TWO_SIDED_WRITE_GLSL, worldNormalOfGlsl,
} from '../mesh/mesh_shader';
import { MAX_LIGHTS } from '../../../light';
import { glslUniformBlock } from './uniform_block';
import { SHADOW_FRAGMENT_GLSL } from '../shadow/shadow_shader';
import type { TCullMode, TUniformSignature } from '../../../materials';

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
    vec3 tangent;
    vec3 bitangent;
    vec2 uv2;
};

// Four numbers the corner hook hands on to the colour hook, as its twin keeps them.
vec4 carry = vec4(0.0);
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
    vec2 screen;
    vec3 tangent;
    vec3 bitangent;
    vec2 uv2;
    bool frontFacing;
    vec4 carry;
};
`;

/**
 * What a material's vertex carries on: wider than the built-in one, and it pays for the extra.
 */
const VARYINGS = (direction: 'out' | 'in', cull: TCullMode): string => /* glsl */ `
${direction} vec3 vUv;
${direction} vec3 vLight;
${direction} vec3 vShine;
// Which way it faces, and in w the second picture's place across (see vScreen).
${direction} vec4 vNormal;
${direction} vec3 vWorldPos;
${cull === 'none' ? '' : `${direction} vec3 vViewDir;
`}// The casting light's own share of vLight and vShine, so the ending can take that one away and no
// other. Where the corner falls in the map is not carried: this one already carries the world
// position, so the ending works it out from that and saves a number across every triangle.
${direction} vec3 vCasterLight;
${direction} vec3 vCasterShine;
${direction} vec4 vColor;
${direction} float vFog;
// Where the corner lands on the screen before the division by depth (x, y and w), divided at the
// pixel: see screenOf. In w the second picture's place down: with vNormal's w that is the second
// picture's place, in two columns the rows already leave rather than a row of its own, as its twin
// in WGSL carries it.
${direction} vec4 vScreen;
// The tangent in the world, with its hand in w.
${direction} vec4 vTangent;
// What the corner hook put in carry.
${direction} vec4 vCarry;
${cull === 'none' ? TWO_SIDED_VARYINGS_GLSL(direction) : ''}`;

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
 * Each corner's detail, from a run of its own: the tangent and its hand, and a second picture
 * coordinate. Only a material's program declares them; the built-in one leaves 6 and 7 unread.
 */
const DETAIL_HEAD = /* glsl */ `
layout(location = 6) in vec4 aTangent;
layout(location = 7) in vec2 aUv2;
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
${FACING_TURN_GLSL}`;

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
    // The facing by the inverse of the mix, so a bone stretched more one way than another leans it
    // the right way; what lies along the surface by the mix itself.
    vec3 facing = facingTurnOf(mat3(skin)) * shaped;
    vec3 across = mat3(skin) * aTangent.xyz;
`;

/**
 * The corner where the hook left it, for a model that does not bend.
 */
const STILL = /* glsl */ `
    vec4 placed = vec4(local, 1.0);
    vec3 facing = shaped;
    vec3 across = aTangent.xyz;
`;

/**
 * What the corner hook is told, and the corner it gives back: the same in the pass that draws the
 * model and in the one that draws its shadow, so the hook moves the corner the same way in both.
 */
const CORNER_CONTEXT = /* glsl */ `
    VertContext ctx;
    ctx.normal = aNormal;
    ctx.uv = aUv;
    ctx.color = aColor;
    ctx.tangent = aTangent.xyz;
    ctx.bitangent = cross(aNormal, aTangent.xyz) * aTangent.w;
    ctx.uv2 = aUv2;

    vec3 local = vertex(aPosition, ctx);
    // Kept now: a surface measured again calls the hook twice more, at corners beside this one.
    vec4 carried = carry;
`;

const vertexBody = (normal: string, skinned: boolean, cull: TCullMode): string => /* glsl */ `
void main() {${CORNER_CONTEXT}${normal}${skinned ? SKIN : STILL}
    gl_Position = snapToPixels(uniforms.mvp * placed);

    vec3 worldPos = (uniforms.model * placed).xyz;
    vec3 worldNormal = ${worldNormalOfGlsl(cull, 'facing')};
    vec3 viewDir = viewDirOf(worldPos);

    vec3 diffuse = vec3(0.0);
    vec3 shine = vec3(0.0);
    vec3 casterDiffuse = vec3(0.0);
    vec3 casterShine = vec3(0.0);
    int caster = int(lights.shadowParams.w);
    for (int k = 0; k < ${MAX_LIGHTS}; k++) {
        int named = meshLight(k);
        if (named == 0) break;
        int i = named - 1;
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
    vCasterShine = casterShine;${cull === 'none' ? TWO_SIDED_WRITE_GLSL : ''}
    vUv = affineUv(aUv, gl_Position);
    vNormal = vec4(worldNormal, aUv2.x);
    vWorldPos = worldPos;
${cull === 'none' ? '' : `    vViewDir = viewDir;
`}    vColor = aColor;
    vFog = fogAt(worldPos);
    vScreen = vec4(gl_Position.xyw, aUv2.y);
    // A direction, so it is moved by the model's own turn and stretch rather than the facing's.
    vTangent = vec4(normalize((uniforms.model * vec4(across, 0.0)).xyz), aTangent.w);
    vCarry = carried;
}
`;

const fragmentBody = (cull: TCullMode): string => {
    // A model drawn on both sides reads the light of the side it is, and faces the way that side does.
    const [light, shine, casterLight, casterShine] = cull === 'none'
        ? ['sideLight', 'sideShine', 'sideCasterLight', 'sideCasterShine']
        : ['vLight', 'vShine', 'vCasterLight', 'vCasterShine'];
    return /* glsl */ `
out vec4 fragColor;

// Where a pixel is on the screen, in the game's pixels with (0, 0) at the top left. The twin of
// screenOf in webgpu/material/mesh_material_shader.ts: gl_Position carries y up on both cards, so
// the same flip gives the same answer, and gl_FragCoord (bottom up here, top down there) is never
// read.
vec2 screenOf(vec3 clip) {
    vec2 ndc = clip.xy / clip.z;
    return vec2(ndc.x * 0.5 + 0.5, 0.5 - ndc.y * 0.5) * mu.resolution;
}

void main() {${cull === 'none' ? FACED_LIGHT_GLSL : ''}
    // A shader you wrote yourself receives shadow, and receives it without being told about it:
    // ctx.light simply arrives already darkened where the casting light cannot see.
    vec4 coord = shadowCoordOf(vWorldPos);
    vec3 lit = max(litWithShadow(${light}, ${casterLight}, coord), lights.ambient.rgb);

    // Divided here, once: a shader of your own receives the picture already stretched when the
    // material is affine, and the corrected one when it is not (see affineUv).
    vec2 uv = vUv.xy / vUv.z;
    FragContext ctx;
    ctx.uv = uv;
    ctx.normal = ${cull === 'none' ? '(gl_FrontFacing ? vNormal.xyz : -vNormal.xyz)' : 'vNormal.xyz'};
    ctx.worldPos = vWorldPos;
    ctx.light = lit;
    ctx.shine = litWithShadow(${shine}, ${casterShine}, coord);
    // The glow through its picture, so a shader of your own adds it the way the built-in one does.
    ctx.emissive = uniforms.emissive.rgb * textureLod(meshEmissive, uv, 0.0).rgb;
    // Drawn on both sides, worked out again at the pixel rather than carried, as its twin does to make
    // room for the light of the other side.
    ctx.viewDir = ${cull === 'none' ? 'viewDirOf(vWorldPos)' : 'vViewDir'};
    ctx.color = vColor;
    ctx.screen = screenOf(vScreen.xyz);
    ctx.tangent = normalize(vTangent.xyz);
    ctx.bitangent = cross(normalize(ctx.normal), ctx.tangent) * vTangent.w;
    ctx.uv2 = vec2(vNormal.w, vScreen.w);
    ctx.frontFacing = gl_FrontFacing;
    ctx.carry = vCarry;

    // The painted colour is part of the surface, as it is in the built-in ending. The fog goes over
    // what the hook made, so a shader of your own sits in the scene's fog without asking for it.
    vec4 shaded = effect(sampleTexture(uv) * uniforms.tint * vColor, ctx);
    // Cut out rather than blended: below the material's cutoff, by the alpha the hook made, the
    // pixel is not there at all, and above it is solid. It rides in a spare number of the turning
    // matrix; zero cuts nothing.
    if (shaded.a < uniforms.normalMatrix[3].z) {
        discard;
    }
    fragColor = vec4(mix(shaded.rgb, lights.fog.rgb, vFog), shaded.a);
}
`;
};

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
    cull: TCullMode = 'back',
): { vertex: string; fragment: string } => ({
    vertex: [
        MESH_VERTEX_ATTRIBUTES_GLSL,
        DETAIL_HEAD,
        skinned ? SKIN_HEAD : '',
        glslUniformBlock(sig),
        VARYINGS('out', cull),
        MESH_SAMPLE_LIGHT_GLSL,
        ...(cull === 'none' ? [LIT_BY_GLSL] : []),
        VERT_CONTEXT,
        vertex ?? DEFAULT_VERTEX,
        vertexBody(vertex === null ? PLAIN_NORMAL : DEFORMED_NORMAL, skinned, cull),
    ].join('\n'),
    fragment: [
        MESH_FRAGMENT_HEAD_GLSL,
        glslUniformBlock(sig),
        VARYINGS('in', cull),
        FRAG_CONTEXT,
        SAMPLE,
        maps(mapNames),
        fragment ?? DEFAULT_EFFECT,
        fragmentBody(cull),
    ].join('\n'),
});

/**
 * What a corner reads in a material's shadow: the same places as the drawn model, and none of its
 * blocks. The model's own numbers and the scene's lights are the drawn model's, bound for whichever
 * model was drawn last, so a hook that reads them is refused here, as it is on the other card,
 * rather than given another model's.
 */
const SHADOW_CORNERS_GLSL = /* glsl */ `#version 300 es
precision highp float;

layout(location = 0) in vec3 aPosition;
layout(location = 1) in vec3 aNormal;
layout(location = 2) in vec2 aUv;
layout(location = 5) in vec4 aColor;
`;

/**
 * The shadow of a model material on this card: its corner hook moving each corner as it does when
 * the model is drawn, then the corner seen from the light. The twin of buildMeshMaterialShadowShader
 * in webgpu/material/mesh_material_shader.ts; its colour stage colours nothing, as the built-in
 * shadow's does, and with `cut` throws away what the picture and the colour hook leave out.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const buildMeshMaterialShadowShaderGlsl = (
    vertex: string | null,
    sig: TUniformSignature,
    skinned = false,
    cut: { fragment: string | null; mapNames: readonly string[] } | null = null,
): { vertex: string; fragment: string } => {
    const bend = skinned ? `
    mat4 skin =
        aWeights.x * boneMatrix(int(aBones.x)) +
        aWeights.y * boneMatrix(int(aBones.y)) +
        aWeights.z * boneMatrix(int(aBones.z)) +
        aWeights.w * boneMatrix(int(aBones.w));
    vec4 placed = skin * vec4(local, 1.0);` : `
    vec4 placed = vec4(local, 1.0);`;
    if (cut === null) {
        return {
            vertex: [
                SHADOW_CORNERS_GLSL,
                DETAIL_HEAD,
                skinned ? SKIN_HEAD : '',
                glslUniformBlock(sig),
                'uniform mat4 uLightViewProj;\nuniform mat4 uModel;',
                VERT_CONTEXT,
                vertex ?? DEFAULT_VERTEX,
                /* glsl */ `
void main() {${CORNER_CONTEXT}${bend}
    gl_Position = uLightViewProj * uModel * placed;
}
`,
            ].join('\n'),
            fragment: SHADOW_FRAGMENT_GLSL,
        };
    }
    // Cut out of its picture: the alpha worked out as the drawn model works it out, through its
    // colour hook, told plain white light and no shine (see buildMeshMaterialShadowShader).
    return {
        vertex: [
            SHADOW_CORNERS_GLSL,
            DETAIL_HEAD,
            skinned ? SKIN_HEAD : '',
            glslUniformBlock(sig),
            'uniform mat4 uLightViewProj;\nuniform mat4 uModel;',
            'out vec2 vUv;\nout vec3 vNormal;\nout vec3 vWorldPos;\nout vec4 vColor;\nout vec4 vTangent;\nout vec2 vUv2;\nout vec4 vCarry;',
            // Already among the bones' helpers when it bends.
            skinned ? '' : FACING_TURN_GLSL,
            VERT_CONTEXT,
            vertex ?? DEFAULT_VERTEX,
            /* glsl */ `
void main() {${CORNER_CONTEXT}${vertex === null ? PLAIN_NORMAL : DEFORMED_NORMAL}${bend}
    // Turned as the model is, and measured again where the hook moved it, as the drawn model's is:
    // what the colour hook reads of the surface. The facing by the inverse of the placement, as the
    // drawn model's normal matrix turns it, so a model stretched unevenly is cut by the same facing.
    mat3 turn = ${skinned ? 'mat3(skin)' : 'mat3(1.0)'};
    gl_Position = uLightViewProj * uModel * placed;
    vUv = aUv;
    vNormal = normalize(facingTurnOf(mat3(uModel)) * ${skinned ? '(facingTurnOf(turn) * shaped)' : 'shaped'});
    vWorldPos = (uModel * placed).xyz;
    vColor = aColor;
    vTangent = vec4(normalize((uModel * vec4(turn * aTangent.xyz, 0.0)).xyz), aTangent.w);
    vUv2 = aUv2;
    vCarry = carried;
}
`,
        ].join('\n'),
        fragment: [
            '#version 300 es\nprecision highp float;',
            'uniform sampler2D meshTexture;\nuniform vec2 uCut;',
            glslUniformBlock(sig),
            'in vec2 vUv;\nin vec3 vNormal;\nin vec3 vWorldPos;\nin vec4 vColor;\nin vec4 vTangent;\nin vec2 vUv2;\nin vec4 vCarry;',
            FRAG_CONTEXT,
            SAMPLE,
            maps(cut.mapNames),
            cut.fragment ?? DEFAULT_EFFECT,
            /* glsl */ `
void main() {
    FragContext ctx;
    ctx.uv = vUv;
    ctx.normal = gl_FrontFacing ? vNormal : -vNormal;
    ctx.worldPos = vWorldPos;
    ctx.light = vec3(1.0);
    ctx.shine = vec3(0.0);
    ctx.emissive = vec3(0.0);
    ctx.viewDir = ctx.normal;
    ctx.color = vColor;
    ctx.screen = vec2(0.0);
    ctx.tangent = vTangent.xyz;
    ctx.bitangent = cross(ctx.normal, ctx.tangent) * vTangent.w;
    ctx.uv2 = vUv2;
    ctx.frontFacing = gl_FrontFacing;
    ctx.carry = vCarry;
    // The alpha the drawn model is cut by: its tint's colour does not change it, its alpha does.
    vec4 shaded = effect(sampleTexture(vUv) * vec4(1.0, 1.0, 1.0, uCut.y) * vColor, ctx);
    if (shaded.a < uCut.x) {
        discard;
    }
}
`,
        ].join('\n'),
    };
};
