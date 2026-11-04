import type { ITexture } from '../i_texture';

/**
 * What a filter leaves in its place in a pass: the things it filters, already drawn into a picture
 * and run through its effects, laid over what is there.
 *
 * `picture` is the size of `width` by `height`, and covers that rectangle of what is being drawn on,
 * in its real pixels with `x` and `y` its top-left corner, so a backend reads it pixel for pixel. It
 * holds its colour multiplied by its own alpha, as drawing over a clear picture leaves it.
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
};
