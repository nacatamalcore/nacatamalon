import { MAX_LIGHTS } from '../../../light';

/**
 * What draws a model.
 *
 * **The light is worked out at the corners, not at every pixel**, and the card smears it across
 * each triangle in between. That is Gouraud shading, and it is what the consoles of this engine's
 * era did: none of them lit per pixel. It shows, in the right way, on a low-polygon model.
 *
 * Up to eight lights shine at once, each a sun, a lamp or a torch, and they are read from a block
 * written once a frame rather than handed over with every model.
 *
 * The level everything is lit to is applied **once to the total**, not once per light. With several
 * lights it stops being a property of any one of them and becomes one of the scene, and adding it
 * per light would make a room brighter simply for having more lamps in it.
 *
 * Light it gives off by itself is added on top, untouched by any of that: no fading with distance
 * and no floor. That is how the glowing panels of the era worked, and it is what makes lava read as
 * lava in a dark cave.
 *
 * Its twin in GLSL is `webgl2/mesh/mesh_shader.ts`, and the two have to say the same thing.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const MESH_SHADER_TYPES = /* wgsl */ `
struct Uniforms {
    mvp: mat4x4<f32>,
    model: mat4x4<f32>,
    normalMatrix: mat4x4<f32>,
    tint: vec4<f32>,
    emissive: vec4<f32>,
    cameraPosition: vec4<f32>,
    // rgb = the colour of the shine, black for none; w = how tight it is.
    specular: vec4<f32>,
};

struct LightItem {
    // xyz = the way towards the light (a sun) or where it is (a lamp, a torch);
    // w = which: 0 sun, 1 lamp, 2 torch.
    vector: vec4<f32>,
    // rgb = colour times strength; a = how far it reaches.
    color: vec4<f32>,
    // xyz = the way the beam travels; w = the cosine of the outer angle. Torch only.
    spotDirection: vec4<f32>,
    // x = the cosine of the inner angle, where the soft edge ends. Torch only.
    spotParams: vec4<f32>,
};

struct Lights {
    // rgb = the level everything is lit to; w = how many of the items below are real.
    ambient: vec4<f32>,
    items: array<LightItem, ${MAX_LIGHTS}>,
    // The matrix the shadow map was drawn with, and how to read it.
    shadowMatrix: mat4x4<f32>,
    // x = how far off the surface to test; y = how dark it goes; z = one step of the map;
    // w = which of the items above casts, or -1 for a scene that casts none.
    shadowParams: vec4<f32>,
    // rgb = what things fade into, w = 1 when the scene has fog; x = where it starts, y = where it
    // is complete. Same place and order as its twin in GLSL, because one packer fills both.
    fog: vec4<f32>,
    fogRange: vec4<f32>,
};

// All three in group 0, which already means "how this view is lit". A shadow is one map, one light
// and one point of view, the same for every model in the scene, so it belongs exactly where the
// lights do and not on the model. Group 3 is spoken for twice over already.
@group(0) @binding(0) var<uniform> lights: Lights;
@group(0) @binding(1) var shadowMap: texture_depth_2d;
@group(0) @binding(2) var shadowSampler: sampler_comparison;
@group(1) @binding(0) var meshSampler: sampler;
@group(1) @binding(1) var meshTexture: texture_2d<f32>;
@group(2) @binding(0) var<uniform> uniforms: Uniforms;

// A corner put on a coarse grid of the screen, the way the PlayStation drew: models shivered as
// they moved. The grid rides in the two spare fourth numbers (its columns and rows, see
// fill_mesh_uniforms.ts); zero means the material did not ask for it, and a corner behind the eye is
// left alone rather than divided by nothing.
fn snapToPixels(clip: vec4<f32>) -> vec4<f32> {
    let grid = vec2<f32>(uniforms.emissive.w, uniforms.cameraPosition.w);
    if (grid.x <= 0.0 || clip.w <= 0.0) {
        return clip;
    }
    let halfGrid = grid * 0.5;
    let snapped = floor(clip.xy / clip.w * halfGrid + 0.5) / halfGrid;
    return vec4<f32>(snapped * clip.w, clip.z, clip.w);
}

// Where in the picture a corner is, carried so the ending can undo the depth correction when the
// material is affine, the PlayStation's swimming textures. The card corrects every value it
// smears for depth; carrying uv times w and w itself, and dividing one by the other at the pixel,
// cancels that out and leaves the picture stretched straight across the screen. Not affine, the
// third number is one and the division gives back the corrected picture of always. The flag rides
// in the last number of the turning matrix, a column no shader reads (see fill_mesh_uniforms.ts).
// Unlike snapToPixels, a corner behind the eye is NOT left out: nothing is divided here, and the
// card cuts the triangle at the near plane before dividing, smearing both numbers by the same
// amount, so the new corners come out right. Giving that one corner a one while its neighbours
// carry w is what would break the triangle.
fn affineUv(uv: vec2<f32>, clip: vec4<f32>) -> vec3<f32> {
    let k = select(1.0, clip.w, uniforms.normalMatrix[3].w > 0.5);
    return vec3<f32>(uv * k, k);
}

// How much of a corner is lost in the fog, 0 to 1, by how far it is from the camera. Worked out per
// corner and smeared across the triangle, like the light, which is how the Nintendo 64 did it. A
// scene with no fog says so in fog.w and gets zero, before the division by the distance between
// the two ends, which with no fog is nothing.
fn fogAt(worldPos: vec3<f32>) -> f32 {
    if (lights.fog.w <= 0.0) {
        return 0.0;
    }
    let dist = length(worldPos - uniforms.cameraPosition.xyz);
    return clamp((dist - lights.fogRange.x) / (lights.fogRange.y - lights.fogRange.x), 0.0, 1.0);
}

struct LightSample {
    diffuse: vec3<f32>,
    specular: vec3<f32>,
};

// Where a light is from a point on a surface, and how much of it survives getting there. The three
// kinds differ here and nowhere else.
fn sampleLight(index: u32, worldPos: vec3<f32>, normal: vec3<f32>, viewDir: vec3<f32>) -> LightSample {
    let item = lights.items[index];
    var dir = normalize(item.vector.xyz);
    var attenuation = 1.0;

    if (item.vector.w > 0.5) {
        // A lamp and a torch both have a place, and both fade out by their reach.
        let toLight = item.vector.xyz - worldPos;
        let dist = length(toLight);
        dir = toLight / max(dist, 0.0001);
        attenuation = clamp(1.0 - dist / max(item.color.a, 0.0001), 0.0, 1.0);

        if (item.vector.w > 1.5) {
            // A torch also narrows to its cone, softly at the rim.
            let cosAngle = dot(-dir, normalize(item.spotDirection.xyz));
            attenuation = attenuation * smoothstep(item.spotDirection.w, item.spotParams.x, cosAngle);
        }
    }

    var out: LightSample;
    out.diffuse = max(dot(normal, dir), 0.0) * attenuation * item.color.rgb;

    // The shine is where the light would bounce straight into the eye. the facing term kills it on
    // surfaces turned away, which would otherwise glint along their edge.
    let halfVec = normalize(dir + viewDir);
    let amount = pow(max(dot(normal, halfVec), 0.0), max(uniforms.specular.w, 1.0));
    let facing = step(0.0001, dot(normal, dir));
    out.specular = amount * facing * attenuation * uniforms.specular.rgb * item.color.rgb;
    return out;
}

struct LitSurface {
    diffuse: vec3<f32>,
    shine: vec3<f32>,
    // The casting light's own share, kept apart so the fragment can take that one away and no other.
    casterDiffuse: vec3<f32>,
    casterShine: vec3<f32>,
};

// Every light on this surface, with the casting one's share also kept on its own.
fn litBy(worldPos: vec3<f32>, normal: vec3<f32>, viewDir: vec3<f32>) -> LitSurface {
    var out: LitSurface;
    out.diffuse = vec3<f32>(0.0);
    out.shine = vec3<f32>(0.0);
    out.casterDiffuse = vec3<f32>(0.0);
    out.casterShine = vec3<f32>(0.0);

    let count = u32(lights.ambient.w);
    let caster = i32(lights.shadowParams.w);
    for (var i = 0u; i < count; i = i + 1u) {
        let contribution = sampleLight(i, worldPos, normal, viewDir);
        out.diffuse = out.diffuse + contribution.diffuse;
        out.shine = out.shine + contribution.specular;
        if (i32(i) == caster) {
            out.casterDiffuse = contribution.diffuse;
            out.casterShine = contribution.specular;
        }
    }
    return out;
}

// Where this point falls in the map. Worked out at the corner, which is the cheap half.
fn shadowCoordOf(worldPos: vec3<f32>) -> vec4<f32> {
    return lights.shadowMatrix * vec4<f32>(worldPos, 1.0);
}

// Whether the light can see this point: 1 lit, 0 hidden, and in between along a rim, because the
// card compares four steps at once and hands back how many said yes.
//
// This is the **one thing in this engine worked out per pixel rather than per corner**, and it is
// deliberate: a shadow's edge is a hard line across a surface, and smeared between corners it would
// land on triangle boundaries instead of where the wall is.
fn shadowFactor(coord: vec4<f32>) -> f32 {
    if (lights.shadowParams.w < 0.0) {
        return 1.0;
    }
    let proj = coord.xyz / max(coord.w, 0.0001);
    let uv = vec2<f32>(proj.x * 0.5 + 0.5, 0.5 - proj.y * 0.5);
    // Outside the map there is no answer, so the answer is "lit". Anything else would put a dark
    // square edge across the world where the square the light covers happens to end.
    if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0 || proj.z < 0.0 || proj.z > 1.0) {
        return 1.0;
    }
    // Level and not the plain one: the plain one picks a mip from the derivatives, which needs
    // every pixel of a quad to be taking the same branch, and the one above is a branch.
    return textureSampleCompareLevel(shadowMap, shadowSampler, uv, proj.z - lights.shadowParams.x);
}

// What is left of the light once the casting one has been taken away where it cannot see.
fn litWithShadow(light: vec3<f32>, casterLight: vec3<f32>, coord: vec4<f32>) -> vec3<f32> {
    let hidden = (1.0 - shadowFactor(coord)) * lights.shadowParams.y;
    return light - casterLight * hidden;
}

`;

