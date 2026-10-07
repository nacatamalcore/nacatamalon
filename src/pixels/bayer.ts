/**
 * The ordered 4×4 pattern behind every dither in the engine, as numbers from `0` to `15`, row by row.
 *
 * Kept here as data and not only inside a shader, so that a gradient painted in code and the
 * `dither()` screen effect lay their dots out in exactly the same places.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const BAYER_4X4: readonly number[] = [
    0, 8, 2, 10,
    12, 4, 14, 6,
    3, 11, 1, 9,
    15, 7, 13, 5,
];

/**
 * The pattern at a pixel, centred on zero: from `-0.5` to just under `0.5`.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const bayerAt = (x: number, y: number): number => BAYER_4X4[(y & 3) * 4 + (x & 3)]! / 16 - 0.5;
