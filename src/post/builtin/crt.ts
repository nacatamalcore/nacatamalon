import { NOISE_GLSL, NOISE_WGSL } from './noise';
import type { TBuiltinPostEffect } from './types/t_builtin';

/**
 * What `crt()` takes. Every part is a number, and a part at `0` is not there at all.
 *
 * @category Post-processing
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TCrtOptions = {
    /**
     * How dark the gap between two lines of the picture is, from `0` to `1`.
     */
    scanlines?: number;
    /**
     * How strong the coloured grid of the tube is, from `0` to `1`.
     */
    mask?: number;
    /**
     * `'aperture'` (vertical stripes), `'slot'` (staggered cells, a common TV) or `'shadow'` (dots in
     * triangles, an arcade monitor).
     */
    maskType?: 'aperture' | 'slot' | 'shadow';
    /**
     * How many real pixels one stripe of the mask is wide. `1` is the finest the screen can show.
     */
    maskScale?: number;
    /**
     * How much the glass bulges.
     */
    curvature?: number;
    /**
     * How much darker the corners are.
     */
    vignette?: number;
    /**
     * How sharply one game pixel turns into the next along a line: `0` is a soft blend, `1` hard steps.
     */
    sharpness?: number;
    /**
     * How much a bright line widens into the gap around it, the way a stronger beam did.
     */
    beam?: number;
    /**
     * What the whole picture is multiplied by, to win back what the lines and the mask darken.
     */
    brightness?: number;
    /**
     * `1` works the lines and the glow out in light rather than in the stored numbers, which is what
     * a tube did; `0` works them out in the stored numbers. It changes how the lines blend, not how
     * bright the picture is: the frame goes into light and back out by the same curve.
     */
    gamma?: number;
    /**
     * The glow that bright parts throw across the glass.
     */
    halation?: number;
    /**
     * How far the red and blue beams miss the green one, in game pixels.
     */
    convergence?: number;
    /**
     * Moving grain.
     */
    noise?: number;
    /**
     * A faint flicker and a slow band rolling down the screen.
     */
    flicker?: number;
    /**
     * `1` draws odd and even lines on alternate frames.
     */
    interlace?: number;
    /**
     * How round the corners of the tube are, as a share of the screen.
     */
    cornerRadius?: number;
};

/**
 * The knobs of the effect `crt()` returns, as `effect.uniforms` holds them: the same names as
 * {@link TCrtOptions}, each a plain number. `maskType` is `0` aperture, `1` slot, `2` shadow.
 *
 * @category Post-processing
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TCrtUniforms = {
    scanlines: number;
    mask: number;
    maskType: number;
    maskScale: number;
    curvature: number;
    vignette: number;
    sharpness: number;
    beam: number;
    brightness: number;
    gamma: number;
    halation: number;
    convergence: number;
    noise: number;
    flicker: number;
    interlace: number;
    cornerRadius: number;
};

/**
 * Four tubes to start from, for `crt(CRT_PRESETS.pvm)` or `crt({ ...CRT_PRESETS.consumer, noise: 0 })`.
 *
 * `consumer` is the television in the living room: slot mask, some glow, some noise. `pvm` is a
 * studio monitor: flat, sharp, deep lines. `arcade` is a cabinet: a strong bulge and a dot mask.
 * `composite` is a cheap cable: soft, smeared, the colours not quite on top of each other.
 *
 * @category Post-processing
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const CRT_PRESETS = {
    consumer: {
        scanlines: 0.45, mask: 0.25, maskType: 'slot', maskScale: 1, curvature: 0.08, vignette: 0.3,
        sharpness: 0.4, beam: 0.7, brightness: 1.25, gamma: 1, halation: 0.2, convergence: 0.35,
        noise: 0.04, flicker: 0.3, interlace: 0, cornerRadius: 0.04,
    },
    pvm: {
        scanlines: 0.6, mask: 0.2, maskType: 'aperture', maskScale: 1, curvature: 0.02, vignette: 0.1,
        sharpness: 0.85, beam: 0.8, brightness: 1.3, gamma: 1, halation: 0.06, convergence: 0,
        noise: 0, flicker: 0, interlace: 0, cornerRadius: 0.01,
    },
    arcade: {
        scanlines: 0.5, mask: 0.35, maskType: 'shadow', maskScale: 1, curvature: 0.12, vignette: 0.35,
        sharpness: 0.6, beam: 0.9, brightness: 1.35, gamma: 1, halation: 0.25, convergence: 0.2,
        noise: 0.02, flicker: 0.1, interlace: 0, cornerRadius: 0.06,
    },
    composite: {
        scanlines: 0.3, mask: 0.1, maskType: 'slot', maskScale: 1, curvature: 0.08, vignette: 0.3,
        sharpness: 0.1, beam: 0.5, brightness: 1.15, gamma: 1, halation: 0.3, convergence: 0.6,
        noise: 0.06, flicker: 0.2, interlace: 0, cornerRadius: 0.04,
    },
} as const satisfies Record<string, TCrtOptions>;

/**
 * The glow, worked out at half the game's size in two passes: across, then down. Five taps each,
 * weighted 1 4 6 4 1, each a pass pixel apart, so the two together spread a bright pixel over about
 * ten game pixels for the cost of a picture a quarter of the game's area.
 */
