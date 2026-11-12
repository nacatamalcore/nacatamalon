import { mapNamesOf, MAX_MATERIAL_MAPS } from '../../shared/material_maps';
import {
    FACED_LIGHT_GLSL, FACING_TURN_GLSL, INSTANCE_HEAD_GLSL, LIT_BY_GLSL, MESH_FRAGMENT_HEAD_GLSL, MESH_LIGHT_GLSL, MESH_SAMPLE_LIGHT_GLSL, MESH_VERTEX_ATTRIBUTES_GLSL,
    TWO_SIDED_VARYINGS_GLSL, TWO_SIDED_WRITE_GLSL, worldNormalOfGlsl,
} from '../mesh/mesh_shader';
import { MAX_LIGHTS } from '../../../light';
import { MODEL_REFLECTION_GLSL } from '../mesh/model_shading_glsl';
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
    // For a model drawn as many: its instance's four numbers and where that instance stands. Zeros
    // for a single model.
    vec4 instance;
    vec3 origin;
};

// Four numbers the corner hook hands on to the colour hook, as its twin keeps them.
vec4 carry = vec4(0.0);

// The facing the corner hook gives the light, as its twin keeps it. Nothing written, the measured one.
vec3 surfaceNormal = vec3(0.0);
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
    // Where the camera stands, in the world, the place the fog measures from.
    vec3 cameraPos;
    vec4 color;
    vec2 screen;
    vec3 tangent;
    vec3 bitangent;
    vec2 uv2;
    bool frontFacing;
    vec4 carry;
    // How open this place is to the light from all around, 1 wide open to 0 shut in. Already in
    // light; 1 with no occlusion.
    float occlusion;
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
 * How fast the model's own picture coordinate changes from one pixel on the screen to the next:
 * what picks which of a picture's mipmaps to read. Measured once at the start of the colour half
 * (see `MEASURE_UV`) and read by every reader after, so a hook may call them inside a branch. The
 * same as its WGSL twin.
 */
const UV_STEPS = /* glsl */ `
vec2 meshUvDx;
vec2 meshUvDy;
`;

/**
 * Measures the picture coordinate's steps, before anything can branch.
 */
const MEASURE_UV = (uv: string): string => `
    meshUvDx = dFdx(${uv});
    meshUvDy = dFdy(${uv});`;

/**
 * Reading the picture, in a form a hook may call from inside a branch, from the mipmap the model's
 * own picture coordinate asks for; `sampleTextureScaled` for a place that runs `scale` times as
 * fast, and `0.0` for the picture itself. Colour half only.
 */
const SAMPLE = /* glsl */ `${UV_STEPS}
vec4 sampleTexture(vec2 uv) {
    return textureGrad(meshTexture, uv, meshUvDx, meshUvDy);
}

vec4 sampleTextureScaled(vec2 uv, vec2 scale) {
    return textureGrad(meshTexture, uv, meshUvDx * scale, meshUvDy * scale);
}
`;

/**
 * The material's extra maps: always all four samplers, and two readers per name the shader uses, in
 * the order it first reads them. The same readers by the same names as its WGSL twin.
 *
 * In the colour half they pick a picture's mipmap by the steps `SAMPLE` measured, never by working
 * them out where they are called, so a hook may read them inside a branch. The corner half has no
 * neighbours on the screen to measure by, and reads the picture itself, scale or no scale. Declared
 * in both halves of a material with a corner hook, under the same names, which the card links into
 * one sampler on one unit.
 */
const mapReaders = (names: readonly string[], half: 'corner' | 'colour'): string => {
    const slots = Array.from({ length: MAX_MATERIAL_MAPS }, (_, i) => `uniform sampler2D meshMap${i};`).join('\n');
    const readers = names.map((name, i) => half === 'corner'
        ? `vec4 sampleMap_${name}(vec2 uv) {\n    return textureLod(meshMap${i}, uv, 0.0);\n}\n` +
          `vec4 sampleMapScaled_${name}(vec2 uv, vec2 scale) {\n    return textureLod(meshMap${i}, uv, 0.0);\n}`
        : `vec4 sampleMap_${name}(vec2 uv) {\n    return textureGrad(meshMap${i}, uv, meshUvDx, meshUvDy);\n}\n` +
          `vec4 sampleMapScaled_${name}(vec2 uv, vec2 scale) {\n    return textureGrad(meshMap${i}, uv, meshUvDx * scale, meshUvDy * scale);\n}`).join('\n');
    return `${slots}
${readers}
`;
};