/**
 * What the vertex hands the fragment for an ordinary model: where it landed, which texel to read,
 * and how lit it came out.
 *
 * **Only what the built-in ending reads**, and deliberately not the normal or the world position. A
 * material that wants those declares a wider one of these for itself, and pays for carrying them
 * across every triangle. A model with no material of its own should not.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const MESH_VERTEX_OUTPUT = /* wgsl */ `struct VertexOutput {
    @builtin(position) position: vec4<f32>,
    // Where in the picture, times a depth to undo the card's correction with (see affineUv).
    @location(0) uv: vec3<f32>,
    @location(1) light: vec3<f32>,
    @location(2) shine: vec3<f32>,
    // Where this corner falls in the shadow map, and the casting light's own share of the two
    // above. Carried across every triangle whether a scene casts or not, which is the one real
    // cost this feature has on a scene that does not: three more numbers a corner, smeared.
    @location(3) shadowCoord: vec4<f32>,
    @location(4) casterLight: vec3<f32>,
    @location(5) casterShine: vec3<f32>,
    // The colour painted on the corner, smeared across the triangle like the light is.
    @location(6) color: vec4<f32>,
    // How much of the corner the fog has taken, smeared like the light.
    @location(7) fog: f32,
};

`;

/**
 * Everything both mesh shaders declare before either of them draws anything.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const MESH_SHADER_COMMON = MESH_SHADER_TYPES + MESH_VERTEX_OUTPUT;

/**
 * The part that turns light into a colour on screen.
 *
 * Shared word for word with the shader that bends a model around its bones, because bending is a
 * thing that happens to corners: by the time anything is painted, the two have nothing left to
 * disagree about.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const MESH_SHADER_FRAGMENT = /* wgsl */ `
@fragment
fn fs(in: VertexOutput) -> @location(0) vec4<f32> {
    let texColor = textureSample(meshTexture, meshSampler, in.uv.xy / in.uv.z);
    // The floor is a floor and not an addition: a surface facing away is dim, never brighter than
    // one facing the light.
    // Only the casting light's share is taken away, so a thing in the sun's shadow is still lit by
    // the lamp beside it. Taking the whole lot away is what makes a shadow read as a dark smudge.
    let shaded = litWithShadow(in.light, in.casterLight, in.shadowCoord);
    let lit = max(shaded, lights.ambient.rgb);
    // The colour painted on the corners multiplies in with the picture, the way the era's hardware
    // combined them: a green corner over a dirt picture is grass. Unpainted corners are white.
    let color = texColor * uniforms.tint * in.color * vec4<f32>(lit, 1.0);

    // The shine and the glow sit on top, not multiplied by the picture: a highlight is light
    // bouncing off the surface, not part of what is painted on it.
    let shine = litWithShadow(in.shine, in.casterShine, in.shadowCoord);
    // The fog last, over everything, glow included: a lamp far off in the fog is lost in it too.
    return vec4<f32>(mix(color.rgb + shine + uniforms.emissive.rgb, lights.fog.rgb, in.fog), color.a);
}
`;

