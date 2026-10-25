/**
 * Asks the canvas for the WebGL2 context this backend owns for the canvas's lifetime.
 *
 * The attributes match what the WebGPU backend configures, so both start from the same picture:
 *
 * - `alpha: false`: WebGPU's `alphaMode: 'opaque'`. The canvas never shows the page through it.
 * - `antialias: false`: the samples `msaa` asks for are the passes' own, so a picture drawn into
 *   gets them too, and without it pixel art lands on the same pixels as on WebGPU.
 * - `depth: true`: meshes need it, so one thing in front of another hides it whatever order they
 *   were drawn in. The 2D neither tests nor writes it, so it costs 2D nothing but the memory.
 * - `stencil: true`: masks write their shapes into it. Most cards keep 24 bits of depth in 32
 *   anyway, so it costs little or nothing, and a pass with nothing masked never touches it.
 * - `preserveDrawingBuffer: false`: like WebGPU, the picture is not kept after it is shown.
 *
 * Throws if the browser gives no context, which is also what happens on a canvas that already
 * handed out a different one (a `webgpu` context stays with its canvas for life).
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const createContext = (canvas: HTMLCanvasElement): WebGL2RenderingContext => {
    const gl = canvas.getContext('webgl2', {
        alpha: false,
        antialias: false,
        depth: true,
        stencil: true,
        premultipliedAlpha: false,
        preserveDrawingBuffer: false,
        powerPreference: 'high-performance',
    });

    if (gl === null) {
        throw new Error('[NacatamalOn] WebGL2 is not available on this canvas. Either the browser does not support it, or the canvas already gave out another kind of context.');
    }
    return gl;
};