/**
 * The maps for the colour half: the readers, and `envUv`, where a reflection of the world lands on a
 * round picture of its surroundings. Only there, because it reads a `FragContext`, which the corner
 * half does not have. `lit` is whether the shader has the lights block; a shadow's has not, and its
 * `envUv` keeps the world's axes (see the twin in webgpu/material/mesh_material_shader.ts).
 */
const maps = (names: readonly string[], lit = true): string => `${mapReaders(names, 'colour')}
${MODEL_REFLECTION_GLSL}
${lit ? ENV_UV : ENV_UV_UNLIT}
${ENV_CUBE_UV}
`;

// The twin of envUv in webgpu/material/mesh_material_shader.ts, which says why.
const ENV_UV = /* glsl */ `vec2 envUv(FragContext ctx) {
    return roundReflectionUv(reflect(-normalize(ctx.viewDir), normalize(ctx.normal)), lights.look, lights.ground);
}`;

// The twin of envCubeUv in webgpu/material/mesh_material_shader.ts, which says why.
const ENV_CUBE_UV = /* glsl */ `vec2 envCubeUv(FragContext ctx) {
    return cubeReflectionUv(reflect(-normalize(ctx.viewDir), normalize(ctx.normal)));
}`;

// The same with the world's axes, for a shader with no lights block (a shadow's).
const ENV_UV_UNLIT = /* glsl */ `vec2 envUv(FragContext ctx) {
    return roundReflectionUv(reflect(-normalize(ctx.viewDir), normalize(ctx.normal)), vec4(0.0), vec4(0.0));
}`;

/**
 * The maps for the corner half, when its corner hook reads one: then all of the material's readers,
 * on the same samplers as the colour half's. A corner hook that reads none (a flag waving, with a
 * detail map in its colour hook) declares none, and its corners are left as they were.
 */
const cornerMaps = (vertex: string | null, names: readonly string[]): string =>
    mapNamesOf(vertex).length === 0 ? '' : mapReaders(names, 'corner');

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
 * The facing the hook wrote into `surfaceNormal`, when it wrote one, in place of the measured one.
 */
const GIVEN_NORMAL = /* glsl */ `
    vec3 shaped = dot(given, given) > 0.0 ? normalize(given) : measured;
`;

/**
 * The surface kept as it was.
 */
const PLAIN_NORMAL = /* glsl */ `
    vec3 measured = ctx.normal;${GIVEN_NORMAL}`;

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
    vec3 moved1 = vertex(rest + tangent * ${EPSILON}, ctx);
    vec3 moved2 = vertex(rest + bitangent * ${EPSILON}, ctx);
    vec3 measured = normalize(cross(moved1 - local, moved2 - local));${GIVEN_NORMAL}`;

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
    vec3 across = mat3(skin) * restTangent;
`;

/**
 * The corner where the hook left it, for a model that does not bend.
 */
const STILL = /* glsl */ `
    vec4 placed = vec4(local, 1.0);
    vec3 facing = shaped;
    vec3 across = restTangent;
`;

/**
 * The corner as the hook finds it, for a single model: as its shape has it.
 */
const REST = /* glsl */ `
    vec3 rest = aPosition;
    vec3 restNormal = aNormal;
    vec3 restTangent = aTangent.xyz;
    vec4 restColor = aColor;
    vec4 restInstance = vec4(0.0);
    vec3 restOrigin = vec3(0.0);
`;

/**
 * The corner as the hook finds it, for a model drawn as many: already placed by its instance, with
 * the instance's colour over its own. The twin of REST_INSTANCED in
 * webgpu/material/mesh_material_shader.ts.
 */
const REST_INSTANCED = /* glsl */ `
    mat4 instance = instancePlace();
    vec3 rest = (instance * vec4(aPosition, 1.0)).xyz;
    vec3 restNormal = normalize(facingTurnOf(mat3(instance)) * aNormal);
    vec3 restTangent = normalize(mat3(instance) * aTangent.xyz);
    vec4 restColor = aColor * aInstanceColor;
    vec4 restInstance = aInstanceData;
    vec3 restOrigin = instance[3].xyz;
`;

const restOf = (instanced: boolean): string => instanced ? REST_INSTANCED : REST;

/**
 * What a corner of a model drawn as many reads of its instance, with the helper its facing is turned
 * by, which the bones' helpers bring for a model that bends.
 */
