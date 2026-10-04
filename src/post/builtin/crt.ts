import type { TBuiltinPostEffect } from './types/t_builtin';

/**
 * Makes the frame look as if it were on a CRT television: scanlines, a phosphor mask, the bulge of
 * the glass and darker corners. Each part is a number, and a part at `0` is not there at all.
 *
 * **One scanline per row of the game, not of the screen.** The lines follow the game's own pixels,
 * the way a console's picture sat on the tube, so a game at 320 × 224 has 224 of them however large
 * the canvas is drawn. When a game row is only one real pixel tall (`pixelRatio: 1`, the pixel-art
 * default) a line cannot be drawn inside it, so alternate rows are darkened instead, which is what a
 * console's picture looked like on a screen of the same height. At two or more real pixels per row
 * every row gets its own soft line.
 *
 * The **mask** is the coloured grid of the tube itself and works on real pixels, so it only looks
 * like a mask at a `pixelRatio` of 3 or more; at 1 it reads as coloured columns. That is why it
 * starts switched off.
 *
 * It belongs **last** in a chain: a palette or a dither decides which colours exist, and the tube
 * is what those colours are shown on.
 *
 * @param options `scanlines`, `mask`, `curvature` and `vignette` are how strong each part is, from
 * `0` (absent) to about `1`; `maskType` is `'aperture'` (vertical stripes, a Trinitron) or `'slot'`
 * (staggered cells, a common TV).
 * @returns The effect, for `usePostProcess`.
 *
 * @example
 * ```ts
 * usePostProcess(crt({ scanlines: 0.35, curvature: 0.08, vignette: 0.3 }));
 * ```
 *
 * @category Post-processing
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const crt = (options: {
    scanlines?: number;
    mask?: number;
    maskType?: 'aperture' | 'slot';
    curvature?: number;
    vignette?: number;
} = {}): TBuiltinPostEffect<{ scanlines: number; mask: number; maskType: number; curvature: number; vignette: number }> => ({
    name: 'crt',
    fragment: /* wgsl */ `
fn effect(color: vec4<f32>, uv: vec2<f32>) -> vec4<f32> {
    // How many game pixels one real pixel covers, measured before anything branches: a derivative
    // is only defined while every pixel takes the same path.
    let game = uv * mu.resolution;
    let perPixel = max(fwidth(game), vec2<f32>(0.0001));
    let real = game / perPixel;

    // The glass bulges, so the picture is read from further out the further it is from the middle.
    let centred = uv * 2.0 - 1.0;
    let bent = centred * (1.0 + mu.curvature * dot(centred, centred));
    let at = bent * 0.5 + 0.5;
    if (at.x < 0.0 || at.x > 1.0 || at.y < 0.0 || at.y > 1.0) {
        return vec4<f32>(0.0, 0.0, 0.0, 1.0);
    }
    var rgb = sampleTexture(at).rgb;

    let row = at.y * mu.resolution.y;
    if (perPixel.y > 0.5) {
        rgb = rgb * (1.0 - mu.scanlines * (floor(row) % 2.0));
    } else {
        let s = sin(fract(row) * 3.14159265);
        rgb = rgb * (1.0 - mu.scanlines * (1.0 - s * s));
    }

    let column = floor(real.x) % 3.0;
    var tint = vec3<f32>(
        select(1.0 - mu.mask, 1.0, column == 0.0),
        select(1.0 - mu.mask, 1.0, column == 1.0),
        select(1.0 - mu.mask, 1.0, column == 2.0),
    );
    if (mu.maskType > 0.5) {
        let shift = (floor(real.x / 3.0) % 2.0) * 2.0;
        if ((floor(real.y) + shift) % 4.0 == 0.0) { tint = tint * (1.0 - mu.mask); }
    }
    rgb = rgb * tint;

    rgb = rgb * (1.0 - mu.vignette * smoothstep(0.4, 2.0, dot(centred, centred)));
    return vec4<f32>(rgb, 1.0);
}
`,
    fragmentGlsl: /* glsl */ `
vec4 effect(vec4 color, vec2 uv) {
    vec2 game = uv * mu.resolution;
    vec2 perPixel = max(fwidth(game), vec2(0.0001));
    vec2 real = game / perPixel;

    vec2 centred = uv * 2.0 - 1.0;
    vec2 bent = centred * (1.0 + mu.curvature * dot(centred, centred));
    vec2 at = bent * 0.5 + 0.5;
    if (at.x < 0.0 || at.x > 1.0 || at.y < 0.0 || at.y > 1.0) {
        return vec4(0.0, 0.0, 0.0, 1.0);
    }
    vec3 rgb = sampleTexture(at).rgb;

    float row = at.y * mu.resolution.y;
    if (perPixel.y > 0.5) {
        rgb *= 1.0 - mu.scanlines * mod(floor(row), 2.0);
    } else {
        float s = sin(fract(row) * 3.14159265);
        rgb *= 1.0 - mu.scanlines * (1.0 - s * s);
    }

    float column = mod(floor(real.x), 3.0);
    vec3 tint = vec3(
        column == 0.0 ? 1.0 : 1.0 - mu.mask,
        column == 1.0 ? 1.0 : 1.0 - mu.mask,
        column == 2.0 ? 1.0 : 1.0 - mu.mask
    );
    if (mu.maskType > 0.5) {
        float shift = mod(floor(real.x / 3.0), 2.0) * 2.0;
        if (mod(floor(real.y) + shift, 4.0) == 0.0) { tint *= 1.0 - mu.mask; }
    }
    rgb *= tint;

    rgb *= 1.0 - mu.vignette * smoothstep(0.4, 2.0, dot(centred, centred));
    return vec4(rgb, 1.0);
}
`,
    uniforms: {
        scanlines: options.scanlines ?? 0.3,
        mask: options.mask ?? 0,
        maskType: options.maskType === 'slot' ? 1 : 0,
        curvature: options.curvature ?? 0.06,
        vignette: options.vignette ?? 0.25,
    },
    uniformSig: { scanlines: 'f32', mask: 'f32', maskType: 'f32', curvature: 'f32', vignette: 'f32' },
});