const GLOW_ACROSS_WGSL = /* wgsl */ `
fn effect(color: vec4<f32>, uv: vec2<f32>) -> vec4<f32> {
    let gap = vec2<f32>(1.0 / mu.resolution.x, 0.0);
    var sum = sampleTextureSmooth(uv).rgb * 6.0;
    sum = sum + (sampleTextureSmooth(uv - gap).rgb + sampleTextureSmooth(uv + gap).rgb) * 4.0;
    sum = sum + sampleTextureSmooth(uv - gap * 2.0).rgb + sampleTextureSmooth(uv + gap * 2.0).rgb;
    return vec4<f32>(sum / 16.0, 1.0);
}
`;

const GLOW_ACROSS_GLSL = /* glsl */ `
vec4 effect(vec4 color, vec2 uv) {
    vec2 gap = vec2(1.0 / mu.resolution.x, 0.0);
    vec3 sum = sampleTextureSmooth(uv).rgb * 6.0;
    sum += (sampleTextureSmooth(uv - gap).rgb + sampleTextureSmooth(uv + gap).rgb) * 4.0;
    sum += sampleTextureSmooth(uv - gap * 2.0).rgb + sampleTextureSmooth(uv + gap * 2.0).rgb;
    return vec4(sum / 16.0, 1.0);
}
`;

const GLOW_DOWN_WGSL = GLOW_ACROSS_WGSL.replace('vec2<f32>(1.0 / mu.resolution.x, 0.0)', 'vec2<f32>(0.0, 1.0 / mu.resolution.y)');
const GLOW_DOWN_GLSL = GLOW_ACROSS_GLSL.replace('vec2(1.0 / mu.resolution.x, 0.0)', 'vec2(0.0, 1.0 / mu.resolution.y)');

