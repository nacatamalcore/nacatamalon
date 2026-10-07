import type { TBuiltinPostEffect } from './types/t_builtin';

/**
 * The screen of a handheld: a grid between the pixels, a tint the panel could not help, and pixels
 * that were slow to change, so anything moving left a ghost behind it.
 *
 * The grid is one real pixel wide around each game pixel, so it needs a `pixelRatio` of 2 or more
 * to have somewhere to go; at `1` there is no gap to draw and it is left out, and at `2` only the
 * corner of each pixel is darkened, so the picture keeps most of its light. The ghost reads what
 * the effect showed last frame, which costs two pictures the size of the canvas while it runs.
 *
 * @param options `grid` and `ghosting` from `0` to `1`; `tint` multiplies every colour.
 * @returns The effect, for `usePostProcess`.
 *
 * @example
 * ```ts
 * usePostProcess(lcd({ tint: [0.61, 0.73, 0.06], ghosting: 0.5 }));
 * ```
 *
 * @category Post-processing
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const lcd = (options: { grid?: number; ghosting?: number; tint?: [number, number, number] } = {}): TBuiltinPostEffect<{
    grid: number; ghosting: number; tint: number[];
}> => ({
    name: 'lcd',
    history: true,
    fragment: /* wgsl */ `
fn effect(color: vec4<f32>, uv: vec2<f32>) -> vec4<f32> {
    let game = uv * mu.resolution;
    let perPixel = max(fwidth(game), vec2<f32>(0.0001));
    // Real pixels per game pixel, rounded: the measured value wobbles a hair either side of a whole
    // number from one pixel to the next, and a test against it would draw the grid in random columns.
    let across = round(1.0 / perPixel);
    var rgb = color.rgb * mu.tint;
    if (across.x >= 2.0 && across.y >= 2.0) {
        // Which real pixel of its game pixel this one is; the first of each row and column is the gap.
        let which = floor(fract(game) * across);
        // At two real pixels a side, a whole row and column of gap would darken three in four of
        // them; only the corner is dark there, which still reads as a grid.
        let gap = select(which.x == 0.0 && which.y == 0.0, which.x == 0.0 || which.y == 0.0, min(across.x, across.y) >= 3.0);
        rgb = rgb * select(1.0, 1.0 - mu.grid, gap);
    }
    let before = sampleHistory(uv).rgb;
    return vec4<f32>(mix(rgb, before, clamp(mu.ghosting, 0.0, 0.95)), 1.0);
}
`,
    fragmentGlsl: /* glsl */ `
vec4 effect(vec4 color, vec2 uv) {
    vec2 game = uv * mu.resolution;
    vec2 perPixel = max(fwidth(game), vec2(0.0001));
    vec2 across = floor(1.0 / perPixel + 0.5);
    vec3 rgb = color.rgb * mu.tint;
    if (across.x >= 2.0 && across.y >= 2.0) {
        vec2 which = floor(fract(game) * across);
        bool gap = min(across.x, across.y) >= 3.0
            ? (which.x == 0.0 || which.y == 0.0)
            : (which.x == 0.0 && which.y == 0.0);
        rgb *= gap ? 1.0 - mu.grid : 1.0;
    }
    vec3 before = sampleHistory(uv).rgb;
    return vec4(mix(rgb, before, clamp(mu.ghosting, 0.0, 0.95)), 1.0);
}
`,
    uniforms: { grid: options.grid ?? 0.35, ghosting: options.ghosting ?? 0.4, tint: options.tint ?? [1, 1, 1] },
    uniformSig: { grid: 'f32', ghosting: 'f32', tint: 'vec3<f32>' },
});
