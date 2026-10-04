import type { TTexture } from '../../loaders';

/**
 * One image holding many pictures in a grid, and the arithmetic to point at any of them.
 *
 * A grid rather than a list of rectangles, because that is what a sprite sheet is and because it
 * needs no pixel sizes: the frames are fractions of the image, so an atlas works from the moment
 * it is described, before the image has even arrived.
 *
 * Frames are numbered from 0, left to right and then top to bottom, the order a sheet is drawn in.
 *
 * @category Assets & loading
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TSpriteAtlas = {
    /**
     * The image itself. Every frame is a window into it.
     */
    texture: TTexture;
    /**
     * How many frames across.
     */
    columns: number;
    /**
     * How many frames down.
     */
    rows: number;
    /**
     * How many there are in total, which is what a frame number has to stay under.
     */
    frames: number;
    /**
     * The window of every frame, for a sheet that is not an even grid of the whole image: one read
     * from a file with margins, gaps, a cell size that does not divide the image, or rectangles of
     * its own. Left out, the grid above is the whole answer.
     */
    rects?: readonly TAtlasFrame[];
};

/**
 * The window into the image one frame occupies, in 0-1: what `atlasFrame` works out and what a
 * sprite ends up carrying.
 *
 * @category Sprites
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TAtlasFrame = {
    uvOffset: { x: number; y: number };
    uvScale: { x: number; y: number };
};
