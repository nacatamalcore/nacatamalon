import { MAX_LIGHTS, MAX_SCENE_LIGHTS } from '../../../light';
import type { TCullMode } from '../../../materials/types/t_material';

/**
 * The twin of `webgpu/mesh/mesh_shader.ts`, in the other language.
 *
 * Both blocks are laid out the same way on purpose: every member is a matrix or a group of four
 * numbers, which is the one case where the two languages agree byte for byte. That is what lets a
 * single packer on the engine's side fill the numbers for both cards.
 *
 * The one real difference is the depth range: this card's is from -1 to 1 where the other's is 0 to
 * 1, and the matrix is remapped on the way in rather than here, so this shader stays a translation
 * and not a variant.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
/**
 * The block of numbers one model is drawn from, declared again per stage because GLSL insists.
 *
 * Exported so a material's own shaders declare the very same thing rather than a copy of it.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const MESH_UNIFORMS_GLSL = /* glsl */ `
layout(std140) uniform Uniforms {
    mat4 mvp;
    mat4 model;
    mat4 normalMatrix;
    vec4 tint;
    vec4 emissive;
    vec4 cameraPosition;
    vec4 specular;
} uniforms;

struct LightItem {
    vec4 vector;
    vec4 color;
    vec4 spotDirection;
    vec4 spotParams;
};

layout(std140) uniform Lights {
    vec4 ambient;
    LightItem items[${MAX_SCENE_LIGHTS}];
    // The matrix the shadow map was drawn with, and how to read it. Same place, same order and same
    // meaning as its twin in WGSL, because one packer fills both.
    mat4 shadowMatrix;
    // x = how far off the surface to test, towards the light in the world's units; y = how dark it
    // goes; z = one step of the map;
    // w = which of the items above casts, or -1 for a scene that casts none.
    vec4 shadowParams;
    // rgb = what things fade into, w = which kinds are on (0 none, 1 by distance, 2 by height, 3
    // both); x = how far it starts, y = how far it is complete, z = the height it starts at, w = the
    // height it is complete at.
    vec4 fog;
    vec4 fogRange;
    // xyz = the way back towards the viewer, w = 1 when the view is orthographic and that way is
    // the same everywhere; 0 for a perspective one, whose way is from the point to its eye.
    vec4 look;
} lights;

// The way from a point towards whoever is looking, which the shine and the fresnel need. An
// orthographic camera has no eye for it to point at: its rays are parallel, so the way is one.
vec3 viewDirOf(vec3 worldPos) {
    if (lights.look.w > 0.5) {
        return lights.look.xyz;
    }
    return normalize(uniforms.cameraPosition.xyz - worldPos);
}
`;

/**
 * The corners every model reads, and the work of turning lights into a colour.
 *
 * Shared with the shader that bends a model around its bones: what differs between them is where a
 * corner ends up, and nothing after that.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const MESH_VERTEX_ATTRIBUTES_GLSL = /* glsl */ `#version 300 es
precision highp float;

layout(location = 0) in vec3 aPosition;
layout(location = 1) in vec3 aNormal;
layout(location = 2) in vec2 aUv;
// The colour painted on the corner: four bytes the card hands over as 0 to 1.
layout(location = 5) in vec4 aColor;

${MESH_UNIFORMS_GLSL}

// A corner put on a coarse grid of the screen, the way the PlayStation drew. The twin of
// snapToPixels in webgpu/mesh/mesh_shader.ts: the grid (columns and rows) rides in the two spare
// fourth numbers, and zero means the material did not ask for it.
vec4 snapToPixels(vec4 clip) {
    vec2 grid = vec2(uniforms.emissive.w, uniforms.cameraPosition.w);
    if (grid.x <= 0.0 || clip.w <= 0.0) {
        return clip;
    }
    vec2 halfGrid = grid * 0.5;
    vec2 snapped = floor(clip.xy / clip.w * halfGrid + 0.5) / halfGrid;
    return vec4(snapped * clip.w, clip.z, clip.w);
}

// Where in the picture a corner is, times a depth the ending divides by to undo the card's
// correction when the material is affine. The twin of affineUv in webgpu/mesh/mesh_shader.ts: the
// flag rides in the last number of the turning matrix, and not affine the depth is one. A corner
// behind the eye keeps its w too: the card cuts the triangle before dividing, so it comes out right.
vec3 affineUv(vec2 uv, vec4 clip) {
    float k = uniforms.normalMatrix[3].w > 0.5 ? clip.w : 1.0;
    return vec3(uv * k, k);
}

// How much of a corner is lost in the fog, 0 to 1. The twin of fogAt in webgpu/mesh/mesh_shader.ts.
float fogAt(vec3 worldPos) {
    float kinds = lights.fog.w;
    if (kinds <= 0.0) {
        return 0.0;
    }
    float amount = 0.0;
    if (abs(kinds - 2.0) > 0.5) {
        float dist = length(worldPos - uniforms.cameraPosition.xyz);
        amount = clamp((dist - lights.fogRange.x) / (lights.fogRange.y - lights.fogRange.x), 0.0, 1.0);
    }
    if (kinds > 1.5) {
        float low = (lights.fogRange.z - worldPos.y) / (lights.fogRange.z - lights.fogRange.w);
        amount = max(amount, clamp(low, 0.0, 1.0));
    }
    return amount;
}
`;

