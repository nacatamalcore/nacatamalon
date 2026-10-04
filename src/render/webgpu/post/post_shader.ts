import { buildUniformLayout, POST_ENGINE_FIELDS } from '../../shared/material_uniforms';
import type { TUniformSignature } from '../../../materials';

/**
 * Everything a screen-wide effect is given, and the one full-screen triangle it runs on.
 *
 * A triangle and not a quad: one that overhangs the screen covers every pixel with three corners
 * instead of six, and the part that hangs off is never worked out. It needs no vertex buffer at all,
 * because three corners can be worked out from which one this is.
 *
 * The picture is turned upside down **here, in the vertex half**. Clip space has its `y` upwards and
 * a picture has its `y` downwards, and this is the one place in this backend where that is settled.
 * Its twin in GLSL settles it somewhere else, and that asymmetry is deliberate: see that file.
 */
const HEAD = /* wgsl */ `
struct VertexOut {
    @builtin(position) position: vec4<f32>,
    @location(0) uv: vec2<f32>,
};

@group(0) @binding(0) var sceneSampler: sampler;
@group(0) @binding(1) var sceneTexture: texture_2d<f32>;
@group(0) @binding(2) var dataSampler: sampler;
@group(0) @binding(3) var dataTexture: texture_2d<f32>;

@vertex
fn vs(@builtin(vertex_index) index: u32) -> VertexOut {
    let x = f32((index << 1u) & 2u);
    let y = f32(index & 2u);
    var out: VertexOut;
    out.position = vec4<f32>(vec2<f32>(x, y) * 2.0 - 1.0, 0.0, 1.0);
    out.uv = vec2<f32>(x, 1.0 - y);
    return out;
}
`;

/**
 * What an effect may call. **These names are API**: an effect written against them is a file
 * somebody keeps, so renaming one breaks every effect anybody wrote.
 *
 * `paletteSize` and `lutSize` read the shape of the picture rather than a number they were told,
 * which is what stops a palette ever disagreeing with how many colours the shader thinks it has.
 *
 * `lutColor` fetches its eight corners and mixes them by hand instead of asking for a smooth read.
 * A strip lays its slices side by side, so the texel to the right of a slice's last column belongs
 * to the *next* slice: a smooth read blends across that seam and bleeds one slice into another. The
 * usual dodge is to inset by half a texel, which trades the bleed for a grade quietly squashed at
 * both ends. Fetching the corners has neither problem.
 */
const HELPERS = /* wgsl */ `
fn sampleTexture(uv: vec2<f32>) -> vec4<f32> {
    return textureSampleLevel(sceneTexture, sceneSampler, uv, 0.0);
}

fn paletteSize() -> u32 {
    return textureDimensions(dataTexture).x;
}

fn paletteColor(index: u32) -> vec3<f32> {
    return textureLoad(dataTexture, vec2<u32>(index, 0u), 0).rgb;
}

fn lutSize() -> u32 {
    return textureDimensions(dataTexture).y;
}

fn lutTexel(x: f32, y: f32, slice: f32, size: f32) -> vec3<f32> {
    return textureLoad(dataTexture, vec2<u32>(u32(slice * size + x), u32(y)), 0).rgb;
}

fn lutColor(rgb: vec3<f32>) -> vec3<f32> {
    let size = f32(lutSize());
    if (size < 2.0) { return rgb; }
    let last = size - 1.0;

    let at = clamp(rgb, vec3<f32>(0.0), vec3<f32>(1.0)) * last;
    let low = floor(at);
    let high = min(low + 1.0, vec3<f32>(last));
    let part = at - low;

    let c000 = lutTexel(low.r, low.g, low.b, size);
    let c100 = lutTexel(high.r, low.g, low.b, size);
    let c010 = lutTexel(low.r, high.g, low.b, size);
    let c110 = lutTexel(high.r, high.g, low.b, size);
    let c001 = lutTexel(low.r, low.g, high.b, size);
    let c101 = lutTexel(high.r, low.g, high.b, size);
    let c011 = lutTexel(low.r, high.g, high.b, size);
    let c111 = lutTexel(high.r, high.g, high.b, size);

    let near = mix(mix(c000, c100, part.r), mix(c010, c110, part.r), part.g);
    let far = mix(mix(c001, c101, part.r), mix(c011, c111, part.r), part.g);
    return mix(near, far, part.b);
}
`;

/**
 * The ending that calls the author's hook, with the frame already read at this place.
 */
const TAIL = /* wgsl */ `
@fragment
fn fs(in: VertexOut) -> @location(0) vec4<f32> {
    return effect(sampleTexture(in.uv), in.uv);
}
`;

/**
 * Where a screen-wide effect's parameters are bound. Everything it reads is in one group, because
 * an effect draws alone and shares nothing with the passes that drew the frame it is given.
 */
export const POST_UNIFORMS_BINDING = 4;

/**
 * Builds the whole shader for one screen-wide effect.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const buildPostShader = (fragment: string, sig: TUniformSignature): string => {
    const { structText } = buildUniformLayout(sig, POST_ENGINE_FIELDS);

    return [
        HEAD,
        structText,
        `@group(0) @binding(${POST_UNIFORMS_BINDING}) var<uniform> mu: MaterialUniforms;`,
        HELPERS,
        fragment,
        TAIL,
    ].join('\n');
};
