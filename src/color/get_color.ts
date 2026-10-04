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
 * Alias for {@link useColor}, identical in behaviour.
 *
 * Used to prevent React hook error
 * @param input - A colour: a hex number, a hex string, or any CSS colour.
 * @returns The colour, with each channel from `0` to `1`.
 *
 * @category Color & palettes
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const getColor = (input: TColorInput): TColor =>
    typeof input === 'number'  ? fromHex(input)
    : input.startsWith('#')    ? fromHexString(input)
    : fromCss(input);
