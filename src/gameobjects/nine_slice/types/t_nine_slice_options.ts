import type { T2dOptions } from '../../types/t_2d_options';
import type { TTexture } from '../../../loaders';
import type { TSpriteAtlas } from '../../../atlas';
import type { TNineSliceBorders, TNineSliceMode } from './t_nine_slice';

/**
 * What `createNineSlice` is asked for: a picture, how wide its borders are, and the size to draw it at.
 *
 * @category Game objects
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TNineSliceOptions = T2dOptions & {
    /**
     * A texture from `useLoadTexture`. Wins over `key` and `atlas`.
     */
    texture?: TTexture;
    /**
     * The key a texture was loaded under.
     */
    key?: string;
    /**
     * A sheet from `createSpriteAtlas`, with `frame` saying which part of it is the picture.
     */
    atlas?: TSpriteAtlas;
    /**
     * Which frame of `atlas`, numbered from 0. Default `0`.
     */
    frame?: number;
    /**
     * Where the picture starts inside the texture, in 0-1, for a picture that is not a whole frame.
     */
    uvOffset?: { x: number; y: number };
    /**
     * How big the picture is inside the texture, in 0-1.
     */
    uvScale?: { x: number; y: number };
    /**
     * How wide each border is, in pixels of the picture: one number for all four, or each one. The
     * borders are the part that is never stretched, so they are usually the size of the corners as
     * drawn.
     */
    slice: number | TNineSliceBorders;
    /**
     * How the edges and the middle fill their space: `'stretch'` (the default), `'tile'` or
     * `'tile-fit'`, the same both ways or `{ x, y }` one per direction.
     */
    mode?: TNineSliceMode | { x: TNineSliceMode; y: TNineSliceMode };
    /**
     * How wide to draw it, in pixels. Required: drawn at the size of its picture it would cut nothing,
     * and a sprite already does that.
     */
    width: number;
    /**
     * How tall to draw it, in pixels.
     */
    height: number;
};