const TUBE_WGSL = /* wgsl */ `${NOISE_WGSL}
fn toLight(rgb: vec3<f32>) -> vec3<f32> {
    return pow(max(rgb, vec3<f32>(0.0)), vec3<f32>(mix(1.0, 2.2, mu.gamma)));
}

fn toScreen(rgb: vec3<f32>) -> vec3<f32> {
    return pow(max(rgb, vec3<f32>(0.0)), vec3<f32>(1.0 / mix(1.0, 2.2, mu.gamma)));
}

// One line of the picture at a place along it, blending the two game pixels either side. Sharpness
// steepens the blend towards a hard step without ever making it one.
fn beamLine(x: f32, y: f32) -> vec3<f32> {
    let along = x - 0.5;
    let left = floor(along);
    let part = clamp((along - left - 0.5) * (1.0 + mu.sharpness * 8.0) + 0.5, 0.0, 1.0);
    let row = (y + 0.5) / mu.resolution.y;
    let a = toLight(sampleInput(vec2<f32>((left + 0.5) / mu.resolution.x, row)).rgb);
    let b = toLight(sampleInput(vec2<f32>((left + 1.5) / mu.resolution.x, row)).rgb);
    return mix(a, b, part);
}

// The same line with the red and blue beams landing a little to either side of the green.
fn beams(x: f32, y: f32) -> vec3<f32> {
    if (mu.convergence == 0.0) {
        return beamLine(x, y);
    }
    return vec3<f32>(
        beamLine(x + mu.convergence, y).r,
        beamLine(x, y).g,
        beamLine(x - mu.convergence, y).b,
    );
}

// How much of a line reaches a point 'away' rows from its middle. A brighter line is wider.
fn spot(away: f32, rgb: vec3<f32>) -> vec3<f32> {
    let width = vec3<f32>(0.25) + mu.beam * 0.15 * rgb;
    return exp(-0.5 * away * away / (width * width));
}

fn effect(color: vec4<f32>, uv: vec2<f32>) -> vec4<f32> {
    // How many game pixels one real pixel covers, measured before anything branches: a derivative
    // is only defined while every pixel takes the same path.
    let game = uv * mu.resolution;
    let perPixel = max(fwidth(game), vec2<f32>(0.0001));
    let real = game / perPixel;
    let frame = floor(mu.time * 60.0);

    // The glass bulges, so the picture is read from further out the further it is from the middle.
    let centred = uv * 2.0 - 1.0;
    let bent = centred * (1.0 + mu.curvature * dot(centred, centred));
    let radius = clamp(mu.cornerRadius, 0.0, 1.0) * 2.0;
    let corner = abs(bent) - vec2<f32>(1.0 - radius);
    let edge = length(max(corner, vec2<f32>(0.0))) - radius;
    let edgeWidth = max(fwidth(edge), 0.0001);
    if (edge > 0.0) {
        return vec4<f32>(0.0, 0.0, 0.0, 1.0);
    }
    let at = bent * 0.5 + 0.5;

    var place = at * mu.resolution;
    // Every other frame the picture sits half a line lower, which is what drawing odd and even
    // lines on alternate fields looks like.
    if (mu.interlace > 0.5) {
        place.y = place.y + 0.5 * (frame % 2.0);
    }
    let row = floor(place.y);
    let here = beams(place.x, row);

    var rgb = here;
    // Fewer than about one and a half real pixels per game row. Not compared against exactly a half:
    // at a pixelRatio of 2 the measure lands on 0.5 give or take a rounding error, and the two sides
    // of the test would take turns from row to row.
    if (perPixel.y > 0.7) {
        // A game row one real pixel tall has no room for a line inside it, so alternate rows are
        // darkened instead, which is what the picture looked like on a screen of the same height.
        rgb = here * (1.0 - mu.scanlines * (row % 2.0));
    } else {
        // The beam's own profile, with the nearer neighbour line spilling into the gap.
        let away = place.y - row - 0.5;
        let towards = select(1.0, -1.0, away < 0.0);
        let next = beams(place.x, row + towards);
        let lit = here * spot(away, here) + next * spot(1.0 - abs(away), next);
        rgb = mix(here, lit, mu.scanlines);
    }

    // The tube's grid, on real pixels: it is part of the glass, not of the picture.
    let cell = real / max(1.0, mu.maskScale);
    var column = floor(cell.x) % 3.0;
    if (mu.maskType > 1.5) {
        column = floor(cell.x + 1.5 * (floor(cell.y) % 2.0)) % 3.0;
    }
    var tint = vec3<f32>(
        select(1.0 - mu.mask, 1.0, column == 0.0),
        select(1.0 - mu.mask, 1.0, column == 1.0),
        select(1.0 - mu.mask, 1.0, column == 2.0),
    );
    if (mu.maskType > 0.5 && mu.maskType < 1.5) {
        let shift = (floor(cell.x / 3.0) % 2.0) * 2.0;
        if ((floor(cell.y) + shift) % 4.0 == 0.0) { tint = tint * (1.0 - mu.mask); }
    }
    rgb = rgb * tint;

    rgb = rgb + toLight(sampleTextureSmooth(at).rgb) * mu.halation;

    let roll = fract(at.y - mu.time * 0.12);
    let band = smoothstep(0.75, 1.0, roll) * (1.0 - smoothstep(0.97, 1.0, roll));
    rgb = rgb * (1.0 - mu.flicker * (0.03 * hash12(vec2<f32>(frame, 0.0)) + 0.12 * band));

    rgb = rgb * mu.brightness;
    rgb = rgb * (1.0 - mu.vignette * smoothstep(0.4, 2.0, dot(centred, centred)));
    // A soft edge a pixel or two wide, so a round corner is not a staircase.
    rgb = rgb * clamp(-edge / edgeWidth, 0.0, 1.0);
    // Grain goes on after the way back out of light: added in light, it would be ten times stronger
    // in the blacks than in the whites.
    let grain = hash12(floor(real) + vec2<f32>(frame * 7.0, frame * 13.0)) - 0.5;
    let shown = toScreen(rgb) + grain * mu.noise * step(0.0, -edge);
    return vec4<f32>(clamp(shown, vec3<f32>(0.0), vec3<f32>(1.0)), 1.0);
}
`;

