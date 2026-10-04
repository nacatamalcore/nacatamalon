/**
 * A glTF colour number is stored in linear light; this engine draws in screen colours (the space a
 * CSS colour and a PNG are already in), so a number taken as it comes lands far too dark. The curve is
 * the usual `1.055 * c^(1/2.4) - 0.055`, rearranged so that white comes out exactly 1.
 *
 * Shared by a surface's colours and the colours painted on its corners, which the format stores the
 * same way: two copies of the curve would be two chances to drift.
 *
 * @internal
 */
export const toScreen = (c: number): number => c <= 0.0031308 ? c * 12.92 : 1 + 1.055 * (c ** (1 / 2.4) - 1);
