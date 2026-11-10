import { BAYER_4X4 } from '../../pixels/bayer';
import { passSize, postStepsOf } from '../../render/shared/post_steps';
import { sample } from './raster';
import type { TPicture, TRgba } from './raster';
import type { ITexture } from '../../render/interface/i_texture';
import type { TPostEffect } from '../../post/types/t_post_effect';
import { uniformsAsNumbers } from '../../materials/uniform_numbers';
import type { TUniformNumbers } from '../../materials/types/t_uniforms';

/**
 * The engine's own effects, worked out without a graphics card, for a picture of a game run with no
 * browser.
 *
 * **Each one is a copy of its shader, step by step, and is only used while the shader is the one it
 * was copied from.** Every step is known by a fingerprint of its WGSL: an effect whose shader has
 * changed since is not recognised, and is left out and said, rather than drawn with sums that are no
 * longer its own. `tests/headless_effects.test.ts` fails as soon as that happens, so whoever changes
 * a shader is told to change its copy here too.
 *
 * Only the effects that make the look of a game in pixel art are copied: matching a palette and
 * grading with a table, dither, posterize, mosaic, colour adjustments, and the three a filter puts
 * round an object (outline, drop shadow, glow). The rest are left out and said.
 */

/**
 * What a step reads while it works out one pixel, as its shader's helpers read it.
 */
type TStepReads = {
    /** `mu`: the effect's uniforms, and the size of what it writes. */
    uniforms: TUniformNumbers;
    resolution: readonly [number, number];
    /** `sampleTexture`, `sampleTextureSmooth`: the step before, or the effect's input for the first. */
    texture: TPicture;
    /** `sampleInput`: the picture the effect was handed. */
    input: TPicture;
    /** The palette's colours or the table's texels, when the effect carries one. */
    data: TPicture | null;
    /** Uniforms that are lists, read once for the whole step rather than for every pixel. */
    vectors: Map<string, number[]>;
};

/**
 * One step of an effect: the colour it gives a pixel, from the colour there (`color`) and where it
 * is (`u`, `v`, from the top-left corner).
 */
type TStep = (color: TRgba, u: number, v: number, reads: TStepReads, out: TRgba) => void;

/**
 * A 32-bit FNV-1a of a shader's text: what a step is known by.
 */
const fingerprint = (text: string): number => {
    let hash = 0x811c9dc5;
    for (let i = 0; i < text.length; i++) {
        hash ^= text.charCodeAt(i);
        hash = Math.imul(hash, 0x01000193);
    }
    return hash >>> 0;
};

const scratch: TRgba = [0, 0, 0, 0];
const scratch2: TRgba = [0, 0, 0, 0];

/**
 * A uniform as the card is handed it: one the effect does not set is 0, the block being cleared before
 * each draw; a list shorter than the uniform leaves the rest 0 for the same reason, and a list with a
 * gap in it has no number there at all (NaN), as writing it into the card's numbers gives.
 */
const number = (uniforms: TUniformNumbers, name: string): number => {
    const value = uniforms[name];
    return value === undefined ? 0 : typeof value === 'number' ? value : Number.NaN;
};

const vector = (reads: TStepReads, name: string, size: number): number[] => {
    const known = reads.vectors.get(name);
    if (known !== undefined) {
        return known;
    }
    const value = reads.uniforms[name];
    const read: number[] = [];
    for (let i = 0; i < size; i++) {
        read.push(Array.isArray(value)
            ? (i >= value.length ? 0 : typeof value[i] === 'number' ? value[i] as number : Number.NaN)
            : typeof value === 'number' && i === 0 ? value : 0);
    }
    reads.vectors.set(name, read);
    return read;
};

/**
 * `max` and `min` as a card works them out when one side is no number: the other side, which is
 * what a broken uniform gives there, rather than no number at all.
 */
const most = (a: number, b: number): number => (Number.isNaN(a) ? b : Number.isNaN(b) ? a : Math.max(a, b));
const least = (a: number, b: number): number => (Number.isNaN(a) ? b : Number.isNaN(b) ? a : Math.min(a, b));

