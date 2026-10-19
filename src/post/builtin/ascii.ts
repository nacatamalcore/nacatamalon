import type { TColor } from '../../color/color';
import type { TColorInput } from '../../color/get_color';
import { ASCII_GLYPHS } from './ascii_glyphs';
import { colorUniform } from './color_uniform';
import type { TBuiltinPostEffect } from './types/t_builtin';

// The letters when none are asked for, from empty to full. A cell is 6 × 6: the 5 × 5 letter, and a
// row and a column of gap so letters never touch.
const DEFAULT_GLYPHS = ' .:-=+*#W@';

/**
 * The letters asked for, as the list of numbers the shader is written with. One the engine cannot
 * draw is left out, with a warning naming it; fewer than two left is the default set, since one
 * letter cannot tell light from dark.
 */
const glyphList = (glyphs: string): string => {
    const known = Array.from(glyphs).filter((glyph) => ASCII_GLYPHS[glyph] !== undefined);
    const unknown = Array.from(glyphs).filter((glyph) => ASCII_GLYPHS[glyph] === undefined);
    if (unknown.length > 0) {
        console.warn(
            `[NacatamalOn] ascii: no letter for '${unknown.join('')}', so it is left out. ` +
            "It draws the printable ASCII characters, ' ' to '~', and the blocks ░ ▒ ▓ █.",
        );
    }
    const chosen = known.length >= 2 ? known : Array.from(DEFAULT_GLYPHS);
    if (known.length < 2) {
        console.warn(`[NacatamalOn] ascii: glyphs needs at least two letters it can draw, so it uses '${DEFAULT_GLYPHS}'.`);
    }
    return chosen.map((glyph) => ASCII_GLYPHS[glyph] + 'u').join(', ');
};

/**
 * Draws the frame in letters: it is cut into cells, and each cell becomes a letter as dense as the
 * picture is bright there, a space in the dark and `@` in the light, in the picture's own colour.
 *
 * The letters are chosen after everything is drawn, so lights, gradients and reflections come
 * through on their own. They are 5 × 5 pictures carried in the shader, so nothing has to be loaded.
 * A `bloom()` after it makes them glow.
 *
 * `glyphs` says which letters, from the darkest to the brightest: `' .oO0@'`, `' ░▒▓█'`, or as many
 * as wanted. Any printable ASCII character, `' '` to `'~'`, and the blocks `░ ▒ ▓ █`; one it cannot
 * draw is left out with a warning. They are written into the shader when the effect is made, so
 * they are an option and not a knob: other letters are another `ascii()`.
 *
 * @param options `scale` is the side of a cell in game pixels, rounded to a multiple of `6` so every
 * pixel of a letter is the same size (`6` is the smallest, `12` letters twice as big); `color` from
 * `0` (every letter in `ink`, a terminal) to `1` (the picture's own colour); `ink` is any colour,
 * `'#4dff73'`, a `TColor` or `[r, g, b]`; `background` how much of the picture shows behind the
 * letters, `0` none; `brightness` how bright the letters are against the colour they were read from;
 * `glyphs` the letters, darkest first, `' .:-=+*#W@'` when left out.
 * @returns The effect, for `usePostProcess`.
 *
 * @example
 * ```ts
 * usePostProcess(ascii({ scale: 6 }));
 * usePostProcess(ascii({ glyphs: ' ░▒▓█', color: 0, ink: '#ffb000' }));
 * usePostProcess(bloom({ threshold: 0.45, intensity: 0.8 }));
 * ```
 *
 * @category Post-processing
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const ascii = (options: {
    scale?: number; color?: number; ink?: TColorInput | TColor | [number, number, number]; background?: number; brightness?: number;
    glyphs?: string;
} = {}): TBuiltinPostEffect<{
    scale: number; color: number; ink: number[]; background: number; brightness: number;
}> => {
    const list = glyphList(options.glyphs ?? DEFAULT_GLYPHS);
    const count = list.split(',').length;
    return {
        name: 'ascii',
        fragment: /* wgsl */ `
fn effect(color: vec4<f32>, uv: vec2<f32>) -> vec4<f32> {
    var glyphs = array<u32, ${count}>(${list});
    let place = uv * mu.resolution;
    let cell = max(6.0, round(mu.scale / 6.0) * 6.0);
    let middle = (floor(place / cell) + 0.5) * cell;
    let shade = sampleTexture(clamp(middle / mu.resolution, vec2<f32>(0.0), vec2<f32>(1.0))).rgb;
    let lum = dot(shade, vec3<f32>(0.299, 0.587, 0.114));
    let level = clamp(i32(lum * ${count}.0), 0, ${count - 1});
    let sub = vec2<i32>(floor(fract(place / cell) * 6.0));
    var lit = 0.0;
    if (sub.x < 5 && sub.y < 5) {
        lit = f32((glyphs[level] >> u32(sub.y * 5 + sub.x)) & 1u);
    }
    let ink = mix(mu.ink * (0.35 + lum), shade, mu.color);
    let letter = min(ink * mu.brightness, vec3<f32>(1.0));
    return vec4<f32>(mix(shade * mu.background, letter, lit), color.a);
}
`,
        fragmentGlsl: /* glsl */ `
const uint GLYPHS[${count}] = uint[${count}](${list});

vec4 effect(vec4 color, vec2 uv) {
    vec2 place = uv * mu.resolution;
    float cell = max(6.0, floor(mu.scale / 6.0 + 0.5) * 6.0);
    vec2 middle = (floor(place / cell) + 0.5) * cell;
    vec3 shade = sampleTexture(clamp(middle / mu.resolution, 0.0, 1.0)).rgb;
    float lum = dot(shade, vec3(0.299, 0.587, 0.114));
    int level = clamp(int(lum * ${count}.0), 0, ${count - 1});
    ivec2 sub = ivec2(floor(fract(place / cell) * 6.0));
    float lit = 0.0;
    if (sub.x < 5 && sub.y < 5) {
        lit = float((GLYPHS[level] >> uint(sub.y * 5 + sub.x)) & 1u);
    }
    vec3 ink = mix(mu.ink * (0.35 + lum), shade, mu.color);
    vec3 letter = min(ink * mu.brightness, vec3(1.0));
    return vec4(mix(shade * mu.background, letter, lit), color.a);
}
`,
        uniforms: {
            scale: options.scale ?? 6,
            color: options.color ?? 1,
            ink: colorUniform(options.ink, [0.3, 1, 0.45]),
            background: options.background ?? 0.08,
            brightness: options.brightness ?? 1.6,
        },
        uniformSig: { scale: 'f32', color: 'f32', ink: 'vec3<f32>', background: 'f32', brightness: 'f32' },
    };
};
