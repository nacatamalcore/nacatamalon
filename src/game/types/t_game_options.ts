import type { TPostChain } from '../../post/types/t_post_chain';
import type { TCanvasScaling } from '../../DOM/types/t_canvas_scaling';
import type { TCanvasKeep } from '../../DOM/types/t_canvas_keep';
import type { TColor } from "../../color";
import type { TRendererType } from '../../render';
import type { TActionMap, TActionPersist } from '../../input';

/**
 * How a game's window is set up, for `createGame`: its resolution, the colour behind everything,
 * how it scales to the page and which renderer draws it. Only `width` and `height` are required.
 *
 * @category Game
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TGameOptions = {
    /**
     * The game's resolution: how many pixels it *draws*, not how big it looks. `320 × 224`
     * stays 320 × 224 however large the canvas ends up on screen: `scaling` changes the
     * size it is painted at, and `keep` is the only thing that changes these numbers.
     *
     * A camera measures in these units, so this is what decides how much of a level fits.
     */
    width: number;
    /**
     * See {@link TGameOptions.width}: the two are one decision.
     */
    height: number;
    /**
     * Colour the frame is cleared to before anything draws. Defaults to `darkviolet`,
     * deliberately loud: a scene that renders nothing should be obvious, not black.
     *
     * Read live from the store every frame, so changing it at runtime takes effect on the
     * next one.
     */
    background?: TColor;
    /**
     * Which backend draws.
     *
     * - `'AUTO'` (default): tries WebGPU and falls back to WebGL2 if it fails to start.
     * - `'WEBGPU'`: WebGPU or nothing. Throws instead of falling back.
     * - `'WEBGL2'`: WebGL2 or nothing, same rule.
     *
     * Naming one is for testing that backend: a silent fallback would hide the very thing
     * being tested. What actually won is `capabilities.backend`.
     */
    renderer?: TRendererType;
    /**
     * Initial seed for this game's random generator (`useRandom`). Absent means a different
     * run every time; set it to make a run reproducible: same seed, same sequence.
     */
    seed?: number;
    /**
     * Default texture filtering for sprites. `false` (default) renders them pixelated
     * (nearest) for crisp pixel art; `true` renders them smooth (linear).
     */
    smooth?: boolean;
    /**
     * MSAA (multisample anti-aliasing) sample count. `1` (default) disables it: the
     * raw, aliased look that suits a PS1/N64 aesthetic. `4` enables 4× MSAA, smoothing
     * jagged geometry silhouettes (e.g. a 3D model's edges). Only `1` and `4` are
     * guaranteed across devices. It smooths edges only, not texture shimmer.
     */
    msaa?: 1 | 4;
    /**
     * How big the game's image is painted. **Writes CSS only**: the game keeps drawing
     * `width × height` pixels and only their size on screen changes.
     *
     * - `'none'` (default): 1×, exactly `width × height` CSS pixels.
     * - `'integer'`: the largest whole multiple that fits. The pixel-art one, because nothing is
     *   resampled, at the cost of bars when the fit is not exact.
     * - `'contain'`: the largest fit with fractions allowed. Fills more, resamples.
     * - `'fill'`: stretched to the container, aspect ratio broken. Ignores `keep`.
     *
     * See {@link TCanvasScaling}.
     */
    scaling?: TCanvasScaling;
    /**
     * Which sides of the resolution stay fixed. **This one writes the buffer**: anything
     * but `'both'` makes the game see more or less world instead of leaving bars.
     *
     * - `'both'` (default): always `width × height`. What makes a game look the same on
     *   every screen; the leftover space becomes letterbox or pillarbox bars.
     * - `'height'`: height pinned and width follows the container, so a wide screen sees more to
     *   the sides.
     * - `'width'`: width pinned and height follows, so a tall screen sees more above and below.
     * - `'none'`: nothing pinned, so there is no reference to scale from. Stays at 1× and
     *   the buffer becomes the container's size.
     *
     * See {@link TCanvasKeep}.
     */
    keep?: TCanvasKeep;
    /**
     * How many real pixels each game pixel is drawn with. `1` (default) draws exactly
     * `width × height`; `2` draws four times as many pixels in the same space; `'device'`
     * follows the screen's `devicePixelRatio` (2 on most phones and Retina displays, 3 on some)
     * and keeps following it if the window moves to another monitor.
     *
     * **Only the drawing gets sharper.** `width` and `height` are still the game's size: a
     * camera, a position, the pointer and `getWidth()` all keep measuring in them, so nothing in
     * the game changes. What it buys is edges: a 1080 × 720 game on a Retina screen stops being
     * upscaled by the browser, and 3D silhouettes, far textures and thin geometry come out clean.
     *
     * **Leave it at `1` for pixel art.** A sprite that is not rotated or scaled looks exactly the
     * same (each texel just becomes a bigger block of real pixels), so it gains nothing; a
     * rotated or scaled one loses the stepped edges of the era and looks like a modern game. And
     * it is not free: the cost of every pass grows with the square of the number, four times the
     * pixels at `2` and nine at `3`, which is what `'device'` asks of many phones.
     *
     * Screen effects keep the game's pixel: the `resolution` a full-screen effect reads is
     * `width × height`, so a dither or a palette pattern stays the size of a game pixel instead of
     * getting finer.
     */
    pixelRatio?: number | 'device';
    /**
     * How the game's image is painted while it is full screen (`enterFullscreen` on the game
     * handle). Same values as `scaling`, and only used while full screen lasts: leaving puts
     * `scaling` back.
     *
     * `'integer'` (default) is the pixel-art answer, whole multiples with bars round the edge in the
     * game's background colour. `'contain'` fills more of the monitor and resamples to do it.
     *
     * It is separate from `scaling` because the two places want different things: a game sitting in
     * the middle of a page at 1× wants the whole monitor once the player asks for it.
     */
    fullscreenScaling?: TCanvasScaling;
    /**
     * Freeze the loop while nobody can see the page, and unfreeze on the way back. `true` by
     * default.
     *
     * It exists because `requestAnimationFrame` stops in a hidden tab anyway: without this,
     * the first frame back gets a delta of however long the player was away, and everything
     * moving teleports. Pausing makes that gap explicit instead of letting it reach the game.
     *
     * The page being hidden pauses the game the way a pause menu does, with the reason
     * `'browser'`, so `gamePaused` and `gameResumed` are heard for it. Coming back releases only
     * that hold, so a game paused from a menu stays paused; it resumes one frame after the page is
     * seen again, so the frame that measured the time away is not run. `false` leaves the game to
     * the browser, which stops sending frames to a hidden tab anyway.
     */
    pauseOnBlur?: boolean;
    /**
     * Print the startup line in the console: the engine, its version and which backend started.
     * `true` by default.
     *
     * On by default because the backend is the first question asked of any drawing bug, and the
     * line answers it in one screenshot. A shipped game that wants a clean console turns it off.
     */
    banner?: boolean;
    /**
     * Open with "Made with NacatamalOn": the N grows in, the name slides in beside it, and the game
     * starts. Off unless asked for.
     *
     * - `true` shows it in the published game and skips it while you develop: on `localhost` (and
     *   `127.0.0.1`, `::1`, `.local` names) and in a browser driven by automation (Playwright,
     *   Puppeteer, Selenium), so neither a reload nor a test ever waits for it.
     * - `'always'` shows it there too, to see it while working on the game.
     * - `false`, or leaving it out, never shows it.
     *
     * It costs the game no time. The first scene is built and loads its files while the splash
     * plays, and the splash fades into it once those have arrived, so on a game with a lot to
     * load it is the loading screen. It lasts under two seconds, and a key or a click ends it. It
     * never shows when a tool drives the game (`editorHandleOf`).
     */
    splash?: boolean | 'always';
    /**
     * The game's **input map**: named actions (`'jump'`, `'move_left'`) and the keys, gamepad
     * buttons and stick directions each one listens to, read with `useActions`.
     *
     * The same list a `project.json` carries, which is where it comes from once there is an editor.
     */
    actions?: TActionMap;
    /**
     * Where the player's own rebindings are kept, so they are still there next time. Left out, the
     * controls are whatever the game says every run.
     */
    actionsPersist?: TActionPersist;
    /**
     * The full-screen effects this game is shown through, in order.
     *
     * A game setting rather than a scene's, because "this looks like a Mega Drive" is a fact about
     * the game and not about whichever room happens to be open: a scene that had to declare the
     * palette again would be a scene that can forget to.
     *
     * Nothing is waited for. The effects go in at once and each starts working the moment its own
     * file lands, so a slow palette costs you the palette and never the first seconds of the game.
     */
    post?: TPostChain;
};
