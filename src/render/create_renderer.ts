import type { IRenderer, TRendererOptions } from './interface';
import { hasWebGPU } from './webgpu/utils';

/**
 * The two backends, each fetched only when it is the one being started.
 *
 * Imported on demand rather than at the top because a game only ever runs one of them: with the
 * static imports both were in every game's download. A bundler (Vite, esbuild) puts each in a file
 * of its own, so a browser with WebGPU never downloads the WebGL2 renderer, and one without WebGPU
 * never downloads the WebGPU one. The fallback still works: when WebGPU fails, WebGL2 is fetched
 * then, at the cost of one more request in a case that was already the slow one.
 */
const loadWebGPU = async () => (await import('./webgpu')).createWebGPURenderer;
const loadWebGL2 = async () => (await import('./webgl2')).createWebGL2Renderer;

/**
 * The message of whatever was thrown, which is not always an `Error`.
 */
const reasonOf = (error: unknown): string => (error instanceof Error ? error.message : String(error));

/**
 * Resolves a request into a running backend. **The one place the engine decides what draws**:
 * `createGame` calls it and then holds an `IRenderer`, so nothing above `render/` ever learns
 * which one won except by reading `capabilities`.
 *
 * A named backend starts that one or throws, with no fallback: asking for WebGL2 and silently
 * getting WebGPU would hide what was being tested. `'AUTO'` tries WebGPU and, on any failure, not
 * only on absence, WebGL2.
 *
 * The fallback has one trap: a canvas that already gave out a `webgpu` context will not give a
 * `webgl2` one. The WebGPU backend asks for its device before touching the canvas, so the usual
 * failures (no adapter, no device) leave it free; a failure after that cannot fall back, and the
 * error says so.
 *
 * @category Render
 * @since 1.0.0
 */
export const createRenderer = async (
    canvas: HTMLCanvasElement,
    options: TRendererOptions = {},
): Promise<IRenderer> => {

    const renderRequested = options.renderer ?? 'AUTO';

    if (renderRequested === 'AUTO') {
        let webgpuFailure = 'navigator.gpu is not there';
        if (hasWebGPU()) {
            try {
                return await (await loadWebGPU())(canvas, options);
            } catch (error) {
                // Any failure, not only absence: a browser can report WebGPU and then hand back no device.
                webgpuFailure = reasonOf(error);
            }
        }
        try {
            return await (await loadWebGL2())(canvas, options);
        } catch (error) {
            throw new Error(
                `[NacatamalOn] createRenderer: 'AUTO' could not start any renderer.\n` +
                `  WebGPU: ${webgpuFailure}\n` +
                `  WebGL2: ${reasonOf(error)}\n` +
                `Try another browser, or check that hardware acceleration is enabled.`,
            );
        }
    }

    const currentRenderRequested = renderRequested;

    if (currentRenderRequested === 'WEBGL2') {
        return (await loadWebGL2())(canvas, options);
    }

    if (currentRenderRequested === 'WEBGPU') {
        if (!hasWebGPU()) throw new Error('[NacatamalOn] createRenderer: WebGPU is not available in this browser.');
        const rendererInstance = await (await loadWebGPU())(canvas, options);
        return rendererInstance;
    }
    
    throw new Error(`[NacatamalOn] createRenderer: Unknown renderer requested: ${currentRenderRequested}`);
};
