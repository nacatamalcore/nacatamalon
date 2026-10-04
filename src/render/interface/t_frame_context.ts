import type { TColor } from '../../color';
import type { TDrawItem } from './draw/t_draw_item';
import type { TDrawCamera2d } from './draw/t_draw_camera_2d';
import type { TDrawView3d } from './draw/t_draw_view_3d';
import type { ITexture } from './i_texture';
import type { TPostEffect } from '../../post/types/t_post_effect';

/**
 * One draw of the world into one target.
 *
 * Render features are added by extending this, never by adding parameters to `frame()`.
 *
 * @category Render
 * @since 1.0.0
 */
export type TRenderPass = {
    clearColor?: TColor;
    /**
     * Where this pass draws. Omitted, it draws on the screen.
     *
     * A picture made by `createRenderTexture`, which anything can then show like any other image.
     * It is the other half of that method: a picture nothing can draw into would always come back
     * the colour it was cleared to.
     */
    renderTarget?: ITexture;
    /**
     * Another canvas to draw on instead of the game's own: a second view of the same frame, such as
     * an editor's preview of what a camera sees. Drawn at that canvas's own size. Ignored when
     * `renderTarget` is given.
     */
    targetCanvas?: HTMLCanvasElement;
    /**
     * Whether this is the pass a person is looking at, and so the one the chain of screen-wide
     * effects runs over.
     *
     * A flag, rather than something a backend works out from there being no `renderTarget`: a frame
     * can draw several times and only one of those is the picture. A capture wants the effects, a
     * sprite being drawn into a texture for a screen inside the world does not, and neither of those
     * can be told from the other by looking at where they draw.
     */
    postProcess?: boolean;
    /**
     * What to draw in this pass, in order. The game's records, passed by reference, never copied.
     */
    drawables?: readonly TDrawItem[];
    /**
     * The 2D cameras this pass draws through. `cameraIndex` says which one each drawable uses.
     */
    cameras?: readonly TDrawCamera2d[];
    /**
     * One entry per drawable, in the same order: the index into `cameras` it is drawn through, or
     * `-1` for straight screen pixels. Per drawable and not per scene because a scene can mix both
     * (a HUD pinned over a scrolling world), and `zIndex` can interleave them.
     */
    cameraIndex?: readonly number[];
    /**
     * How each scene's models are seen and lit. `viewIndex` says which one a model belongs to.
     *
     * One per scene rather than one for the pass, because scenes stack: a lamp lit for a menu must
     * not light the level it was opened over.
     */
    views3d?: readonly TDrawView3d[];
    /**
     * One entry per drawable, in the same order: the index into `views3d` it belongs to. `-1` for
     * anything that is not a model, which is most of the list.
     */
    viewIndex?: readonly number[];
};

/**
 * Everything the renderer needs for one frame, and the **only** object that crosses the
 * boundary into a backend.
 *
 * `passes` is an array because a frame can draw more than once: split screen, a capture to a
 * texture, an editor preview.
 *
 * @category Render
 * @since 1.0.0
 */
export type TFrameContext = {
    passes: TRenderPass[];
    /**
     * Seconds since the game started. Shaders that animate read it from here.
     */
    time: number;
    /**
     * How far through a scene change is, 0 to 1, or 0 when there is no change in progress.
     *
     * It counts **up twice**, once while the screen is being covered and once while it is being
     * uncovered, with `phase` saying which of the two it is in. Counting back down for the second
     * half would be the same arithmetic and the wrong picture: a wipe would come back the way it
     * left, in mirror image, instead of carrying on across the screen.
     */
    progress: number;
    /**
     * Which half of a scene change is running: `0` while the screen is being covered, `1` while it
     * is being uncovered. `0` when there is no change, which is also what a covered screen reads,
     * and that is fine: with `progress` at 0 nothing is covered either way.
     *
     * A number and not a word because this is what reaches a shader, and a shader cannot compare
     * strings.
     */
    phase: number;
    /**
     * The full-screen effects to run over the finished picture, in order.
     *
     * **Left out entirely when there are none, and that is the contract that matters here.** With no
     * effects the backend draws exactly as it did before this field existed: straight at the canvas,
     * no picture in between, nothing extra submitted. Every game that has no effects, which is most
     * of them, must not pay a single copy of the screen for the ones that do.
     *
     * So this is `undefined` and never an empty list, because an empty list is a branch somebody can
     * enter by accident.
     */
    post?: readonly TPostEffect[];
    /**
     * How many real pixels each game pixel is drawn with on the game's own canvas (`pixelRatio`
     * in `createGame`). Left out, or `1`, draws exactly as before it existed.
     *
     * It applies to the screen's pass only, the one with neither a `renderTarget` nor a
     * `targetCanvas`: a picture drawn into a texture or another canvas is its own size. The
     * backend sizes the depth, the samples and the effects' pictures from the real buffer, and
     * places everything (cameras, sprites, maps, the `resolution` a material reads) from the
     * buffer divided by this, which is the game's size.
     */
    pixelRatio?: number;
};