/**
 * What draws a model that does not bend. See {@link MESH_SHADER_COMMON} for the whole of it.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const MESH_SHADER = MESH_SHADER_COMMON + /* wgsl */ `
@vertex
fn vs(
    @location(0) position: vec3<f32>,
    @location(1) normal: vec3<f32>,
    @location(2) uv: vec2<f32>,
    @location(5) color: vec4<f32>,
) -> VertexOutput {
    var out: VertexOutput;
    out.position = snapToPixels(uniforms.mvp * vec4<f32>(position, 1.0));

    let worldPos = (uniforms.model * vec4<f32>(position, 1.0)).xyz;
    let worldNormal = normalize((uniforms.normalMatrix * vec4<f32>(normal, 0.0)).xyz);
    let viewDir = normalize(uniforms.cameraPosition.xyz - worldPos);

    let surface = litBy(worldPos, worldNormal, viewDir);
    out.light = surface.diffuse;
    out.shine = surface.shine;
    out.casterLight = surface.casterDiffuse;
    out.casterShine = surface.casterShine;
    out.shadowCoord = shadowCoordOf(worldPos);
    out.uv = affineUv(uv, out.position);
    out.color = color;
    out.fog = fogAt(worldPos);
    return out;
}

` + MESH_SHADER_FRAGMENT;
