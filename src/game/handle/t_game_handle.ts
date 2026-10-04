import type { TColor } from '../../color';
import type { TRendererBackend } from '../../render/interface';

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
    setBackground(color: TColor): void;

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
};