/**
 * What the built-in vertex hands on. A material declares a wider set of its own, and pays for it.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
const meshVertexVaryingsGlsl = (cull: TCullMode): string => /* glsl */ `
// Where in the picture, times a depth to undo the card's correction with (see affineUv).
out vec3 vUv;
out vec3 vLight;
out vec3 vShine;
// Where this corner falls in the shadow map, and the casting light's own share of the two above.
out vec4 vShadowCoord;
out vec3 vCasterLight;
out vec3 vCasterShine;
// The colour painted on the corner, smeared across the triangle like the light is.
out vec4 vColor;
// How much of the corner the fog has taken.
out float vFog;
${cull === 'none' ? TWO_SIDED_VARYINGS_GLSL('out') : ''}`;

export const MESH_VERTEX_VARYINGS_GLSL = meshVertexVaryingsGlsl('back');

/**
 * The light of the side facing away, for a model drawn on both sides, packed into three runs of four
 * numbers as its twin in WGSL packs it (see twoSidedOutput in webgpu/mesh/mesh_shader.ts).
 *
 * @internal
 */
export const TWO_SIDED_VARYINGS_GLSL = (direction: 'out' | 'in'): string => `// The light of the side facing away, packed: a model drawn on both sides is lit on both.
${direction} vec4 vBack0;
${direction} vec4 vBack1;
${direction} vec4 vBack2;
`;

/**
 * Every light on a surface in one call, for the side facing away of a model drawn on both sides. The
 * side facing the camera keeps its loop written out where it is, as it always was.
 *
 * @internal
 */
export const LIT_BY_GLSL = /* glsl */ `
// Every light on a surface, with the casting one's share also kept on its own: the twin of litBy in
// webgpu/mesh/mesh_shader.ts.
void litBy(vec3 worldPos, vec3 normal, vec3 viewDir, out vec3 diffuse, out vec3 shine, out vec3 casterDiffuse, out vec3 casterShine) {
    diffuse = vec3(0.0);
    shine = vec3(0.0);
    casterDiffuse = vec3(0.0);
    casterShine = vec3(0.0);
    int caster = int(lights.shadowParams.w);
    for (int k = 0; k < ${MAX_LIGHTS}; k++) {
        int named = meshLight(k);
        if (named == 0) break;
        int i = named - 1;
        vec3 d;
        vec3 s;
        sampleLight(i, worldPos, normal, viewDir, d, s);
        diffuse += d;
        shine += s;
        if (i == caster) {
            casterDiffuse = d;
            casterShine = s;
        }
    }
}

`;

/**
 * What the corner works out for the side facing away, and packs: the same lights, with the surface
 * turned the other way. The twin of TWO_SIDED_WRITE in webgpu/mesh/mesh_shader.ts.
 *
 * @internal
 */