/** `bayer(at)`: the 4 by 4 pattern at a pixel, from -0.5 to just under 0.5. */
const bayer = (x: number, y: number): number => BAYER_4X4[((Math.trunc(y) & 3) * 4) + (Math.trunc(x) & 3)]! / 16 - 0.5;

const clamp01 = (value: number): number => (value < 0 ? 0 : value > 1 ? 1 : value);

/** `round()` as the shaders have it: a half goes to the even step. */
const roundEven = (value: number): number => {
    const down = Math.floor(value);
    const part = value - down;
    return part < 0.5 ? down : part > 0.5 ? down + 1 : down % 2 === 0 ? down : down + 1;
};

/** `floor(x + 0.5)`, which the shaders use instead of a rounding that sends halves to the even step. */
const halfUp = (value: number): number => Math.floor(value + 0.5);

const dither: TStep = (color, u, v, { uniforms, resolution }, out) => {
    const levels = most(2, roundEven(number(uniforms, 'levels')));
    const top = levels - 1;
    const shake = bayer(u * resolution[0], v * resolution[1]) * (1 / top) * number(uniforms, 'amount');
    for (let c = 0; c < 3; c++) {
        out[c] = halfUp(clamp01(color[c]! + 0.5 / 255 + shake) * top) / top;
    }
    out[3] = color[3];
};

const posterize: TStep = (color, _u, _v, { uniforms }, out) => {
    const top = most(2, roundEven(number(uniforms, 'levels'))) - 1;
    for (let c = 0; c < 3; c++) {
        out[c] = halfUp(clamp01(color[c]!) * top) / top;
    }
    out[3] = color[3];
};

const mosaic: TStep = (_color, u, v, { uniforms, resolution, texture }, out) => {
    const size = most(1, Math.floor(number(uniforms, 'size')));
    const x = Math.min((Math.floor((u * resolution[0]) / size) + 0.5) * size, resolution[0] - 0.5);
    const y = Math.min((Math.floor((v * resolution[1]) / size) + 0.5) * size, resolution[1] - 0.5);
    // The middle of a block lands exactly between two texels for an even size; the card reads it as
    // the texel it starts, which a division and a multiplication back can lose by a hair.
    sample(texture, (Math.floor(x) + 0.5) / resolution[0], (Math.floor(y) + 0.5) / resolution[1], false, out);
};

const paletteMatch: TStep = (color, u, v, { uniforms, resolution, data }, out) => {
    const count = data === null ? 0 : data.width;
    out[0] = color[0]; out[1] = color[1]; out[2] = color[2]; out[3] = color[3];
    if (data === null || count <= 1) {
        return;
    }
    // In the card's 32-bit numbers: a colour half way between two of the palette's is decided by
    // the last bit of its distances, and in 64 bits that bit can fall the other way.
    const f = Math.fround;
    const shake = f(f(bayer(u * resolution[0], v * resolution[1])) * f(number(uniforms, 'dither')));
    const r = f(f(color[0]) + shake), g = f(f(color[1]) + shake), b = f(f(color[2]) + shake);
    let nearest = 0;
    let nearestDistance = 1000;
    for (let i = 0; i < count; i++) {
        const dr = f(r - f(data.data[i * 4]! / 255));
        const dg = f(g - f(data.data[i * 4 + 1]! / 255));
        const db = f(b - f(data.data[i * 4 + 2]! / 255));
        const distance = f(f(f(dr * dr) + f(dg * dg)) + f(db * db));
        if (distance < nearestDistance) {
            nearestDistance = distance;
            nearest = i;
        }
    }
    out[0] = data.data[nearest * 4]! / 255;
    out[1] = data.data[nearest * 4 + 1]! / 255;
    out[2] = data.data[nearest * 4 + 2]! / 255;
};

