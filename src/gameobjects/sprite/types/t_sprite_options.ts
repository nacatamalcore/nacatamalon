import type { T2dOptions } from '../../types/t_2d_options';
import type { TTexture } from "../../../loaders";
import type { TSpriteAtlas } from "../../../atlas";

/**
 * What `createSprite` is asked for: a picture (`texture`, `key` or `atlas`), its size, where it
 * goes and how it looks. All of it is optional.
 *
 * @category Sprites
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TSpriteOptions = T2dOptions & {

    /**
     * Omitted, it is drawn as wide as what it shows of its texture, and the sprite's `width` stays
     * `undefined`.
     */
    width?: number;
    /**
     * Omitted, it is drawn as tall as what it shows of its texture, and the sprite's `height` stays
     * `undefined`.
     */
    height?: number;
    /**
     * A texture from `useLoadTexture`. Wins over `key`.
     */
    texture?: TTexture;
    /**
     * The key a texture was loaded under, for a sprite built where the record is not at hand.
     */
    key?: string;
    /**
     * A sheet from `createSpriteAtlas`. It supplies the image and, with `frame`, which part of it
     * to show. Anything given explicitly (`texture`, `uvOffset`, `uvScale`) wins over it.
     */
    atlas?: TSpriteAtlas;
    /**
     * Which frame of `atlas` to show, numbered from 0. Ignored without an atlas. Default `0`.
     */
    frame?: number;
    /**
     * Shows only part of the texture: where the window starts, in 0-1 across the image. Comes
     * with `uvScale`, and both together are how one image holds many frames.
     */
    uvOffset?: { x: number; y: number };
    /**
     * How big that window is, in 0-1: `{ x: 0.5, y: 1 }` is half the width, full height.
     */
    uvScale?: { x: number; y: number };
    /**
     * Shows the picture mirrored left to right, which is how one drawing covers a character facing
     * either way. It mirrors what is shown and not where it is: the sprite stays exactly where it
     * was, and so does the place it can be touched. A text or a panel, made of pieces, is mirrored as
     * a whole with `transform: { scaleX: -1 }` instead.
     */
    flipX?: boolean;
    /**
     * The same top to bottom.
     */
    flipY?: boolean;
    /**
     * Repeats its picture across its size instead of stretching it: a wall of bricks, a strip of
     * grass, clouds. Set `width` and `height` to the size to cover; the picture (or its frame, from an
     * atlas) is laid as many times as fits. Omitted is stretched.
     */
    repeat?: boolean;
    /**
     * With `repeat`, where the pattern starts inside the sprite, in its picture's pixels: moving it
     * every frame scrolls the pattern while the sprite stays put. `{ x: 0, y: 0 }` by default.
     */
    repeatOffset?: { x: number; y: number };
};

