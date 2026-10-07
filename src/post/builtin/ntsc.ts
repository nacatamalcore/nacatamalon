import type { TBuiltinPostEffect } from './types/t_builtin';

/**
 * The picture as it came down a composite cable: colour smeared sideways, a crawl of dots along
 * edges, and rainbows where fine detail confused the set.
 *
 * Brightness and colour travelled mixed in one signal, and the television could only part them
 * roughly. So brightness stays sharp and colour bleeds over several pixels (`bleed`), the colour
 * that leaks back into brightness crawls with each frame (`crawl`), and sharp edges in brightness
 * are taken for colour (`artifacts`). Artists of the era drew for it: dithered stripes that a cable
 * blended into a solid colour, which is why some old art only looks right through this.
 *
 * @param options Each from `0` (a clean cable) to about `1`.
 * @returns The effect, for `usePostProcess`. It belongs before `crt`.
 *
 * @example
 * ```ts
 * usePostProcess(ntsc({ bleed: 0.8 }));
 * usePostProcess(crt(CRT_PRESETS.composite));
 * ```
 *
 * @category Post-processing
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const ntsc = (options: { bleed?: number; crawl?: number; artifacts?: number } = {}): TBuiltinPostEffect<{
    bleed: number; crawl: number; artifacts: number;
}> => ({
    name: 'ntsc',
    fragment: /* wgsl */ `
fn toYiq(rgb: vec3<f32>) -> vec3<f32> {
    return vec3<f32>(
        dot(rgb, vec3<f32>(0.299, 0.587, 0.114)),
        dot(rgb, vec3<f32>(0.596, -0.274, -0.322)),
        dot(rgb, vec3<f32>(0.211, -0.523, 0.312)),
    );
}

fn fromYiq(yiq: vec3<f32>) -> vec3<f32> {
    return vec3<f32>(
        dot(yiq, vec3<f32>(1.0, 0.956, 0.621)),
        dot(yiq, vec3<f32>(1.0, -0.272, -0.647)),
        dot(yiq, vec3<f32>(1.0, -1.106, 1.703)),
    );
}

fn effect(color: vec4<f32>, uv: vec2<f32>) -> vec4<f32> {
    let pixel = 1.0 / mu.resolution.x;
    let spread = max(0.01, mu.bleed * 2.5);
    var chroma = vec2<f32>(0.0);
    var total = 0.0;
    for (var k = -4; k <= 4; k = k + 1) {
        let away = f32(k);
        let weight = exp(-0.5 * away * away / (spread * spread));
        chroma = chroma + toYiq(sampleTexture(vec2<f32>(clamp(uv.x + away * pixel, 0.0, 1.0), uv.y)).rgb).yz * weight;
        total = total + weight;
    }
    chroma = chroma / total;

    var luma = toYiq(color.rgb).x;
    let left = toYiq(sampleTexture(vec2<f32>(max(uv.x - pixel, 0.0), uv.y)).rgb).x;
    let place = floor(uv * mu.resolution);
    let frame = floor(mu.time * 60.0);
    // The subcarrier: a third of a turn a pixel, another third a line, and another a frame.
    let phase = (place.x + place.y + frame) * 2.0943951;
    luma = luma + mu.crawl * 0.15 * length(chroma) * sin(phase);
    chroma = chroma + mu.artifacts * (luma - left) * vec2<f32>(cos(phase), sin(phase));

    return vec4<f32>(clamp(fromYiq(vec3<f32>(luma, chroma)), vec3<f32>(0.0), vec3<f32>(1.0)), color.a);
}
`,
    fragmentGlsl: /* glsl */ `
vec3 toYiq(vec3 rgb) {
    return vec3(
        dot(rgb, vec3(0.299, 0.587, 0.114)),
        dot(rgb, vec3(0.596, -0.274, -0.322)),
        dot(rgb, vec3(0.211, -0.523, 0.312))
    );
}

vec3 fromYiq(vec3 yiq) {
    return vec3(
        dot(yiq, vec3(1.0, 0.956, 0.621)),
        dot(yiq, vec3(1.0, -0.272, -0.647)),
        dot(yiq, vec3(1.0, -1.106, 1.703))
    );
}

vec4 effect(vec4 color, vec2 uv) {
    float pixel = 1.0 / mu.resolution.x;
    float spread = max(0.01, mu.bleed * 2.5);
    vec2 chroma = vec2(0.0);
    float total = 0.0;
    for (int k = -4; k <= 4; k++) {
        float away = float(k);
        float weight = exp(-0.5 * away * away / (spread * spread));
        chroma += toYiq(sampleTexture(vec2(clamp(uv.x + away * pixel, 0.0, 1.0), uv.y)).rgb).yz * weight;
        total += weight;
    }
    chroma /= total;

    float luma = toYiq(color.rgb).x;
    float left = toYiq(sampleTexture(vec2(max(uv.x - pixel, 0.0), uv.y)).rgb).x;
    vec2 place = floor(uv * mu.resolution);
    float frame = floor(mu.time * 60.0);
    float phase = (place.x + place.y + frame) * 2.0943951;
    luma += mu.crawl * 0.15 * length(chroma) * sin(phase);
    chroma += mu.artifacts * (luma - left) * vec2(cos(phase), sin(phase));

    return vec4(clamp(fromYiq(vec3(luma, chroma)), 0.0, 1.0), color.a);
}
`,
    uniforms: { bleed: options.bleed ?? 0.6, crawl: options.crawl ?? 0.3, artifacts: options.artifacts ?? 0.2 },
    uniformSig: { bleed: 'f32', crawl: 'f32', artifacts: 'f32' },
});