const INSTANCED_HEAD = INSTANCE_HEAD_GLSL + FACING_TURN_GLSL;

/**
 * What the corner hook is told, and the corner it gives back: the same in the pass that draws the
 * model and in the one that draws its shadow, so the hook moves the corner the same way in both.
 */
const CORNER_CONTEXT = /* glsl */ `
    VertContext ctx;
    ctx.normal = restNormal;
    ctx.uv = aUv;
    ctx.color = restColor;
    ctx.tangent = restTangent;
    ctx.bitangent = cross(restNormal, restTangent) * aTangent.w;
    ctx.uv2 = aUv2;
    ctx.instance = restInstance;
    ctx.origin = restOrigin;

    vec3 local = vertex(rest, ctx);
    // Kept now: a surface measured again calls the hook twice more, at corners beside this one.
    vec4 carried = carry;
    vec3 given = surfaceNormal;
`;

const vertexBody = (normal: string, skinned: boolean, cull: TCullMode, instanced: boolean): string => /* glsl */ `
void main() {${restOf(instanced)}${CORNER_CONTEXT}${normal}${skinned ? SKIN : STILL}
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
    // The second picture coordinate stretched the way the first is, as its twin does.
    vec2 stretched2 = affineUv(aUv2, gl_Position).xy;
    vNormal = vec4(worldNormal, stretched2.x);
    vWorldPos = worldPos;
${cull === 'none' ? '' : `    vViewDir = viewDir;
`}    vColor = restColor;
    vFog = fogAt(worldPos);
    vScreen = vec4(gl_Position.xyw, stretched2.y);
    // A direction, so it is moved by the model's own turn and stretch rather than the facing's.
    vTangent = vec4(normalize((uniforms.model * vec4(across, 0.0)).xyz), aTangent.w);
    vCarry = carried;
}
`;