export const TWO_SIDED_WRITE_GLSL = /* glsl */ `
    vec3 backDiffuse;
    vec3 backShine;
    vec3 backCasterDiffuse;
    vec3 backCasterShine;
    litBy(worldPos, -worldNormal, viewDir, backDiffuse, backShine, backCasterDiffuse, backCasterShine);
    vBack0 = vec4(backDiffuse, backShine.x);
    vBack1 = vec4(backShine.yz, backCasterDiffuse.xy);
    vBack2 = vec4(backCasterDiffuse.z, backCasterShine);
`;

/**
 * The light of the side being drawn, from the corner's two, as four values the ending reads in place
 * of the corner's own. The twin of facedLight in webgpu/mesh/mesh_shader.ts.
 *
 * @internal
 */
export const FACED_LIGHT_GLSL = /* glsl */ `
    bool front = gl_FrontFacing;
    vec3 sideLight = front ? vLight : vBack0.xyz;
    vec3 sideShine = front ? vShine : vec3(vBack0.w, vBack1.xy);
    vec3 sideCasterLight = front ? vCasterLight : vec3(vBack1.zw, vBack2.x);
    vec3 sideCasterShine = front ? vCasterShine : vBack2.yzw;
`;

/**
 * The way a corner's surface faces in the world, for the side that is drawn: turned round when only
 * the inside is. The twin of worldNormalOf in webgpu/mesh/mesh_shader.ts.
 *
 * @internal
 */
export const worldNormalOfGlsl = (cull: TCullMode, facing: string): string =>
    `${cull === 'front' ? '-' : ''}normalize((uniforms.normalMatrix * vec4(${facing}, 0.0)).xyz)`;

/**
 * Where a point falls in the shadow map, moved first towards the casting light by its bias in the
 * world's units: the twin of shadowCoordOf in webgpu/mesh/mesh_shader.ts, which says why.
 */
const SHADOW_COORD_GLSL = /* glsl */ `
vec4 shadowCoordOf(vec3 worldPos) {
    if (lights.shadowParams.w < 0.0) {
        return lights.shadowMatrix * vec4(worldPos, 1.0);
    }
    vec4 caster = lights.items[int(lights.shadowParams.w)].vector;
    // A sun's is the way towards it; a torch's, where it is.
    vec3 toward = caster.w < 0.5 ? normalize(caster.xyz) : normalize(caster.xyz - worldPos);
    return lights.shadowMatrix * vec4(worldPos + toward * lights.shadowParams.x, 1.0);
}
`;

/**
 * Where a light is from a point, and how much of it survives getting there.
 *
 * Its own value so a material's vertex says the very same thing without repeating it.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const MESH_SAMPLE_LIGHT_GLSL = /* glsl */ `
${SHADOW_COORD_GLSL}
// The k-th of the lights this model is lit by, as its place in the scene's block plus one, 0 once
// the list has ended. Two spare numbers of its block carry the list, four lights of six bits each.
int meshLight(int k) {
    float lane = k < 4 ? uniforms.normalMatrix[3].x : uniforms.normalMatrix[3].y;
    return int((uint(lane) >> uint((k % 4) * 6)) & 63u);
}

void sampleLight(int index, vec3 worldPos, vec3 normal, vec3 viewDir, out vec3 diffuse, out vec3 shine) {
    LightItem item = lights.items[index];
    vec3 dir = normalize(item.vector.xyz);
    float attenuation = 1.0;

    if (item.vector.w > 0.5) {
        vec3 toLight = item.vector.xyz - worldPos;
        float facingPanel = 1.0;
        if (item.vector.w > 2.5) {
            // A panel shines from its nearest point, and only out of its front.
            vec3 halfX = item.spotDirection.xyz;
            vec3 halfY = item.spotParams.xyz;
            float lenX = max(length(halfX), 0.0001);
            float lenY = max(length(halfY), 0.0001);
            vec3 alongX = halfX / lenX;
            vec3 alongY = halfY / lenY;
            vec3 fromMiddle = worldPos - item.vector.xyz;
            vec3 nearest = item.vector.xyz
                + alongX * clamp(dot(fromMiddle, alongX), -lenX, lenX)
                + alongY * clamp(dot(fromMiddle, alongY), -lenY, lenY);
            toLight = nearest - worldPos;
            vec3 front = normalize(cross(alongY, alongX));
            facingPanel = max(dot(-normalize(toLight), front), 0.0);
        }
        float dist = length(toLight);
        dir = toLight / max(dist, 0.0001);
        attenuation = clamp(1.0 - dist / max(item.color.a, 0.0001), 0.0, 1.0) * facingPanel;

        if (item.vector.w > 1.5 && item.vector.w < 2.5) {
            float cosAngle = dot(-dir, normalize(item.spotDirection.xyz));
            attenuation *= smoothstep(item.spotDirection.w, item.spotParams.x, cosAngle);
        }
    }

    diffuse = max(dot(normal, dir), 0.0) * attenuation * item.color.rgb;

    vec3 halfVec = normalize(dir + viewDir);
    float amount = pow(max(dot(normal, halfVec), 0.0), max(uniforms.specular.w, 1.0));
    float facing = step(0.0001, dot(normal, dir));
    shine = amount * facing * attenuation * uniforms.specular.rgb * item.color.rgb;
}

`;

