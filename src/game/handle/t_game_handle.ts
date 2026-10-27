import type { TColor, TColorOption } from '../../color';
import type { TRendererBackend } from '../../render/interface';
import type { TAsset } from '../../loaders/types/t_asset';

/**
 * What a game can do with itself while it runs: the settings that belong to the whole game rather
 * than to any one scene.
 *
 * Everything here is live. Read it in a frame, change it from a menu, and the next frame is drawn
 * with the answer.
 *
 * @category Game
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TGameHandle = {
    /**
     * How many pixels wide the game is, which is what a scene should measure against. In the
     * game's own pixels: a `pixelRatio` draws each of them with more real ones and does not
     * change this.
     */
    getWidth(): number;
    /**
     * How many pixels tall the game is. See {@link TGameHandle.getWidth}.
     */
    getHeight(): number;

    /**
     * The colour behind everything.
     */
    getBackground(): TColor;
    /**
     * Paints the background from now on: a room change, a hit flash, a menu dimming the world.
     */
    setBackground(color: TColorOption): void;

    /**
     * Whether images are blended by default, rather than kept crisp.
     */
    isSmooth(): boolean;
    /**
     * Changes how images are read from now on, for everything that did not choose for itself.
     * `false` is the retro answer: a scaled-up pixel stays a square.
     */
    setSmooth(smooth: boolean): void;

    /**
     * Whether a right click over the game opens the browser's menu. `false` unless the game said
     * `contextMenu: true`.
     */
    hasContextMenu(): boolean;
    /**
     * Lets the browser's menu open over the game on a right click (`true`), or keeps the right
     * button for the game (`false`), from now on.
     */
    setContextMenu(open: boolean): void;

    /**
     * How fast the game runs: `1` is normal, `0.5` slow motion, `2` double speed.
     */
    getTimeScale(): number;
    /**
     * Sets the speed of the world. It scales what the game sees, so a pause menu animating at the
     * same time is not affected by it.
     */
    setTimeScale(scale: number): void;

    /**
     * Freezes the whole game: nothing moves, everything keeps being drawn, so a pause menu has
     * something to sit on top of.
     *
     * Three unrelated things may want it frozen at once (the player, the browser losing focus, a
     * host), so each says who it is and the game runs again only when the last one lets go. A
     * second `pause('menu')` does not stack.
     *
     * @param reason Who is asking. Leave it out and it is the game itself.
     */
    pause(reason?: string): void;
    /**
     * Lets go of one hold. Anything else still holding keeps the game frozen.
     */
    resume(reason?: string): void;
    /**
     * Whether anything at all is holding the game frozen.
     */
    isPaused(): boolean;

    /**
     * Which card API is drawing: `'WEBGPU'`, or `'WEBGL2'` when the browser has no WebGPU (or the
     * game asked for it). Fixed for the life of the game.
     */
    getBackend(): TRendererBackend;
    /**
     * Frames drawn per second, averaged over the last second or so so that it reads steadily on a
     * panel instead of flickering with every frame.
     *
     * It measures the machine, not the game: a pause or a slow `timeScale` does not change it,
     * because the frames are still being drawn.
     */
    getFps(): number;
    /**
     * How many scenes are running, the paused ones included (they are still drawn).
     */
    getSceneCount(): number;
    /**
     * How many things are drawn by those scenes (sprites, texts, models...), visible or not.
     */
    getDrawableCount(): number;

    /**
     * Puts the game on the whole screen, scaled by `fullscreenScaling` (whole multiples by
     * default), with bars in the game's background colour. Esc, or `exitFullscreen`, puts it back.
     *
     * **Call it from a click or a key press.** The browser only grants full screen in answer to
     * something the player did, so a call from a timer or at start-up is refused. Calling it from
     * `usePointer().onDown`, `onClick` or a `justPressed` check works.
     *
     * It answers `false` instead of throwing when full screen is not to be had: refused, inside a
     * frame that does not allow it, or on an iPhone, where Safari lets only a video go full screen.
     * The game carries on as it was, so a full-screen button can simply be hidden when it says no.
     *
     * @returns Whether the game is now full screen.
     */
    enterFullscreen(): Promise<boolean>;
    /**
     * Leaves full screen and puts the game back as it was in the page.
     */
    exitFullscreen(): Promise<void>;
    /**
     * Whether the game is full screen right now. It turns `false` by itself when the player leaves
     * with Esc, so a menu reading it every frame is never out of date.
     */
    isFullscreen(): boolean;

    /**
     * Lets go of something the game loaded: off the graphics card, off the sound card and out of the
     * game, with what is its own (a model's pictures and shapes, an atlas's or a font's picture).
     * Nothing is let go on its own, so a game that loads everything up front, or goes back to a scene
     * it left, keeps it all; this is for a level with files of its own, when it is left for good.
     *
     * Given the asset (what its `useLoad…` handed back), that one goes. Given a key, everything kept
     * under it goes, whatever it is: the picture called `'hero'` and the sound called `'hero'`.
     *
     * It ends `'released'`. Whatever still shows it is not drawn from then on, and the call says how
     * many; a load still on its way is thrown away when it arrives. Asked for again with the same key,
     * it loads afresh, like the first time.
     *
     * @example
     * ```ts
     * const game = useGame();
     * const forest = useLoadTexture({ src: '/levels/forest.png', key: 'forest' });
     * useCleanup(() => {
     *     game.releaseAsset(forest);
     * });
     * ```
     *
     * @param asset The asset, or the key it was loaded under (its `src` when no key was given).
     * @returns Whether there was anything to let go of. Releasing it twice is not a mistake.
     * @throws When it belongs to something in the game rather than to the game: a picture made with
     * `createSpriteTexture` or `createPixelTexture`, a shape made with `createGeometry`. Those go with
     * whatever made them. Nothing is let go then, not even the other assets under the same key.
     */
    releaseAsset(asset: TAsset | string): boolean;
};
