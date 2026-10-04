/**
 * Squeezes a matrix's depth from one card's range into the other's.
 *
 * One card puts what is in front at 0 and the far plane at 1; this one puts them at -1 and 1. The
 * engine builds one matrix for both, so the difference is absorbed here, on the numbers, rather
 * than in the shader: a shader that differs is a shader that drifts.
 *
 * It is the third row of the matrix, doubled and shifted, done in place on the copy the frame is
 * about to send.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const toGlClip = (uniforms: Float32Array): void => {
    // Only the combined matrix, which is the one the card reads to place a corner. The world one
    // and the turning one are read by the shading, which has no notion of a depth range.
    uniforms[2] = uniforms[2] * 2 - uniforms[3];
    uniforms[6] = uniforms[6] * 2 - uniforms[7];
    uniforms[10] = uniforms[10] * 2 - uniforms[11];
    uniforms[14] = uniforms[14] * 2 - uniforms[15];
};
