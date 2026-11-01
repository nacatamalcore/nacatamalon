/**
 * A read of a picture that lands on the seam between two of its texels, moved just past it, and
 * every other read left exactly where it was.
 *
 * Each card works out the read at a pixel by its own rounding: a sprite drawn much smaller than its
 * picture (a minimap's), or a particle on whole pixels showing a frame of a sheet, can have a read
 * land on a seam, which came out 2.0 on one card and 1.9999 on the other, and each took the texel
 * on its own side of it, the same frame a row of the picture apart. Within `SEAM` of a seam, in the
 * picture's own 0-1 terms, the read is put `SEAM` past it, so both take the texel after it. That is
 * a few times the rounding either card makes, and far less than the gap between two reads at any
 * size a picture is drawn, so an ordinary read, a picture blown up 256 times included, is never
 * touched, and a smooth one moves by nothing anyone could see.
 *
 * The same text for both cards, in each one's language.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const OFF_THE_SEAM_WGSL = /* wgsl */ `
const SEAM = 4e-6;
fn offTheSeam(read: vec2f, texels: vec2f) -> vec2f {
    let seam = floor(read * texels + 0.5) / texels;
    return select(read, seam + SEAM, abs(read - seam) < vec2f(SEAM));
}
`;

/**
 * `OFF_THE_SEAM_WGSL` for WebGL2.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const OFF_THE_SEAM_GLSL = /* glsl */ `
const float SEAM = 4e-6;
vec2 offTheSeam(vec2 read, vec2 texels) {
    vec2 seam = floor(read * texels + 0.5) / texels;
    return mix(read, seam + SEAM, lessThan(abs(read - seam), vec2(SEAM)));
}
`;
