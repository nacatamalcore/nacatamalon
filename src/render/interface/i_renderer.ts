import type { TFrameContext } from './t_frame_context';
import type { TRendererCapabilities } from './t_renderer_capabilities';
import type { ITexture } from './i_texture';
import type { IBuffer, TBufferUsage } from './i_buffer';
import type { TCaptureResult } from './t_capture_result';

/**
 * The contract both backends implement, and the line nothing above `render/` may cross.
 *
 * The `I` is deliberate where everything else in this engine is `T`: it marks the one type
 * with more than one implementation. A `T` describes data; this describes a thing that can be
 * swapped.
 *
 * @category Render
 * @since 1.0.0
 */
export type IRenderer = {
    /**
     * What this backend can honour. Fixed at boot.
     */
    readonly capabilities: TRendererCapabilities;
    /**
     * Draws one frame. Called once per tick, by the loop, with nothing else in between.
     */
    frame(ctx: TFrameContext): void;
    /**
     * Uploads a decoded image and returns a handle to it. Synchronous: the image is already in
     * memory, and the upload happens when it loads, never in the middle of a frame. The handle only
     * means something to the renderer that made it.
     *
     * The image passes to the renderer: whoever hands it over must not close it. A backend that
     * only needs the upload closes it straight away; one that can lose its textures (WebGL2, when
     * the browser takes the context) keeps it to upload it again.
     */
    createTexture(image: ImageBitmap): ITexture;
    /**
     * Changes how textures are read from now on, for everything that has not chosen for itself.
     *
     * The game's `smooth` is a live setting, not a boot argument: it is what the editor toggles
     * and what a game with an accessibility or "crisp pixels" option would change mid-play. A
     * sprite that set its own `smooth` keeps it, since the one it chose is not a default.
     */
    setSmooth(smooth: boolean): void;
    /**
     * Uploads numbers and hands back a handle to them: the corners of something, which corners make
     * each triangle, or a handful of values a whole draw shares.
     *
     * Synchronous, like `createTexture`: what is being uploaded is already in memory.
     */
    createBuffer(data: Float32Array | Uint16Array | Uint32Array, usage: TBufferUsage): IBuffer;
    /**
     * Writes over what a buffer holds, from the beginning.
     *
     * Its own method and not a second `createBuffer` because some things are **rewritten** rather
     * than uploaded once: a map's layer builds its corners again when a tile changes or a torch
     * flickers, and asking for new memory every time a brick breaks would churn the graphics card
     * for nothing. What is written has to fit: whoever owns the buffer keeps count and asks for a
     * bigger one when it stops fitting.
     */
    updateBuffer(buffer: IBuffer, data: Float32Array | Uint16Array): void;
    /**
     * Lets a buffer go. Anything still pointing at it is pointing at nothing.
     */
    destroyBuffer(buffer: IBuffer): void;
    /**
     * Uploads raw `RGBA8` bytes, `width * height * 4` of them, row by row from the top-left corner,
     * and hands back a texture no different from a loaded one.
     *
     * It exists because some pictures are **worked out rather than decoded**: a palette is a list of
     * colours somebody typed, and turning it into a PNG in memory just to decode it again would be
     * silly. Throws when the bytes do not match the size, because reading past them would show
     * colours that look plausible and are wrong.
     */
    createDataTexture(data: Uint8Array, width: number, height: number): ITexture;
    /**
     * Makes an empty picture that a pass can draw **into** (`TRenderPass.renderTarget`) and that
     * anything else can then show like any other image: a mirror, a security camera, a screen inside
     * the game, and the step every full-screen effect is built on.
     */
    createRenderTexture(width: number, height: number): ITexture;
    /**
     * Brings a picture's pixels back from the graphics card.
     *
     * A thing done **to** a result rather than something a frame does, which is why it lives here
     * and not in the frame: a picture drawn into does not expire the way the screen does, so this
     * can run whenever.
     *
     * The texture has to be one `createRenderTexture` made. Reading one nothing has drawn into gives
     * back whatever it was cleared to, not an error.
     */
    readTexture(texture: ITexture): Promise<TCaptureResult>;
    /**
     * Lets a texture go, with whatever the backend made to draw into it. Anything still pointing at
     * it is pointing at nothing, so whoever holds it forgets it first: a game-side texture sets its
     * `gpu` to `null`, which every draw already reads as "not ready" and shows nothing for.
     *
     * The other half of every `create*Texture`, and the one a picture made again and again needs: a
     * capture per request, a screen inside the game per restart. Without it each one stays on the
     * graphics card for as long as the game runs.
     */
    destroyTexture(texture: ITexture): void;
    /**
     * Releases the device and anything held on it. After this the renderer is unusable.
     */
    destroy(): void;
    /**
     * Settles if the browser takes the graphics card away for good (a driver reset, a GPU process
     * crash): with the error to show, after which the renderer draws nothing and no longer touches the
     * card, so the game goes on without errors piling up every frame. With `null` when the loss was
     * this renderer's own `destroy()`.
     *
     * Optional because only a backend that cannot recover by itself has it: WebGL2 gets its context
     * back and rebuilds everything, so the game never hears of it, and leaves this out.
     */
    readonly deviceLost?: Promise<Error | null>;
};
