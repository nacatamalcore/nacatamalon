import type { TColor } from './color';

/**
 * Converts HSL values to a `TColor`.
 *
 * Useful for animated effects that cycle hue over time (rainbow cascades, palette
 * shifts, hit-flashes): it runs as pure arithmetic, so it is safe to call inside
 * `useUpdate` every frame without performance concerns. Prefer it to
 * `fromCss('hsl(...)')` per frame: that one parses a string first, which is work
 * this does not do.
 *
 * @param h - Hue in degrees [0, 360).
 * @param s - Saturation in [0, 1]. Defaults to `1` (fully saturated).
 * @param l - Lightness in [0, 1]. Defaults to `0.5` (mid tone).
 * @param a - Alpha in [0, 1]. Defaults to `1` (fully opaque).
 *
 * @example
 * ```ts
 * declare const sprite: TSprite;
 *
 * // Rainbow hue cycle in useUpdate:
 * let time = 0;
 * useUpdate((delta) => {
 *     time += delta;
 *     sprite.tint = fromHsl((time * 60) % 360);
 * });
 * ```
 * @returns The colour, with each channel from `0` to `1`.
 *
 * @category Color & palettes
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const fromHsl = (h: number, s = 1, l = 0.5, a = 1): TColor => {
    const k = (n: number) => (n + h / 30) % 12;
    const chroma = s * Math.min(l, 1 - l);
    const channel = (n: number) =>
        l - chroma * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
    return { r: channel(0), g: channel(8), b: channel(4), a };
};
