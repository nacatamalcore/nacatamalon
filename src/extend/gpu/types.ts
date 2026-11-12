import type { TTexture } from '../../loaders';

/**
 * A picture the pass draws into, of a size fixed when the pass is made: RGBA, 8 bits a channel.
 * Another size is another pass: destroy this one and make a new one.
 *
 * @category Render
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TGpuPassOutput = { readonly width: number; readonly height: number };

/**
 * What a pass is told each frame. It runs once a frame however many cameras, minimaps or captures
 * are drawn, never once per view.
 *
 * The same object is handed over every frame: a pass that wants to keep a value copies it.
 *
 * @category Render
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TGpuPassFrame = {
    /**
     * Seconds of game time the scene has run, what `useUpdate` hands out. It stops while the scene
     * or the game is paused.
     */
    readonly time: number;
    /**
     * Seconds of game time this frame moved the game by: `0` while the scene or the game is paused,
     * and in a frame that ran no fixed step. A scene held behind a transition does not run its
     * passes at all.
     */
    readonly delta: number;
    /**
     * The size of the screen in real pixels, not the size of a camera's view.
     */
    readonly width: number;
    readonly height: number;
};

/**
 * What a WebGPU pass is given when it is made. The device and the pictures belong to the engine:
 * the pass uses them and never destroys them.
 *
 * Each picture in `outputs` is `rgba8unorm` with one sample, and can be read in a shader, written
 * from compute (`texture_storage_2d`), drawn into and copied.
 *
 * A plugin that names it needs the WebGPU types: TypeScript 6 has them, and on
 * TypeScript 5 the plugin adds `@webgpu/types`.
 * @category Render
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TWebGpuPassContext = {
    readonly backend: 'WEBGPU';
    readonly device: GPUDevice;
    /**
     * The pass's own pictures, in the order they were asked for in `outputs`.
     */
    readonly outputs: readonly GPUTexture[];
    /**
     * The GPU side of one of the game's pictures, to read it in the pass, or `null` while it is
     * still loading or after it was let go of. Ask again each time rather than keeping it: when the
     * picture is loaded again, the one kept is gone.
     */
    texture(texture: TTexture): GPUTexture | null;
};

/**
 * A WebGPU pass: what it does each frame, and what it lets go of at the end.
 *
 * `render` gets the frame's encoder, with no pass of the engine's open. It ends every pass it
 * begins, even when something in it fails: one left open spoils the whole frame, the engine's
 * drawing too. It never calls `finish` or submits: the engine does, once, with everything else the
 * frame drew. Buffers, pipelines and bind groups are made once, in the factory, and kept here.
 *
 * Writing a buffer with `queue.writeBuffer` does not happen between two dispatches recorded in the
 * same frame: both read what was written last. Two dispatches that need different numbers read them
 * from two different places.
 *
 * @category Render
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TWebGpuPass = {
    render(frame: TGpuPassFrame & { readonly encoder: GPUCommandEncoder }): void;
    destroy?(): void;
};

/**
 * What a WebGL2 pass is given when it is made. The context belongs to the engine: the pass uses it
 * and only changes what it made itself.
 *
 * `gl` notes what the pass changes, so it can be put back cheaply: it is the pass's way to the
 * context, and `gl.canvas.getContext('webgl2')` is not. It is a `WebGL2RenderingContext` to
 * `instanceof`, but not to what needs the browser's own (`new XRWebGLLayer`).
 *
 * The pictures are the right way up for the engine: the first row stored is the top of the picture.
 * A framebuffer draws from the bottom up, so a pass that draws something with a top and a bottom
 * into one has to turn it over itself.
 *
 * @category Render
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TWebGl2PassContext = {
    readonly backend: 'WEBGL2';
    readonly gl: WebGL2RenderingContext;
    /**
     * The pass's own pictures, in the order they were asked for in `outputs`.
     */
    readonly outputs: readonly WebGLTexture[];
    /**
     * The GL side of one of the game's pictures, or `null` while it is still loading or after it
     * was let go of. Ask again each time rather than keeping it.
     */
    texture(texture: TTexture): WebGLTexture | null;
};

/**
 * A WebGL2 pass: what it does each frame, and what it lets go of at the end.
 *
 * It binds its own vertex array, framebuffer and transform feedback before changing them, and ends
 * any query or transform feedback it begins before it returns. When the context is lost, `destroy`
 * is called (deleting what died with the context does no harm) and the factory runs again once the
 * context comes back.
 *
 * @category Render
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TWebGl2Pass = {
    render(frame: TGpuPassFrame): void;
    destroy?(): void;
};

/**
 * What a pass is: its name, when it runs, the pictures it draws into, and how it is done on each
 * backend.
 *
 * A pass has to give the backend the game is running on: one for WebGPU alone fails when it is
 * made on WebGL2, rather than drawing nothing without saying so.
 *
 * @category Render
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TGpuPassOptions = {
    /**
     * What the errors and the warnings call it.
     */
    readonly name: string;
    /**
     * `'before'` (the default) runs before the frame draws anything: shadows, cameras or screen. What
     * it draws is seen in the same frame. `'after'` runs once everything, post-processing included,
     * is drawn: what it draws is seen the next frame. Passes of the same stage run in the order
     * they were made.
     */
    readonly stage?: 'before' | 'after';
    /**
     * The pictures the pass draws into, which the game gets back as `TTexture`s.
     */
    readonly outputs?: readonly TGpuPassOutput[];
    /**
     * Makes the WebGPU pass. It runs once, when the pass is made, and returns at once.
     */
    readonly webgpu?: (context: TWebGpuPassContext) => TWebGpuPass;
    /**
     * Makes the WebGL2 pass. It runs once, when the pass is made, and again each time the context
     * comes back after being lost. WebGL2 has no compute shaders.
     */
    readonly webgl2?: (context: TWebGl2PassContext) => TWebGl2Pass;
};

/**
 * What `useGpuPass` gives back.
 *
 * @category Render
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TGpuPassHandle = {
    /**
     * The pass's pictures as the game's own `TTexture`s, for a sprite, a model or a material. They
     * go with the pass: nothing else lets go of them.
     */
    readonly outputs: readonly TTexture[];
    /**
     * `false` stops running it and keeps what it made, for when it is turned on again.
     */
    enabled: boolean;
    /**
     * Lets go of the pass and its pictures before its component goes, which does it anyway. Calling
     * it twice does nothing more. Called from the pass's own `render`, it waits until the frame is
     * sent to the GPU, so nothing the frame recorded is left reading something gone.
     */
    destroy(): void;
};
