import { getColor } from '../color/get_color';
import type { TColor } from '../color/color';
import type { TUniformNumbers, TUniformSignature, TUniformType, TUniformValue, TUniformValues } from './types/t_uniforms';

/**
 * How many numbers each kind of uniform has.
 */
const COUNT: Record<TUniformType, number> = { 'f32': 1, 'vec2<f32>': 2, 'vec3<f32>': 3, 'vec4<f32>': 4 };

/**
 * Colours given as text, already read: a uniform set to `'#ffcc00'` every frame reads it once. Kept
 * small, since a game names few colours; past that it starts again.
 */
const readColors = new Map<string, TColor>();
const READ_COLORS_KEPT = 256;

/**
 * Text that is not a colour, said once each: a uniform set to it is left as it was rather than
 * stopping the frame it is drawn in.
 */
const notColors = new Set<string>();

/**
 * The colour `value` says, or `null` when it is text that is not one.
 */
const colorOf = (value: string | TColor): TColor | null => {
    if (typeof value !== 'string') {
        return value;
    }
    let color = readColors.get(value);
    if (color === undefined) {
        try {
            color = getColor(value);
        } catch {
            return null;
        }
        if (readColors.size >= READ_COLORS_KEPT) readColors.clear();
        readColors.set(value, color);
    }
    return color;
};

// A colour is looked for first, everywhere, so an object that has both is read the same way when it
// is measured and when it is written.
const isColor = (value: object): value is TColor => 'r' in value && 'g' in value && 'b' in value;
const isPoint = (value: object): value is { x: number; y: number; z?: number; w?: number } => 'x' in value && 'y' in value;

/**
 * How many numbers `value` gives the card when nothing says how many it should: a number one, a list
 * its length, a point two to four by the ones it has, a colour four. `undefined` when it is none of
 * them.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const uniformLength = (value: unknown): number | undefined => {
    if (typeof value === 'number') return 1;
    if (Array.isArray(value)) return value.length;
    // Text is a colour only if it reads as one: anything else is refused where it was given.
    if (typeof value === 'string') return colorOf(value) === null ? undefined : 4;
    if (typeof value === 'object' && value !== null) {
        if (isColor(value)) return 4;
        if (isPoint(value)) return value.w !== undefined ? 4 : value.z !== undefined ? 3 : 2;
    }
    return undefined;
};

/**
 * Writes `value` at `offset`, as `count` numbers, whatever form it was given in. Writes nothing new
 * for a point or a colour: this runs for every uniform of every draw.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const writeUniform = (out: Float32Array | number[], offset: number, count: number, value: TUniformValue): void => {
    if (typeof value === 'number') {
        out[offset] = value;
        return;
    }
    if (Array.isArray(value) || ArrayBuffer.isView(value)) {
        // As many as the uniform has, and no more: the next one starts right after it.
        const list = value as ArrayLike<number>;
        const length = Math.min(list.length, count);
        for (let i = 0; i < length; i++) out[offset + i] = list[i]!;
        return;
    }
    if (typeof value === 'string' || (typeof value === 'object' && value !== null && isColor(value))) {
        const color = colorOf(value as string | TColor);
        if (color === null) {
            if (!notColors.has(value as string)) {
                notColors.add(value as string);
                console.warn(`[NacatamalOn] uniforms: '${String(value)}' is not a colour, so the uniform given it keeps what it had. A uniform takes a number, a list, a point ({ x, y }) or a colour ('#ffcc00').`);
            }
            return;
        }
        out[offset] = color.r;
        if (count > 1) out[offset + 1] = color.g;
        if (count > 2) out[offset + 2] = color.b;
        if (count > 3) out[offset + 3] = color.a ?? 1;
        return;
    }
    if (typeof value === 'object' && value !== null && isPoint(value)) {
        out[offset] = value.x;
        if (count > 1) out[offset + 1] = value.y;
        if (count > 2) out[offset + 2] = value.z ?? 0;
        if (count > 3) out[offset + 3] = value.w ?? 0;
    }
};

/**
 * `value` as the card reads it, a number or a list of `count` (or as many as it has), for a file or
 * anything else that keeps the card's own form.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const uniformNumbers = (value: TUniformValue, count = uniformLength(value) ?? 1): number | number[] => {
    if (typeof value === 'number') {
        return value;
    }
    if (Array.isArray(value)) {
        return [...value];
    }
    // Plain numbers, not the card's 32-bit ones, so a point is kept exactly as it was given.
    const numbers = new Array<number>(count).fill(0);
    writeUniform(numbers, 0, count, value);
    // One number is a number, as a file keeps it: a list of one is not read back.
    return count === 1 ? numbers[0]! : numbers;
};

/**
 * Every uniform of `values` in the card's own form, each as many numbers as `sig` says it has (or
 * as it has itself when `sig` does not name it).
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const uniformsAsNumbers = (values: TUniformValues, sig: TUniformSignature | null = null): TUniformNumbers => {
    const out: TUniformNumbers = {};
    for (const [name, value] of Object.entries(values)) {
        const type = sig?.[name];
        out[name] = uniformNumbers(value, type === undefined ? undefined : COUNT[type]);
    }
    return out;
};