const fragmentBody = (cull: TCullMode, bumped = false): string => {
    // A model drawn on both sides reads the light of the side it is, and faces the way that side does.
    const [light, shine, casterLight, casterShine] = cull === 'none'
        ? ['sideLight', 'sideShine', 'sideCasterLight', 'sideCasterShine']
        : ['vLight', 'vShine', 'vCasterLight', 'vCasterShine'];
    // The facing at the pixel, or bent by the material's normal map, as its twin has it.
    const smeared = cull === 'none' ? '(gl_FrontFacing ? vNormal.xyz : -vNormal.xyz)' : 'vNormal.xyz';
    const facing = bumped ? 'facing' : `normalize(${smeared})`;
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

    // Divided here, once: a shader of your own receives the picture already stretched when the
    // material is affine, and the corrected one when it is not (see affineUv).
    vec2 uv = vUv.xy / vUv.z;
    vec2 uv2 = vec2(vNormal.w, vScreen.w) / vUv.z;${MEASURE_UV('uv')}
    // Laid out by the coordinate the material says, which rides beside its amount, as the odd half of
    // that number.
    float occlusion = occlusionAt(mod(uniforms.normalMatrix[1].w, 2.0) > 0.5 ? uv2 : uv);${bumped ? `
    // Bent by the material's normal map, before anything is lit by it, as its twin does.
    vec3 facing = bentBy(normalize(${smeared}), vTangent, sampleMap_normalMap(uv).xyz, mu.normalStrength);` : ''}
    // The light the corners worked out, or, when the material asks for it (perPixel, two more in that
    // same number), worked out again here from this pixel's own facing and place: the twin of the
    // same choice in webgpu/material/mesh_material_shader.ts.
    vec3 hereLight = ${light};
    vec3 hereShine = ${shine};
    vec3 hereCasterLight = ${casterLight};
    vec3 hereCasterShine = ${casterShine};
    if (uniforms.normalMatrix[1].w > 1.5) {
        litBy(vWorldPos, ${facing}, viewDirOf(vWorldPos), hereLight, hereShine, hereCasterLight, hereCasterShine);
    }
    // A crease lowers the floor and nothing else, as in the built-in ending.
    vec3 lit = max(litWithShadow(hereLight, hereCasterLight, coord), ambientAt(skyward(${facing})) * occlusion);
    FragContext ctx;
    ctx.uv = uv;
    ctx.normal = ${bumped ? 'facing' : smeared};
    ctx.worldPos = vWorldPos;
    ctx.light = lit;
    ctx.shine = litWithShadow(hereShine, hereCasterShine, coord);
    // The glow through its picture, so a shader of your own adds it the way the built-in one does.
    ctx.emissive = uniforms.emissive.rgb * textureGrad(meshEmissive, uv, meshUvDx, meshUvDy).rgb;
    // Drawn on both sides, worked out again at the pixel rather than carried, as its twin does to make
    // room for the light of the other side.
    // Worked out again here when the light is (perPixel), as its twin does, so a reflection or a
    // fresnel lines up with the shine.
    ctx.viewDir = ${cull === 'none' ? 'viewDirOf(vWorldPos)' : '(uniforms.normalMatrix[1].w > 1.5 ? viewDirOf(vWorldPos) : vViewDir)'};
    ctx.cameraPos = uniforms.cameraPosition.xyz;
    ctx.color = vColor;
    ctx.screen = screenOf(vScreen.xyz);
    ctx.tangent = normalize(vTangent.xyz);
    ctx.bitangent = cross(normalize(ctx.normal), ctx.tangent) * vTangent.w;
    ctx.uv2 = uv2;
    ctx.frontFacing = gl_FrontFacing;
    ctx.carry = vCarry;
    ctx.occlusion = occlusion;

    // The painted colour is part of the surface, as it is in the built-in ending. The fog goes over
    // what the hook made, so a shader of your own sits in the scene's fog without asking for it.
    vec4 shaded = effect(sampleTexture(uv) * uniforms.tint * vColor, ctx);
    // Cut out rather than blended: below the material's cutoff, by the alpha the hook made, the
    // pixel is not there at all, and above it is solid. It rides in a spare number of the turning
    // matrix; zero cuts nothing.
    if (shaded.a < uniforms.normalMatrix[3].z) {
        discard;
    }
    // One that adds its colour (normalMatrix[2].w) fades into the fog towards black, adding less:
    // adding the fog's colour would brighten it.
    fragColor = vec4(mix(shaded.rgb, lights.fog.rgb * (1.0 - uniforms.normalMatrix[2].w), vFog), shaded.a);
}
`;
};

/**
 * Whether a material bends its facing by a normal map, as its twin in
 * webgpu/material/mesh_material_shader.ts decides it.
 */
const bumpedBy = (mapNames: readonly string[], sig: TUniformSignature): boolean =>
    mapNames.includes('normalMap') && Object.hasOwn(sig, 'normalStrength');

// The twin of bentBy in webgpu/material/mesh_material_shader.ts, which says why.
const BENT_BY = /* glsl */ `vec3 bentBy(vec3 normal, vec4 tangent, vec3 texel, float strength) {
    vec3 t = normalize(tangent.xyz - normal * dot(normal, tangent.xyz));
    vec3 b = cross(normal, t) * tangent.w;
    vec3 n = texel * 2.0 - 1.0;
    return normalize(t * (n.x * strength) + b * (n.y * strength) + normal * n.z);
}`;

/**
 * Builds a model material's two halves for this backend.
 *
 * Everything is in the order GLSL insists on, which is what most of the shuffling here is for: a
 * thing has to be declared before whatever uses it, and the light helper, the contexts and the
 * hooks are all things the body uses.
 *
 * `skinned` is the same shader for a model that bends: it also reads the bones each corner names and
 * bends the corner around them, after the corner hook has moved it. `instanced` is the same for a
 * model drawn as many: each corner is placed by its instance before the corner hook runs. Never both.
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
    instanced = false,
): { vertex: string; fragment: string } => ({
    vertex: [
        MESH_VERTEX_ATTRIBUTES_GLSL,
        DETAIL_HEAD,
        skinned ? SKIN_HEAD : instanced ? INSTANCED_HEAD : '',
        glslUniformBlock(sig),
        VARYINGS('out', cull),
        MESH_SAMPLE_LIGHT_GLSL,
        ...(cull === 'none' ? [LIT_BY_GLSL] : []),
        VERT_CONTEXT,
        cornerMaps(vertex, mapNames),
        vertex ?? DEFAULT_VERTEX,
        vertexBody(vertex === null ? PLAIN_NORMAL : DEFORMED_NORMAL, skinned, cull, instanced),
    ].join('\n'),
    fragment: [
        MESH_FRAGMENT_HEAD_GLSL,
        // The lights again, for a material that works its light out at every pixel (perPixel).
        MESH_LIGHT_GLSL,
        LIT_BY_GLSL,
        glslUniformBlock(sig),
        VARYINGS('in', cull),
        FRAG_CONTEXT,
        SAMPLE,
        maps(mapNames),
        bumpedBy(mapNames, sig) ? BENT_BY : '',
        fragment ?? DEFAULT_EFFECT,
        fragmentBody(cull, bumpedBy(mapNames, sig)),
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
 * `mapNames` are the material's maps in the order the drawn model binds them, so a corner hook that
 * moves its corners by a map moves them here by the same one, on the same units.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const buildMeshMaterialShadowShaderGlsl = (
    vertex: string | null,
    sig: TUniformSignature,
    mapNames: readonly string[] = [],
    skinned = false,
    cut: { fragment: string | null } | null = null,
    instanced = false,
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
                skinned ? SKIN_HEAD : instanced ? INSTANCED_HEAD : '',
                glslUniformBlock(sig),
                'uniform mat4 uLightViewProj;\nuniform mat4 uModel;',
                VERT_CONTEXT,
                cornerMaps(vertex, mapNames),
                vertex ?? DEFAULT_VERTEX,
                /* glsl */ `
