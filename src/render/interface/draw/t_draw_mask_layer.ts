import type { ITexture } from '../i_texture';

/**
 * What a soft mask leaves in its place in a pass: the things it masks, already drawn into a picture
 * of their own, laid over what is there as much as the mask's own picture lets them through.
 *
 * Both pictures are the size of what is being drawn on, pixel for pixel, so a backend reads each at
 * the pixel it is drawing and needs no placement. `content` holds its colour multiplied by its own
 * alpha, which is what drawing over a clear picture leaves; `shape` is the mask drawn as it looks.
 * How much each pixel lets through is `shape` read in `channel` (its alpha, or how light it is),
 * turned round when `invert`.
 *
 * @category Render
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TDrawMaskLayer = {
    readonly type: 'mask-layer';
    readonly content: ITexture;
    readonly shape: ITexture;
    readonly channel: 'alpha' | 'luminance';
    readonly invert: boolean;
};