/** `lutColor`: a colour looked up in a table of `size` slices side by side, mixed between its eight neighbours. */
const lutColor = (rgb: readonly [number, number, number], table: TPicture, out: TRgba): void => {
    const size = table.height;
    if (size < 2) {
        out[0] = rgb[0]; out[1] = rgb[1]; out[2] = rgb[2];
        return;
    }
    const last = size - 1;
    const ar = clamp01(rgb[0]) * last, ag = clamp01(rgb[1]) * last, ab = clamp01(rgb[2]) * last;
    const lr = Math.floor(ar), lg = Math.floor(ag), lb = Math.floor(ab);
    const hr = Math.min(lr + 1, last), hg = Math.min(lg + 1, last), hb = Math.min(lb + 1, last);
    const pr = ar - lr, pg = ag - lg, pb = ab - lb;
    const { data, width } = table;
    // `lutTexel`: slice `b` sits `b * size` across, `g` down.
    const at = (r: number, g: number, b: number): number => (g * width + b * size + r) * 4;
    const c000 = at(lr, lg, lb), c100 = at(hr, lg, lb), c010 = at(lr, hg, lb), c110 = at(hr, hg, lb);
    const c001 = at(lr, lg, hb), c101 = at(hr, lg, hb), c011 = at(lr, hg, hb), c111 = at(hr, hg, hb);
    for (let c = 0; c < 3; c++) {
        const near0 = data[c000 + c]! + (data[c100 + c]! - data[c000 + c]!) * pr;
        const near1 = data[c010 + c]! + (data[c110 + c]! - data[c010 + c]!) * pr;
        const far0 = data[c001 + c]! + (data[c101 + c]! - data[c001 + c]!) * pr;
        const far1 = data[c011 + c]! + (data[c111 + c]! - data[c011 + c]!) * pr;
        const near = near0 + (near1 - near0) * pg;
        const far = far0 + (far1 - far0) * pg;
        out[c] = (near + (far - near) * pb) / 255;
    }
};

const lutGrade: TStep = (color, _u, _v, { uniforms, data }, out) => {
    const amount = number(uniforms, 'amount');
    out[3] = color[3];
    if (data === null) {
        out[0] = color[0]; out[1] = color[1]; out[2] = color[2];
        return;
    }
    lutColor([clamp01(color[0]), clamp01(color[1]), clamp01(color[2])], data, scratch2);
    for (let c = 0; c < 3; c++) {
        out[c] = color[c]! + (scratch2[c]! - color[c]!) * amount;
    }
};

const colorAdjust: TStep = (color, _u, _v, reads, out) => {
    const { uniforms } = reads;
    const gamma = 1 / most(number(uniforms, 'gamma'), 0.0001);
    const contrast = number(uniforms, 'contrast');
    const brightness = number(uniforms, 'brightness');
    const saturation = number(uniforms, 'saturation');
    const tint = vector(reads, 'tint', 3);
    let r = Math.pow(Math.max(color[0], 0), gamma);
    let g = Math.pow(Math.max(color[1], 0), gamma);
    let b = Math.pow(Math.max(color[2], 0), gamma);
    const f = Math.fround;
    r = f(f(f(f(f(r) - 0.5) * f(contrast)) + 0.5) * f(brightness));
    g = f(f(f(f(f(g) - 0.5) * f(contrast)) + 0.5) * f(brightness));
    b = f(f(f(f(f(b) - 0.5) * f(contrast)) + 0.5) * f(brightness));
    const grey = r * 0.299 + g * 0.587 + b * 0.114;
    r = grey + (r - grey) * saturation;
    g = grey + (g - grey) * saturation;
    b = grey + (b - grey) * saturation;
    // A turn about the grey axis.
    const angle = (number(uniforms, 'hue') * Math.PI) / 180;
    const k = 0.57735027;
    const c = Math.cos(angle);
    const s = Math.sin(angle);
    const along = (k * r + k * g + k * b) * (1 - c);
    const cr = k * b - k * g, cg = k * r - k * b, cb = k * g - k * r;
    const tr = r * c + cr * s + k * along;
    const tg = g * c + cg * s + k * along;
    const tb = b * c + cb * s + k * along;
    out[0] = clamp01(tr * tint[0]!);
    out[1] = clamp01(tg * tint[1]!);
    out[2] = clamp01(tb * tint[2]!);
    out[3] = color[3];
};

