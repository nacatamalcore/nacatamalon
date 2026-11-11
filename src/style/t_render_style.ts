import type { TPostChain } from '../post/types/t_post_chain';

/**
 * A way of drawing a whole scene: how its models' materials are drawn when they do not say, the
 * full-screen effects it is seen through, and the resolution and filtering of the screen it is drawn
 * on. `RENDER.STYLES` has the engine's own (from `nes` to `cgi`); a game makes its own the same way,
 * as plain data, or one of them changed: `{ ...RENDER.STYLES.n64, width: 640, height: 480 }`.
 *
 * Given to the game (`createGame({ style })`) it is every scene's, and what the game's own options say
 * wins over it: `createGame({ style: RENDER.STYLES.n64, width: 640, height: 480 })` is the N64 at
 * 640 x 480. Given to a scene (`useRenderStyle`) it is that scene's, in place of the game's, and its
 * resolution and filtering are laid over the game's while it is on, whatever the game said: a 1280 x
 * 720 game whose level asks for `RENDER.STYLES.cgi` draws that level at 640 x 480. To keep the game's,
 * give the style without them: `{ ...RENDER.STYLES.cgi, width: undefined, height: undefined }`.
 * Leaving the scene puts the game's back. A material that says
 * otherwise keeps what it says: `perPixel: false` on one is drawn at its corners in a scene that draws
 * the rest at every pixel.
 *
 * @category Render
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TRenderStyle = {
    /**
     * The light worked out at every pixel, for each material that does not say (see the material's
     * `perPixel`).
     */
    perPixel?: boolean;
    /**
     * The picture stretched across the screen without correcting for depth, for each material that
     * does not say (see the material's `affine`).
     */
    affine?: boolean;
    /**
     * The corners put on a coarse grid of the screen, for each material that does not say (see the
     * material's `vertexSnap`).
     */
    vertexSnap?: boolean | number;
    /**
     * The full-screen effects the scene is seen through while the style is on, after its own and the
     * game's: entries as `createGame({ post })` takes them, `{ builtin: 'bloom', uniforms: { ... } }`.
     */
    post?: TPostChain;
    /**
     * The resolution the game is drawn at while the style is on, as `createGame({ width })`, with
     * `height`: the two are one decision, and one without the other is no resolution. Left out, the
     * game's. A scene that asks for its style with `useRenderStyle` is built at it already, so its HUD
     * placed by `useGame().getWidth()` is where it should be; one built behind a transition's cover
     * is built at the size before, and gets its own at the swap, so its HUD is placed again on
     * `onResized` as well. With `scaling` `'none'`, the default, the canvas is shown at the new size.
     */
    width?: number;
    /**
     * The resolution's height, as `createGame({ height })`. Left out, the game's.
     */
    height?: number;
    /**
     * Pictures read smoothly between their pixels, as `createGame({ smooth })`: the textures of every
     * material that does not say, and the screen as it is scaled up unless `smoothScaling` says. Left
     * out, the game's.
     */
    smooth?: boolean;
    /**
     * The screen scaled up to the page smoothly, as `createGame({ smoothScaling })`, apart from the
     * pictures: `RENDER.STYLES.n64` reads its textures smoothly and keeps its screen's pixels square.
     * Left out, it goes with `smooth`.
     */
    smoothScaling?: boolean;
    /**
     * The shape of the screen's pixels, as `createGame({ pixelAspect })`: `8 / 7` for the NES and the
     * SNES, a little wider than tall. Left out, the game's.
     */
    pixelAspect?: number;
};

/**
 * What `useRenderStyle` gives back: the scene's style, and a way to change it while the game runs.
 *
 * @category Render
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TRenderStyleHandle = {
    /**
     * The scene's style now, or `null` when it takes the game's.
     */
    readonly style: TRenderStyle | null;
    /**
     * Gives the scene another style, or `null` for the game's. Its materials change on the next
     * frame, and its effects are taken off and the new ones put on.
     */
    set(style: TRenderStyle | null): void;
};