/**
 * Everything the built-in vertex declares before it runs.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const meshVertexHeadGlsl = (cull: TCullMode): string =>
    MESH_VERTEX_ATTRIBUTES_GLSL + meshVertexVaryingsGlsl(cull) + MESH_SAMPLE_LIGHT_GLSL + (cull === 'none' ? LIT_BY_GLSL : '');

export const MESH_VERTEX_HEAD_GLSL = meshVertexHeadGlsl('back');

/**
 * The rest of a corner's journey once it is where it belongs: which lights reach it, and how much.
 *
 * Kept apart so the bending shader can put a corner somewhere else first and then say exactly this.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const meshVertexLightGlsl = (cull: TCullMode): string => /* glsl */ `
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
        // Kept apart so the ending can take this one light away and no other.
        if (i == caster) {
            casterDiffuse = d;
            casterShine = s;
        }
    }

    vLight = diffuse;
    vShine = shine;
    vCasterLight = casterDiffuse;
    vCasterShine = casterShine;${cull === 'none' ? TWO_SIDED_WRITE_GLSL : ''}
    vShadowCoord = shadowCoordOf(worldPos);
    vUv = affineUv(aUv, gl_Position);
    vColor = aColor;
    vFog = fogAt(worldPos);
}
`;

export const MESH_VERTEX_LIGHT_GLSL = meshVertexLightGlsl('back');

/**
 * What draws a model that does not bend.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const meshVertexGlsl = (cull: TCullMode): string => meshVertexHeadGlsl(cull) + /* glsl */ `
void main() {
    gl_Position = snapToPixels(uniforms.mvp * vec4(aPosition, 1.0));

    vec3 worldPos = (uniforms.model * vec4(aPosition, 1.0)).xyz;
    vec3 worldNormal = ${worldNormalOfGlsl(cull, 'aNormal')};
` + meshVertexLightGlsl(cull);

export const MESH_VERTEX_GLSL = meshVertexGlsl('back');