const outline: TStep = (color, u, v, reads, out) => {
    // Over a pixel already opaque the line adds nothing, whatever is near: a screen, which is all
    // opaque, is handed back as it is without looking round every pixel of it. (Only a colour uniform
    // with no number in it would make the card write that pixel black instead.)
    if (color[3] >= 1) {
        out[0] = color[0]; out[1] = color[1]; out[2] = color[2]; out[3] = color[3];
        return;
    }
    const { uniforms, resolution, input } = reads;
    const reach = least(8, most(0, halfUp(number(uniforms, 'thickness'))));
    const tint = vector(reads, 'color', 3);
    let near = 0;
    for (let y = -8; y <= 8; y++) {
        for (let x = -8; x <= 8; x++) {
            if (Math.abs(x) > reach || Math.abs(y) > reach || x * x + y * y > reach * reach + reach) continue;
            near = Math.max(near, sample(input, u + x / resolution[0], v + y / resolution[1], false, scratch)[3]);
        }
    }
    const line = near * (1 - color[3]);
    out[0] = color[0] + tint[0]! * line;
    out[1] = color[1] + tint[1]! * line;
    out[2] = color[2] + tint[2]! * line;
    out[3] = color[3] + line;
};

const dropShadow: TStep = (_color, u, v, reads, out) => {
    const { uniforms, resolution, texture, input } = reads;
    const offset = vector(reads, 'offset', 2);
    const tint = vector(reads, 'color', 3);
    const sharp = sample(input, u, v, false, scratch2);
    const fallen = sample(texture, u - offset[0]! / resolution[0], v - offset[1]! / resolution[1], true, scratch)[3];
    const shade = clamp01(fallen * number(uniforms, 'amount')) * (1 - sharp[3]);
    out[0] = sharp[0] + tint[0]! * shade;
    out[1] = sharp[1] + tint[1]! * shade;
    out[2] = sharp[2] + tint[2]! * shade;
    out[3] = sharp[3] + shade;
};

const glow: TStep = (_color, u, v, reads, out) => {
    const { uniforms, texture, input } = reads;
    const tint = vector(reads, 'color', 3);
    const sharp = sample(input, u, v, false, scratch2);
    const light = clamp01(sample(texture, u, v, true, scratch)[3] * number(uniforms, 'intensity')) * (1 - sharp[3]);
    out[0] = sharp[0] + tint[0]! * light;
    out[1] = sharp[1] + tint[1]! * light;
    out[2] = sharp[2] + tint[2]! * light;
    out[3] = sharp[3] + light;
};

/** Where a blur reads, and how much each read counts, as `gaussPass` has them. */
const GAUSS_TAPS: ReadonlyArray<readonly [number, number]> = [[0, 0.2270270], [1.3846154, 0.3162162], [-1.3846154, 0.3162162], [3.2307692, 0.0702703], [-3.2307692, 0.0702703]];

/** One way of a blur in five reads, as `gaussPass` writes it, at `scale` and by the uniform `uniform`. */
const gauss = (axis: 'x' | 'y', scale: number, uniform: string): TStep => (_color, u, v, { uniforms, resolution, texture }, out) => {
    const spread = (scale * most(number(uniforms, uniform), 0)) / 3.2307692;
    const du = axis === 'x' ? spread / resolution[0] : 0;
    const dv = axis === 'y' ? spread / resolution[1] : 0;
    out[0] = 0; out[1] = 0; out[2] = 0; out[3] = 0;
    for (const [at, weight] of GAUSS_TAPS) {
        sample(texture, u + du * at, v + dv * at, true, scratch);
        out[0] += scratch[0] * weight;
        out[1] += scratch[1] * weight;
        out[2] += scratch[2] * weight;
        out[3] += scratch[3] * weight;
    }
};

