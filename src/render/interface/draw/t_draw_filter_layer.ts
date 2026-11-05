import type { ITexture } from '../i_texture';

/**
 * What a filter leaves in its place in a pass: the things it filters, already drawn into a picture
 * and run through its effects, laid over what is there.
 *
 * `picture` is the size of `width` by `height`, and covers that rectangle of what is being drawn on,
 * in its real pixels with `x` and `y` its top-left corner, so a backend reads it pixel for pixel. It
 * holds its colour multiplied by its own alpha, as drawing over a clear picture leaves it.
 *
 * With `depth`, what the filter holds has depth of its own (a model, a line in 3D), kept by the pass
 * that drew it (`TRenderPass.filter.depth`), and the layer is laid with it: a model in front hides
 * it pixel by pixel, and it hides what is behind it. Without, it is laid over what is there whole.
 *
 * @category Render
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TDrawFilterLayer = {
    readonly type: 'filter-layer';
    readonly picture: ITexture;
    readonly x: number;
    readonly y: number;
    readonly width: number;
    readonly height: number;
    readonly depth?: true;
};
