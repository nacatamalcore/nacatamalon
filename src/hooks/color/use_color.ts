import { getColor } from '../../color';
import type { TColor, TColorInput } from '../../color';

/**
 * Converts any color format to a normalized `TColor` object.
 * Accepts hex numbers (`0xff0000`), hex strings (`"#ff0000"`, `"#f00"`),
 * and any valid CSS color string (`"skyblue"`, `"rgb(255,0,0)"`, `"hsl(0,100%,50%)"`).
 * @returns `{ r, g, b, a }` normalized to 0-1.
 * @param input - A colour: a hex number, a hex string, or any CSS colour.
 *
 * @category Color & palettes
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const useColor = (input: TColorInput): TColor => getColor(input);
