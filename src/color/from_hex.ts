import type { TColor } from './color';

/**
 * Parses a hex number (e.g. `0xff0000` or `0xff0000ff` with alpha).
 *
 * @category Color & palettes
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const fromHex = (value: number): TColor => {
    const hasAlpha = value > 0xffffff;
    if (hasAlpha) {
        return {
            r: ((value >>> 24) & 0xff) / 255,
            g: ((value >>> 16) & 0xff) / 255,
            b: ((value >>> 8)  & 0xff) / 255,
            a:  (value         & 0xff) / 255,
        }
    }
    return {
        r: ((value >> 16) & 0xff) / 255,
        g: ((value >> 8)  & 0xff) / 255,
        b:  (value        & 0xff) / 255,
        a: 1,
    }
}
