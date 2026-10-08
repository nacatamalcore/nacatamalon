/**
 * Straight alpha, which is what the loader decodes (`premultiplyAlpha: 'none'`): a transparent part
 * of a picture shows what was drawn behind it, and an opaque one covers it.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const ALPHA_BLEND: GPUBlendState = {
    color: { srcFactor: 'src-alpha', dstFactor: 'one-minus-src-alpha', operation: 'add' },
    alpha: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha', operation: 'add' },
};

/**
 * Adding light, which is the only way fire, sparks and halos read as bright: two of them over each
 * other should be brighter than one, and under alpha the second is merely nearer.
 *
 * The **alpha channel is left alone** (`zero / one`) rather than added like the colour. Adding it
 * too would drive the opacity of the picture being drawn into past one, and a screen-wide effect
 * reading that picture afterwards would find it half transparent. With post-processing already in
 * the engine, that is not a hypothetical.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const ADDITIVE_BLEND: GPUBlendState = {
    color: { srcFactor: 'src-alpha', dstFactor: 'one', operation: 'add' },
    alpha: { srcFactor: 'zero', dstFactor: 'one', operation: 'add' },
};