/**
 * Every step copied, by the fingerprint of the WGSL it was copied from. A step is matched only by
 * its own text, so the same blur at another size is another entry.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const CPU_STEPS: ReadonlyMap<number, { name: string; step: TStep }> = new Map([
    [0x075e379a, { name: 'dither', step: dither }],
    [0x00c9b74b, { name: 'posterize', step: posterize }],
    [0x3e9a9b09, { name: 'mosaic', step: mosaic }],
    [0x8115d4fa, { name: 'paletteMatch', step: paletteMatch }],
    [0xa394b21a, { name: 'lutGrade', step: lutGrade }],
    [0xeef03879, { name: 'colorAdjust', step: colorAdjust }],
    [0x5685a104, { name: 'outline', step: outline }],
    [0xcd59a147, { name: 'dropShadow', step: dropShadow }],
    [0xdc162203, { name: 'glow', step: glow }],
    [0x87d344cb, { name: 'gauss x 1', step: gauss('x', 1, 'radius') }],
    [0x1234ac05, { name: 'gauss y 1', step: gauss('y', 1, 'radius') }],
    [0xb6e30aab, { name: 'gauss x 0.5', step: gauss('x', 0.5, 'radius') }],
    [0xa962c7e5, { name: 'gauss y 0.5', step: gauss('y', 0.5, 'radius') }],
]);

/**
 * The fingerprint a step is known by.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const stepFingerprint = (fragment: string | null): number | null => (fragment === null ? null : fingerprint(fragment));

const toByte = (value: number): number => (!(value > 0) ? 0 : value >= 1 ? 255 : Math.round(value * 255));

/**
 * Runs a chain of effects over `picture` as the card runs it, writing the result back into it:
 * each step reads the one before at its own size and writes a picture of eight bits a channel, and
 * a filter's chain keeps what it writes multiplied by its alpha. An effect it has no copy of, or
 * whose shader has changed since it was copied, is passed over and named in `notDrawn`.
 *
 * @param pictures Where the palette and the table pictures are, by the handle the card was given.
 * @param filter Whether it is a filter's chain, which keeps its colour within its alpha.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const paintEffects = (
    chain: readonly TPostEffect[],
    picture: TPicture,
    pictures: WeakMap<ITexture, TPicture>,
    filter: boolean,
    notDrawn: Set<string>,
): void => {
    const width = picture.width;
    const height = picture.height;
    let source: TPicture = { width, height, data: picture.data.slice() };
    for (const effect of chain) {
        const steps = postStepsOf(effect);
        const known = steps.map((one) => CPU_STEPS.get(stepFingerprint(one.fragment) ?? -1));
        if (known.some((one) => one === undefined)) {
            notDrawn.add(`the effect ${effect.name ?? 'written in code'}`);
            continue;
        }
        const input = source;
        const handle = effect.palette?.gpu ?? effect.lut?.gpu ?? null;
        const data = handle === null ? null : pictures.get(handle) ?? null;
        steps.forEach((one, j) => {
            const own = j === steps.length - 1;
            const [w, h] = own ? [width, height] : passSize(one.scale!, width, height);
            const out: TPicture = { width: w, height: h, data: new Uint8Array(w * h * 4) };
            const reads: TStepReads = { uniforms: uniformsAsNumbers(effect.uniforms, effect.uniformSig), resolution: [w, h], texture: source, input, data, vectors: new Map() };
            const color: TRgba = [0, 0, 0, 0];
            const shown: TRgba = [0, 0, 0, 0];
            for (let y = 0; y < h; y++) {
                for (let x = 0; x < w; x++) {
                    const u = (x + 0.5) / w;
                    const v = (y + 0.5) / h;
                    sample(source, u, v, false, color);
                    known[j]!.step(color, u, v, reads, shown);
                    if (filter) {
                        const alpha = clamp01(shown[3]);
                        shown[0] = Math.min(shown[0], alpha);
                        shown[1] = Math.min(shown[1], alpha);
                        shown[2] = Math.min(shown[2], alpha);
                        shown[3] = alpha;
                    }
                    const at = (y * w + x) * 4;
                    out.data[at] = toByte(shown[0]);
                    out.data[at + 1] = toByte(shown[1]);
                    out.data[at + 2] = toByte(shown[2]);
                    out.data[at + 3] = toByte(shown[3]);
                }
            }
            source = out;
        });
    }
    picture.data.set(source.data);
};
