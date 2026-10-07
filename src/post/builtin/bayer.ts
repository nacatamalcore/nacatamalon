import { BAYER_4X4 } from '../../pixels/bayer';

// The table written out as shader numbers, four to a row, from the one copy a painted gradient reads
// too: the dots a screen effect lays down and the ones `fillGradient` does land in the same places.
const TABLE = [0, 4, 8, 12]
    .map((row) => '        ' + BAYER_4X4.slice(row, row + 4).map((value) => value.toFixed(1)).join(', '))
    .join(',\n');

/**
 * The ordered 4x4 threshold both the ditherer and the palette matcher use, in both languages.
 *
 * It comes back **centred on zero**, from -0.5 to just under 0.5, so a caller adds it rather than
 * having to subtract a half first. That matters because of the rule that makes dithering look right:
 * **the amplitude has to equal exactly one quantisation step.** Smaller and the bands survive under
 * a layer of noise; larger and pixels dither between colours that are not neighbours, which reads as
 * dirt rather than as shading.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const BAYER_WGSL = /* wgsl */ `
fn bayer(at: vec2<f32>) -> f32 {
    // A 'var' and not a 'let': WGSL only allows a worked-out index into a variable.
    var table = array<f32, 16>(
${TABLE});
    let x = i32(at.x) & 3;
    let y = i32(at.y) & 3;
    return table[y * 4 + x] / 16.0 - 0.5;
}
`;

/**
 * The same table in GLSL, where it can be a file-level constant because GLSL has no such rule.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const BAYER_GLSL = /* glsl */ `
float bayer(vec2 at) {
    float table[16] = float[16](
${TABLE});
    int x = int(at.x) & 3;
    int y = int(at.y) & 3;
    return table[y * 4 + x] / 16.0 - 0.5;
}
`;
