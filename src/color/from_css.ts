import type { TColor } from './color';
import type { TCssNamedColor } from './css_named_colors';
import { CSS_NAMED_COLORS } from './css_named_color_values';
import { fromHex } from './from_hex';
import { fromHexString } from './from_hex_string';
import { fromHsl } from './from_hsl';

/**
 * Reads the numbers out of `rgb(1, 2, 3 / 4)`, `hsl(1 2% 3%)` and every spelling in between:
 * commas or spaces, with or without a slash before the alpha, and any mix of the two.
 */
const args = (value: string, open: number): string[] =>
    value.slice(open + 1, value.lastIndexOf(')')).split(/[\s,/]+/).filter((part) => part.length > 0);

/**
 * Keeps a channel inside 0 to 1, the way CSS clamps `rgb(300, 0, 0)` to red rather than
 * refusing it.
 */
const clamp = (value: number): number => (value < 0 ? 0 : value > 1 ? 1 : value);

/**
 * One `rgb()` channel: `200` or `78%`, both landing in 0 to 1.
 */
const channel = (part: string): number => {
    const number = Number.parseFloat(part);
    return clamp(part.endsWith('%') ? number / 100 : number / 255);
};

/**
 * Alpha, which is written as a fraction (`0.5`) or a percentage (`50%`), never as 0 to 255.
 */
const alpha = (part: string | undefined): number => {
    if (part === undefined) {
        return 1;
    }
    const number = Number.parseFloat(part);
    return clamp(part.endsWith('%') ? number / 100 : number);
};

const invalid = (value: string): never => {
    throw new Error(`[NacatamalOn] Invalid CSS color string: "${value}"`);
};

/**
 * Turns a CSS color string into a `TColor`, reading it here rather than asking a browser.
 *
 * Accepts named colors (`'skyblue'`), hex (`'#f00'`), `rgb()`/`rgba()` and `hsl()`/`hsla()`, in
 * both CSS spellings (commas or spaces, percentages, `/ alpha`), clamps out-of-range channels the
 * way CSS does, and throws on anything it does not understand: a misspelled name that quietly came back black is
 * worse to chase than an error, because a wrong-but-plausible color looks deliberate all the way
 * to the screen.
 *
 * It used to hand the string to a canvas and read the pixel back, which meant a color could only
 * be resolved where a `document` exists. That ruled out tests, tools and anything running outside
 * a page, and made the engine's own default white depend on the DOM. The names now come from a
 * table measured from that same parser, so the answers did not change, only where they come from.
 *
 * @category Color & palettes
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const fromCss = (value: string): TColor => {
    const text = value.trim().toLowerCase();

    if (text.startsWith('#')) {
        return fromHexString(text);
    }

    if (text === 'transparent') {
        return { r: 0, g: 0, b: 0, a: 0 };
    }

    const named = CSS_NAMED_COLORS[text as TCssNamedColor];
    if (named !== undefined) {
        return fromHex(named);
    }

    const open = text.indexOf('(');
    if (open === -1 || !text.endsWith(')')) {
        return invalid(value);
    }

    const parts = args(text, open);
    const name = text.slice(0, open);

    if (name === 'rgb' || name === 'rgba') {
        if (parts.length < 3 || parts.length > 4) {
            return invalid(value);
        }
        const color = {
            r: channel(parts[0]),
            g: channel(parts[1]),
            b: channel(parts[2]),
            a: alpha(parts[3]),
        };
        return Number.isNaN(color.r + color.g + color.b + color.a) ? invalid(value) : color;
    }

    if (name === 'hsl' || name === 'hsla') {
        if (parts.length < 3 || parts.length > 4) {
            return invalid(value);
        }
        const hue = Number.parseFloat(parts[0]);
        const saturation = clamp(Number.parseFloat(parts[1]) / 100);
        const lightness = clamp(Number.parseFloat(parts[2]) / 100);
        if (Number.isNaN(hue + saturation + lightness)) {
            return invalid(value);
        }
        return fromHsl(((hue % 360) + 360) % 360, saturation, lightness, alpha(parts[3]));
    }

    return invalid(value);
};