/**
 * Reading the shadow map on this card, which is the same act as its twin in WGSL said differently.
 *
 * Two real differences, and both are the card's rather than a choice:
 *
 * - **The picture is not turned over.** Here a picture's rows run upwards and so does the frame the
 *   map was drawn into, so they agree. On the other card a picture's rows run downwards while the
 *   frame's run up, so its twin flips one of the two axes. It is the same divergence sprites have
 *   always had, arriving in a new place.
 * - **The depth needs no converting.** The map was drawn with the matrix squeezed into this card's
 *   range, but what ended up *stored* is the same number the other card stores, so the matrix the
 *   reading uses is the plain one. Converting here as well would undo it twice.
 *
 * `sampler2DShadow` is what makes the comparison free: the card answers four steps at once and
 * hands back how many said yes, which is four shades along a rim for nothing.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const MESH_SHADOW_GLSL = /* glsl */ `
uniform highp sampler2DShadow shadowMap;
${SHADOW_COORD_GLSL}

// Whether the light can see this point: 1 lit, 0 hidden, and in between along a rim.
//
// This is the one thing in this engine worked out per pixel rather than per corner, and it is
// deliberate: a shadow's edge is a hard line across a surface, and smeared between corners it would
// land on triangle boundaries instead of where the wall is.
float shadowFactor(vec4 coord) {
    if (lights.shadowParams.w < 0.0) {
        return 1.0;
    }
    vec3 proj = coord.xyz / max(coord.w, 0.0001);
    vec2 uv = proj.xy * 0.5 + 0.5;
    // Outside the map there is no answer, so the answer is lit. Anything else would put a dark
    // square edge across the world where the square the light covers happens to end.
    if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0 || proj.z < 0.0 || proj.z > 1.0) {
        return 1.0;
    }
    return texture(shadowMap, vec3(uv, proj.z));
}

// What is left of the light once the casting one has been taken away where it cannot see.
vec3 litWithShadow(vec3 light, vec3 casterLight, vec4 coord) {
    float hidden = (1.0 - shadowFactor(coord)) * lights.shadowParams.y;
    return light - casterLight * hidden;
}
`;

export const MESH_FRAGMENT_HEAD_GLSL = /* glsl */ `#version 300 es
precision highp float;

${MESH_UNIFORMS_GLSL}

uniform sampler2D meshTexture;
// The picture the glow comes through, read the colour's way. White when there is none.
uniform sampler2D meshEmissive;
${MESH_SHADOW_GLSL}
`;

/**
 * The built-in fragment: the picture, the light it got, the shine and the glow.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const meshFragmentGlsl = (cull: TCullMode): string => {
    // A model drawn on both sides reads the light of the side it is; any other has one.
    const [light, shine, casterLight, casterShine] = cull === 'none'
        ? ['sideLight', 'sideShine', 'sideCasterLight', 'sideCasterShine']
        : ['vLight', 'vShine', 'vCasterLight', 'vCasterShine'];
    return MESH_FRAGMENT_HEAD_GLSL + /* glsl */ `
in vec3 vUv;
in vec3 vLight;
in vec3 vShine;
in vec4 vShadowCoord;
in vec3 vCasterLight;
in vec3 vCasterShine;
in vec4 vColor;
in float vFog;
${cull === 'none' ? TWO_SIDED_VARYINGS_GLSL('in') : ''}out vec4 fragColor;

void main() {${cull === 'none' ? FACED_LIGHT_GLSL : ''}
    vec2 uv = vUv.xy / vUv.z;
    vec4 texColor = texture(meshTexture, uv);
    // Its glow, through its picture when it has one: lit windows on a dark wall.
    vec3 glow = uniforms.emissive.rgb * texture(meshEmissive, uv).rgb;
    // Only the casting light's share is taken away, so a thing in the sun's shadow is still lit by
    // the lamp beside it.
    vec3 lit = max(litWithShadow(${light}, ${casterLight}, vShadowCoord), lights.ambient.rgb);
    // The colour painted on the corners multiplies in with the picture. Unpainted corners are white.
    vec4 color = texColor * uniforms.tint * vColor * vec4(lit, 1.0);
    // Cut out rather than blended: below the material's cutoff the pixel is not there at all, and
    // above it is solid. It rides in a spare number of the turning matrix; zero cuts nothing.
    if (color.a < uniforms.normalMatrix[3].z) {
        discard;
    }
    vec3 shine = litWithShadow(${shine}, ${casterShine}, vShadowCoord);
    // The fog last, over everything, glow included.
    fragColor = vec4(mix(color.rgb + shine + glow, lights.fog.rgb, vFog), color.a);
}
`;
};

export const MESH_FRAGMENT_GLSL = meshFragmentGlsl('back');
