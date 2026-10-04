import { MAX_LIGHTS } from '../../../light';

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
    LightItem items[${MAX_LIGHTS}];
    // The matrix the shadow map was drawn with, and how to read it. Same place, same order and same
    // meaning as its twin in WGSL, because one packer fills both.
    mat4 shadowMatrix;
    // x = how far off the surface to test; y = how dark it goes; z = one step of the map;
    // w = which of the items above casts, or -1 for a scene that casts none.
    vec4 shadowParams;
    // rgb = what things fade into, w = 1 when the scene has fog; x = where it starts, y = where it
    // is complete.
    vec4 fog;
    vec4 fogRange;
} lights;
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
    if (lights.fog.w <= 0.0) {
        return 0.0;
    }
    float dist = length(worldPos - uniforms.cameraPosition.xyz);
    return clamp((dist - lights.fogRange.x) / (lights.fogRange.y - lights.fogRange.x), 0.0, 1.0);
}
`;

/**
 * What the built-in vertex hands on. A material declares a wider set of its own, and pays for it.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const MESH_VERTEX_VARYINGS_GLSL = /* glsl */ `
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
void sampleLight(int index, vec3 worldPos, vec3 normal, vec3 viewDir, out vec3 diffuse, out vec3 shine) {
    LightItem item = lights.items[index];
    vec3 dir = normalize(item.vector.xyz);
    float attenuation = 1.0;

    if (item.vector.w > 0.5) {
        vec3 toLight = item.vector.xyz - worldPos;
        float dist = length(toLight);
        dir = toLight / max(dist, 0.0001);
        attenuation = clamp(1.0 - dist / max(item.color.a, 0.0001), 0.0, 1.0);

        if (item.vector.w > 1.5) {
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
export const MESH_VERTEX_HEAD_GLSL = MESH_VERTEX_ATTRIBUTES_GLSL + MESH_VERTEX_VARYINGS_GLSL + MESH_SAMPLE_LIGHT_GLSL;

/**
 * The rest of a corner's journey once it is where it belongs: which lights reach it, and how much.
 *
 * Kept apart so the bending shader can put a corner somewhere else first and then say exactly this.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const MESH_VERTEX_LIGHT_GLSL = /* glsl */ `
    vec3 viewDir = normalize(uniforms.cameraPosition.xyz - worldPos);

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
        // Kept apart so the ending can take this one light away and no other.
        if (i == caster) {
            casterDiffuse = d;
            casterShine = s;
        }
    }

    vLight = diffuse;
    vShine = shine;
    vCasterLight = casterDiffuse;
    vCasterShine = casterShine;
    vShadowCoord = lights.shadowMatrix * vec4(worldPos, 1.0);
    vUv = affineUv(aUv, gl_Position);
    vColor = aColor;
    vFog = fogAt(worldPos);
}
`;

/**
 * What draws a model that does not bend.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const MESH_VERTEX_GLSL = MESH_VERTEX_HEAD_GLSL + /* glsl */ `
void main() {
    gl_Position = snapToPixels(uniforms.mvp * vec4(aPosition, 1.0));

    vec3 worldPos = (uniforms.model * vec4(aPosition, 1.0)).xyz;
    vec3 worldNormal = normalize((uniforms.normalMatrix * vec4(aNormal, 0.0)).xyz);
` + MESH_VERTEX_LIGHT_GLSL;

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
    return texture(shadowMap, vec3(uv, proj.z - lights.shadowParams.x));
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
${MESH_SHADOW_GLSL}
`;

/**
 * The built-in fragment: the picture, the light it got, the shine and the glow.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const MESH_FRAGMENT_GLSL = MESH_FRAGMENT_HEAD_GLSL + /* glsl */ `
in vec3 vUv;
in vec3 vLight;
in vec3 vShine;
in vec4 vShadowCoord;
in vec3 vCasterLight;
in vec3 vCasterShine;
in vec4 vColor;
in float vFog;
out vec4 fragColor;

void main() {
    vec4 texColor = texture(meshTexture, vUv.xy / vUv.z);
    // Only the casting light's share is taken away, so a thing in the sun's shadow is still lit by
    // the lamp beside it.
    vec3 lit = max(litWithShadow(vLight, vCasterLight, vShadowCoord), lights.ambient.rgb);
    // The colour painted on the corners multiplies in with the picture. Unpainted corners are white.
    vec4 color = texColor * uniforms.tint * vColor * vec4(lit, 1.0);
    vec3 shine = litWithShadow(vShine, vCasterShine, vShadowCoord);
    // The fog last, over everything, glow included.
    fragColor = vec4(mix(color.rgb + shine + uniforms.emissive.rgb, lights.fog.rgb, vFog), color.a);
}
`;