void main() {${restOf(instanced)}${CORNER_CONTEXT}${bend}
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
            skinned ? SKIN_HEAD : instanced ? INSTANCED_HEAD : '',
            glslUniformBlock(sig),
            'uniform mat4 uLightViewProj;\nuniform mat4 uModel;',
            'out vec2 vUv;\nout vec3 vNormal;\nout vec3 vWorldPos;\nout vec4 vColor;\nout vec4 vTangent;\nout vec2 vUv2;\nout vec4 vCarry;',
            // Already among the bones' helpers when it bends, and an instance's when drawn as many.
            skinned || instanced ? '' : FACING_TURN_GLSL,
            VERT_CONTEXT,
            cornerMaps(vertex, mapNames),
            vertex ?? DEFAULT_VERTEX,
            /* glsl */ `
void main() {${restOf(instanced)}${CORNER_CONTEXT}${vertex === null ? PLAIN_NORMAL : DEFORMED_NORMAL}${bend}
    // Turned as the model is, and measured again where the hook moved it, as the drawn model's is:
    // what the colour hook reads of the surface. The facing by the inverse of the placement, as the
    // drawn model's normal matrix turns it, so a model stretched unevenly is cut by the same facing.
    mat3 turn = ${skinned ? 'mat3(skin)' : 'mat3(1.0)'};
    gl_Position = uLightViewProj * uModel * placed;
    vUv = aUv;
    vNormal = normalize(facingTurnOf(mat3(uModel)) * ${skinned ? '(facingTurnOf(turn) * shaped)' : 'shaped'});
    vWorldPos = (uModel * placed).xyz;
    vColor = restColor;
    vTangent = vec4(normalize((uModel * vec4(turn * restTangent, 0.0)).xyz), aTangent.w);
    vUv2 = aUv2;
    vCarry = carried;
}
`,
        ].join('\n'),
        fragment: [
            '#version 300 es\nprecision highp float;',
            'uniform sampler2D meshTexture;\nuniform vec2 uCut;\nuniform vec3 uEye;',
            glslUniformBlock(sig),
            'in vec2 vUv;\nin vec3 vNormal;\nin vec3 vWorldPos;\nin vec4 vColor;\nin vec4 vTangent;\nin vec2 vUv2;\nin vec4 vCarry;',
            FRAG_CONTEXT,
            SAMPLE,
            // No lights block here: its envUv keeps the world's axes.
            maps(mapNames, false),
            cut.fragment ?? DEFAULT_EFFECT,
            /* glsl */ `
void main() {${MEASURE_UV('vUv')}
    FragContext ctx;
    ctx.uv = vUv;
    ctx.normal = gl_FrontFacing ? vNormal : -vNormal;
    ctx.worldPos = vWorldPos;
    ctx.light = vec3(1.0);
    ctx.shine = vec3(0.0);
    ctx.emissive = vec3(0.0);
    ctx.viewDir = ctx.normal;
    // The camera the model is drawn for, as its twin says.
    ctx.cameraPos = uEye;
    ctx.color = vColor;
    ctx.screen = vec2(0.0);
    ctx.tangent = vTangent.xyz;
    ctx.bitangent = cross(ctx.normal, ctx.tangent) * vTangent.w;
    ctx.uv2 = vUv2;
    ctx.frontFacing = gl_FrontFacing;
    ctx.carry = vCarry;
    ctx.occlusion = 1.0;
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
