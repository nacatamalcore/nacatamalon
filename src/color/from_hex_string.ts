import type { TColor } from './color';

const invalidHex = (value: string): Error => new Error(`[NacatamalOn] Invalid hex color string: "${value}"`);

/**
 * Every character has to be a hex digit, and that is checked *before* any channel is parsed
 * rather than by testing each `parseInt` result for `NaN`. `parseInt` stops at the first
 * character it cannot read and returns what it got so far, so `parseInt('1z', 16)` is `1`, not
 * `NaN`: a per-channel NaN check would let `#1z2345` through as a slightly-wrong red instead of
 * rejecting it. Only a channel that is garbage from its very first character (`'zz'`) ever
 * produces `NaN`, so the NaN check alone would close two thirds of the hole.
 */
const HEX_DIGITS = /^[0-9a-fA-F]+$/;

/**
 * Parses a hex string (`#rgb`, `#rrggbb`, `#rrggbbaa`).
 *
 * Throws on anything else. The length was validated here from the start; the characters were
 * not, so `#xyz` came back as `{ r: NaN, g: NaN, b: NaN, a: 1 }`: a value that survives every
 * later stage (sprite tint, game background, uniform packing) and only surfaces as a black or
 * missing pixel once it has been written into a GPU buffer. Same failure mode `buildMaterial`
 * closed for an absent `shininess` in `deserialize_scene`.
 *
 * @category Color & palettes
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const fromHexString = (value: string): TColor => {
    const hex = value.replace('#', '');

    if (!HEX_DIGITS.test(hex)) {
        throw invalidHex(value);
    }

    if (hex.length === 3) {
        const r = parseInt(hex[0] + hex[0], 16) / 255;
        const g = parseInt(hex[1] + hex[1], 16) / 255;
        const b = parseInt(hex[2] + hex[2], 16) / 255;
        return { r, g, b, a: 1 }
    }

    if (hex.length === 6) {
        return {
            r: parseInt(hex.slice(0, 2), 16) / 255,
            g: parseInt(hex.slice(2, 4), 16) / 255,
            b: parseInt(hex.slice(4, 6), 16) / 255,
            a: 1,
        }
    }

    if (hex.length === 8) {
        return {
            r: parseInt(hex.slice(0, 2), 16) / 255,
            g: parseInt(hex.slice(2, 4), 16) / 255,
            b: parseInt(hex.slice(4, 6), 16) / 255,
            a: parseInt(hex.slice(6, 8), 16) / 255,
        }
    }

    throw invalidHex(value);
}
