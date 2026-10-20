import type { TColor } from './color';
import type { TCssNamedColor } from './css_named_colors';
import { fromHex } from './from_hex';
import { fromHexString } from './from_hex_string';
import { fromCss } from './from_css';

/**
 * Accepted input formats for `useColor`/`getColor`.
 *
 * `TCssNamedColor | (string & {})` is a TS trick: it gives editor autocomplete for
 * the named CSS colors while still accepting any other string (hex, `rgb()`,
 * `hsl()`, ...) without a type error: `string & {}` stops TS from widening the
 * union to plain `string`, which would otherwise discard the literal suggestions.
 *
 * @category Color & palettes
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TColorInput = number | TCssNamedColor | (string & {});

/**
 * Any colour an option takes: what `getColor` reads (`'#ff6b1a'`, `0xff6b1a`, `'tomato'`, `'rgb(…)'`)
 * or a `TColor` already made. What it becomes is always a `TColor`, which is what is read back.
 *
 * @category Color & palettes
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TColorOption = TColorInput | TColor;

/**
 * A colour as the engine keeps it, `{ r, g, b, a }` from `0` to `1`, from a hex number, a hex string,
 * any CSS colour, or a `TColor`, which is handed back as it is (the same object, not a copy).
 *
 * Every option that takes a colour reads it through here, so `tint: '#ff6b1a'` and
 * `tint: getColor('#ff6b1a')` are the same thing.
 * @param input - A colour: a hex number, a hex string, any CSS colour, or a `TColor`.
 * @returns The colour, with each channel from `0` to `1`.
 *
 * @category Color & palettes
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const getColor = (input: TColorOption): TColor =>
    typeof input === 'object'  ? input
    : typeof input === 'number' ? fromHex(input)
    : input.startsWith('#')    ? fromHexString(input)
    : fromCss(input);
