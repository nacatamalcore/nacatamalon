import { getColor } from '../../color';
import type { TColor } from '../../color';

/**
 * Colours already read from how they were written, so a `'#ff6b1a'` in a list is not read again
 * every frame, and ones that are no colour, so they are not tried again either. Emptied when it grows
 * past what any scene would write.
 */
const read = new Map<string | number, TColor | null>();
const READ_MOST = 4096;

/**
 * A shape's colour as the engine keeps it, from any way `getColor` reads (`'#ff6b1a'`, `'tomato'`,
 * `0xff6b1a`, `{ r, g, b, a }`), or `null` for what is no colour at all (`'gren'`, nothing, `true`).
 * Never throws: a typo in a list the game changes while it runs must not stop the frame.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const shapeColor = (option: unknown): TColor | null => {
    if (typeof option === 'object' && option !== null) {
        const { r, g, b, a } = option as Partial<TColor>;
        return typeof r === 'number' && typeof g === 'number' && typeof b === 'number' && typeof a === 'number'
            ? option as TColor
            : null;
    }
    if (typeof option !== 'string' && typeof option !== 'number') {
        return null;
    }
    let color = read.get(option);
    if (color === undefined) {
        if (read.size >= READ_MOST) {
            read.clear();
        }
        try {
            color = getColor(option);
        } catch {
            color = null;
        }
        read.set(option, color);
    }
    return color;
};

/**
 * How a colour that is none is named in a warning: what was written when it is text or a number,
 * and only what kind of thing it is otherwise, since an object handed by mistake (a sprite) may not
 * be one that can be written out.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const describeColor = (option: unknown): string =>
    typeof option === 'string' ? `'${option}'`
    : typeof option === 'number' || typeof option === 'boolean' || typeof option === 'bigint' ? String(option)
    : option === null ? 'null'
    : option === undefined ? 'nothing'
    : Array.isArray(option) ? 'a list'
    : typeof option === 'object' ? 'an object without r, g, b and a'
    : typeof option;