const TUBE_GLSL = /* glsl */ `${NOISE_GLSL}
vec3 toLight(vec3 rgb) {
    return pow(max(rgb, vec3(0.0)), vec3(mix(1.0, 2.2, mu.gamma)));
}

vec3 toScreen(vec3 rgb) {
    return pow(max(rgb, vec3(0.0)), vec3(1.0 / mix(1.0, 2.2, mu.gamma)));
}

vec3 beamLine(float x, float y) {
    float along = x - 0.5;
    float left = floor(along);
    float part = clamp((along - left - 0.5) * (1.0 + mu.sharpness * 8.0) + 0.5, 0.0, 1.0);
    float row = (y + 0.5) / mu.resolution.y;
    vec3 a = toLight(sampleInput(vec2((left + 0.5) / mu.resolution.x, row)).rgb);
    vec3 b = toLight(sampleInput(vec2((left + 1.5) / mu.resolution.x, row)).rgb);
    return mix(a, b, part);
}

vec3 beams(float x, float y) {
    if (mu.convergence == 0.0) {
        return beamLine(x, y);
    }
    return vec3(
        beamLine(x + mu.convergence, y).r,
        beamLine(x, y).g,
        beamLine(x - mu.convergence, y).b
    );
}

vec3 spot(float away, vec3 rgb) {
    vec3 width = vec3(0.25) + mu.beam * 0.15 * rgb;
    return exp(-0.5 * away * away / (width * width));
}

vec4 effect(vec4 color, vec2 uv) {
    vec2 game = uv * mu.resolution;
    vec2 perPixel = max(fwidth(game), vec2(0.0001));
    vec2 real = game / perPixel;
    float frame = floor(mu.time * 60.0);

    vec2 centred = uv * 2.0 - 1.0;
    vec2 bent = centred * (1.0 + mu.curvature * dot(centred, centred));
    float radius = clamp(mu.cornerRadius, 0.0, 1.0) * 2.0;
    vec2 corner = abs(bent) - vec2(1.0 - radius);
    float edge = length(max(corner, vec2(0.0))) - radius;
    float edgeWidth = max(fwidth(edge), 0.0001);
    if (edge > 0.0) {
        return vec4(0.0, 0.0, 0.0, 1.0);
    }
    vec2 at = bent * 0.5 + 0.5;

    vec2 place = at * mu.resolution;
    if (mu.interlace > 0.5) {
        place.y += 0.5 * mod(frame, 2.0);
    }
    float row = floor(place.y);
    vec3 here = beams(place.x, row);

    vec3 rgb = here;
    if (perPixel.y > 0.7) {
        rgb = here * (1.0 - mu.scanlines * mod(row, 2.0));
    } else {
        float away = place.y - row - 0.5;
        float towards = away < 0.0 ? -1.0 : 1.0;
        vec3 next = beams(place.x, row + towards);
        vec3 lit = here * spot(away, here) + next * spot(1.0 - abs(away), next);
        rgb = mix(here, lit, mu.scanlines);
    }

    vec2 cell = real / max(1.0, mu.maskScale);
    float column = mod(floor(cell.x), 3.0);
    if (mu.maskType > 1.5) {
        column = mod(floor(cell.x + 1.5 * mod(floor(cell.y), 2.0)), 3.0);
    }
    vec3 tint = vec3(
        column == 0.0 ? 1.0 : 1.0 - mu.mask,
        column == 1.0 ? 1.0 : 1.0 - mu.mask,
        column == 2.0 ? 1.0 : 1.0 - mu.mask
    );
    if (mu.maskType > 0.5 && mu.maskType < 1.5) {
        float shift = mod(floor(cell.x / 3.0), 2.0) * 2.0;
        if (mod(floor(cell.y) + shift, 4.0) == 0.0) { tint *= 1.0 - mu.mask; }
    }
    rgb *= tint;

    rgb += toLight(sampleTextureSmooth(at).rgb) * mu.halation;

    float roll = fract(at.y - mu.time * 0.12);
    float band = smoothstep(0.75, 1.0, roll) * (1.0 - smoothstep(0.97, 1.0, roll));
    rgb *= 1.0 - mu.flicker * (0.03 * hash12(vec2(frame, 0.0)) + 0.12 * band);

    rgb *= mu.brightness;
    rgb *= 1.0 - mu.vignette * smoothstep(0.4, 2.0, dot(centred, centred));
    rgb *= clamp(-edge / edgeWidth, 0.0, 1.0);
    float grain = hash12(floor(real) + vec2(frame * 7.0, frame * 13.0)) - 0.5;
    vec3 shown = toScreen(rgb) + grain * mu.noise * step(0.0, -edge);
    return vec4(clamp(shown, 0.0, 1.0), 1.0);
}
`;

