import { BAYER_GLSL, BAYER_WGSL } from './bayer';
import type { TBuiltinPostEffect } from './types/t_builtin';

/**
 * Replaces every colour with the nearest one a palette actually holds.
 *
 * This is the effect that makes a frame look like a particular machine rather than merely like an
 * old one: a NES palette is fifty-four specific colours, and no amount of cutting channels into
 * steps will land on them.
 *
 * A small `dither` shakes each pixel by less than the gap between neighbours before the search, so a
 * slow gradient breaks into a mix of two palette entries instead of a hard edge.
 *
 * **With no palette, or one of a single colour, it gives back what it was handed.** A palette that
 * has not arrived yet must cost you the palette and not the picture.
 *
 * @param options `dither` is how much to shake before matching. Zero matches exactly.
 *
 * @example
 * ```ts
 * const nes = useLoadPalette({ src: '/palettes/nes.palette' });
 * usePostProcess({ ...paletteMatch(), palette: nes });
 * ```
 * @returns The effect, for `usePostProcess`. It needs a palette, from `useLoadPalette`.
 *
 * @category Post-processing
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const paletteMatch = (options: { dither?: number } = {}): TBuiltinPostEffect<{ dither: number }> => ({
    name: 'palette',
    fragment: /* wgsl */ `${BAYER_WGSL}
fn effect(color: vec4<f32>, uv: vec2<f32>) -> vec4<f32> {
    let count = paletteSize();
    if (count <= 1u) { return color; }

    let shaken = color.rgb + bayer(uv * mu.resolution) * mu.dither;

    var nearest = paletteColor(0u);
    // Squared distance: the search only ever compares two of them, and a square root per colour
    // per pixel would be paid a palette's worth of times for an ordering it cannot change.
    var nearestDistance = 1000.0;
    for (var i = 0u; i < count; i = i + 1u) {
        let candidate = paletteColor(i);
        let gap = shaken - candidate;
        let distance = dot(gap, gap);
        if (distance < nearestDistance) {
            nearestDistance = distance;
            nearest = candidate;
        }
    }
    return vec4<f32>(nearest, color.a);
}
`,
    fragmentGlsl: /* glsl */ `${BAYER_GLSL}
vec4 effect(vec4 color, vec2 uv) {
    int count = paletteSize();
    if (count <= 1) { return color; }

    vec3 shaken = color.rgb + bayer(uv * mu.resolution) * mu.dither;

    vec3 nearest = paletteColor(0);
    float nearestDistance = 1000.0;
    for (int i = 0; i < count; i++) {
        vec3 candidate = paletteColor(i);
        vec3 gap = shaken - candidate;
        float distance = dot(gap, gap);
        if (distance < nearestDistance) {
            nearestDistance = distance;
            nearest = candidate;
        }
    }
    return vec4(nearest, color.a);
}
`,
    uniforms: { dither: options.dither ?? 0.03 },
    uniformSig: { dither: 'f32' },
});
