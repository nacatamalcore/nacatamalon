import type { TBox } from '../../box/types/t_box';
import type { TPixelRegion, TPixels } from '../../pixels';
import type { TSprite } from '../../gameobjects/sprite/types/t_sprite';
import type { TText } from '../../gameobjects/text/types/t_text';
import type { TNineSlice } from '../../gameobjects/nine_slice/types/t_nine_slice';

/**
 * Something named in a photo's options: a box, what it draws (a sprite, a text or a panel, as
 * `createSprite` gave it), or a box's name, which stands for every box of the running scenes called
 * that (`'Hud'`), the way a behaviour finds the others.
 *
 * @category Capture
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TPhotoBoxRef = TBox | TSprite | TText | TNineSlice | string;

/**
 * What a photo is of (`useCapture`). Nothing at all is the screen as the player sees it.
 *
 * @category Capture
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TPhotoOptions = {
    /**
     * The part of the screen it is of: a rectangle in the game's pixels (`{ x, y, width, height }`
     * from the screen's top-left corner), or a box, the part of the screen it covers. A box is
     * measured as `collisionBetween` measures it, by its hitboxes or else by what it draws, and is measured
     * hidden too: a viewfinder can be a box that is never shown. Default: the whole screen.
     */
    region?: TPixelRegion | TPhotoBoxRef;
    /**
     * Boxes left out of the photo, with everything in them: the HUD, the touch pad, the viewfinder's
     * frame.
     */
    hide?: readonly TPhotoBoxRef[];
    /**
     * The only boxes in the photo, with everything in them, on a transparent background unless
     * `background` says otherwise: a picture of one thing alone, for an album or a sticker.
     */
    only?: readonly TPhotoBoxRef[];
    /**
     * How big the photo comes out, in pixels. Made smaller or bigger by whole pixels, never smoothed,
     * as pixel art is. Left out, the region's own size; one of the two given, the other keeps its
     * shape.
     */
    width?: number;
    height?: number;
    /**
     * Whether the screen effects (a CRT, a palette, a dither) are in it, as the player sees them.
     * Default `true`; `false` for the scene as it is drawn, under them.
     */
    effects?: boolean;
    /**
     * What is behind everything. Default the game's background, or transparent with `only`.
     */
    background?: { r: number; g: number; b: number; a: number };
};

/**
 * Something that came out in a photo: how much of it, and where. For telling what a player took a
 * picture of: the bird is in it, most of it, in the middle.
 *
 * Each sprite, text and panel shown is one, measured by its rectangle turned as it is drawn; a box with
 * hitboxes is one, measured by them (what it is to be hit is what it is to be photographed). Something
 * covered by another is still in the photo by this measure, and a model in depth is not listed.
 *
 * @category Capture
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TPhotoBox = {
    /** The box it is, or is in. */
    box: TBox;
    /** What it draws that came out: the sprite, text or panel (as `createSprite` gave it). */
    picture: TSprite | TText | TNineSlice;
    /** Its box's name. */
    name: string;
    /**
     * How much of it is inside the photo, from `0` to `1`: `1` all of it, `0.5` half.
     */
    seen: number;
    /**
     * The middle of what of it is inside, in the photo's own pixels.
     */
    x: number;
    y: number;
};

/**
 * A photo: its pixels, which show (`createPixelTexture`) or save (`encodePng`) as any picture
 * painted in code, and what came out in it, most seen first.
 *
 * @category Capture
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TPhoto = TPixels & { readonly boxes: readonly TPhotoBox[] };

/**
 * Takes a photo (from `useCapture`).
 *
 * @category Capture
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TCapture = (options?: TPhotoOptions) => Promise<TPhoto>;