const MASK_TYPES = { aperture: 0, slot: 1, shadow: 2 } as const;

/**
 * Makes the frame look as if it were on a CRT television: lines, a phosphor mask, the bulge and the
 * glow of the glass, and the small faults of a real tube. Each part is a number, and a part at `0` is
 * not there at all. {@link CRT_PRESETS} has four tubes to start from.
 *
 * **One line per row of the game, not of the screen.** The lines follow the game's own pixels, the
 * way a console's picture sat on the tube, so a game at 320 × 224 has 224 of them however large the
 * canvas is drawn. When a game row is only one real pixel tall (`pixelRatio: 1`, the pixel-art
 * default) a line cannot be drawn inside it, so alternate rows are darkened instead. At two or more
 * real pixels per row each line gets the shape of a beam, and a bright one widens into the gap.
 *
 * The **mask** is the coloured grid of the tube itself and works on real pixels, so it only looks
 * like a mask at a `pixelRatio` of 3 or more; below that, `maskScale` makes it coarser, or leave it
 * off. That is why it starts switched off.
 *
 * The **glow** is worked out at half the game's size, so it costs a little whatever size the canvas
 * is. `noise`, `flicker` and `interlace` move every frame and start off, so a still scene stays still.
 *
 * It belongs **last** in a chain: a palette or a dither decides which colours exist, and the tube
 * is what those colours are shown on.
 *
 * @param options How strong each part is; see {@link TCrtOptions}.
 * @returns The effect, for `usePostProcess`.
 *
 * @example
 * ```ts
 * usePostProcess(crt());
 * usePostProcess(crt(CRT_PRESETS.pvm));
 * usePostProcess(crt({ ...CRT_PRESETS.consumer, noise: 0, curvature: 0 }));
 * ```
 *
 * @category Post-processing
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const crt = (options: TCrtOptions = {}): TBuiltinPostEffect<TCrtUniforms> => ({
    name: 'crt',
    fragment: TUBE_WGSL,
    fragmentGlsl: TUBE_GLSL,
    passes: [
        { fragment: GLOW_ACROSS_WGSL, fragmentGlsl: GLOW_ACROSS_GLSL, scale: 0.5 },
        { fragment: GLOW_DOWN_WGSL, fragmentGlsl: GLOW_DOWN_GLSL, scale: 0.5 },
    ],
    uniforms: {
        scanlines: options.scanlines ?? 0.45,
        mask: options.mask ?? 0,
        maskType: MASK_TYPES[options.maskType ?? 'aperture'],
        maskScale: options.maskScale ?? 1,
        curvature: options.curvature ?? 0.06,
        vignette: options.vignette ?? 0.25,
        sharpness: options.sharpness ?? 0.5,
        beam: options.beam ?? 0.6,
        brightness: options.brightness ?? 1.15,
        gamma: options.gamma ?? 1,
        halation: options.halation ?? 0.12,
        convergence: options.convergence ?? 0,
        noise: options.noise ?? 0,
        flicker: options.flicker ?? 0,
        interlace: options.interlace ?? 0,
        cornerRadius: options.cornerRadius ?? 0.03,
    },
    uniformSig: {
        scanlines: 'f32', mask: 'f32', maskType: 'f32', maskScale: 'f32', curvature: 'f32',
        vignette: 'f32', sharpness: 'f32', beam: 'f32', brightness: 'f32', gamma: 'f32',
        halation: 'f32', convergence: 'f32', noise: 'f32', flicker: 'f32', interlace: 'f32',
        cornerRadius: 'f32',
    },
});
