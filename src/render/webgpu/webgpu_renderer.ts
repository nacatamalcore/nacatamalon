import { getColor } from '../../color';
import type { IRenderer, TRendererOptions } from '../interface';
import { createDevice } from './utils';
import { configureCanvas } from './utils/configure_canvas';
import { renderFrame } from './frame';
import { FRAME_UNIFORM_FLOATS } from './frame/write_frame_uniforms';
import { createSpritePipeline } from './sprite/create_sprite_pipeline';
import { createTilemapPipeline } from './tilemap/create_tilemap_pipeline';
import { createMeshPipeline } from './mesh/create_mesh_pipeline';
import { createWebGPUBuffer, createWebGPUDataTexture, createWebGPURenderTexture, readWebGPUTexture, toGpuBuffer, updateWebGPUBuffer, updateWebGPUDataTexture } from './resources';
import type { TWebGPUState } from './types/t_webgpu_state';
import { createWebGPUTexture, createWhiteTexture, toGpuTexture } from './texture';

/**
 * The WebGPU backend. Owns the canvas's context for its lifetime.
 *
 * Async because getting a device is: `requestAdapter` and `requestDevice` are both promises,
 * and either can come back null on a blocklisted GPU. That asynchrony is what shapes
 * `createGame` two files up. No adapter is an error here, not a fallback: falling back is
 * `createRenderer`'s job. The device is asked for before the canvas, because a canvas that has
 * been given a context keeps it for life.
 *
 * Two things that bite:
 *  - The context's texture must be re-acquired **every frame**
 *    (`context.getCurrentTexture()`), never cached.
 *  - Resizing the canvas invalidates the depth/MSAA attachments, so they get reallocated when
 *    the size changes, which is why `fitCanvas` only writes `canvas.width` when it moved.
 *
 * @category Render
 * @since 1.0.0
 */
export const createWebGPURenderer = async (
    canvas: HTMLCanvasElement,
    options: TRendererOptions = {},
): Promise<IRenderer> => {

    const { device } = await createDevice();
    const { context, format } = configureCanvas(canvas, device);

    // The browser can take the card away for good (a driver reset, the GPU process crashing). Every
    // call on a lost device does nothing, so the one thing to do here is stop drawing, which also
    // stops the errors a frame would raise, and say so once: `createGame` passes it on to the page.
    // `'destroyed'` is this renderer's own `destroy()`, and not news to anyone.
    let lost = false;
    const deviceLost = device.lost.then((info): Error | null => {
        if (info.reason === 'destroyed') {
            return null;
        }
        lost = true;
        return new Error(
            `[NacatamalOn] WebGPU: the graphics card was lost (${info.message || info.reason}). The game has stopped drawing; reload the page to continue.`,
        );
    });
    // WebGPU offers 1 and 4 and nothing in between, and every card has 4 for the canvas's format.
    const samples = options.msaa === 4 ? 4 : 1;

    // Shared by every pipeline: the game's resolution and the views, written once per frame.
    const frameUniforms = {
        data: new Float32Array(FRAME_UNIFORM_FLOATS),
        buffer: device.createBuffer({
            label: 'frame uniforms',
            size: FRAME_UNIFORM_FLOATS * 4,
            usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
        }),
    };

    // Black when nobody said, rather than a second copy of the engine's default: `createGame`
    // always passes one through `cleanGameOptions`, so this only covers a direct call.
    const clearColor = options.background ?? getColor('black');

    // Both are made at boot rather than on demand: a sampler is cheap, and a sprite asking for
    // the other one mid-game must not have to build anything in the middle of a frame.
    const samplers = {
        nearest: device.createSampler({ label: 'nearest', magFilter: 'nearest', minFilter: 'nearest' }),
        linear: device.createSampler({ label: 'linear', magFilter: 'linear', minFilter: 'linear' }),
    };
    const defaultSmooth = options.smooth === true;

    // One white pixel, shared: a sprite and a model with no picture both draw with it.
    const white = createWhiteTexture(device);

    const gpu: TWebGPUState = {
        device,
        context,
        canvases: new WeakMap(),
        clearColor,
        format,
        // Built on the first frame that has an effect, and never before: see `TWebGPUState.post`.
        post: null,
        // Same promise, same reason: see `TWebGPUState.shadow`.
        shadow: null,
        shadowPipeline: null,
        // The same, for the first frame that draws an emitter.
        particles: null,
        // And for the first frame that draws a line.
        lines: null,
        frameUniforms,
        sprites: createSpritePipeline(device, format, samples, frameUniforms.buffer, samplers, defaultSmooth, white),
        tilemaps: createTilemapPipeline(device, format, samples, frameUniforms.buffer, samplers, defaultSmooth),
        meshes: createMeshPipeline(device, format, samples, samplers, defaultSmooth, white),
        depths: new Map(),
        depthsUsed: new Set(),
        samples,
        multisampled: new Map(),
    };

    return {
        capabilities: {
            backend: 'WEBGPU',
            // What was actually obtained. Upstream reads this to decide, never the request.
            msaa: samples,
        },
        frame: (ctx) => {
            if (!lost) {
                renderFrame(gpu, ctx);
            }
        },
        deviceLost,
        createTexture: (image) => createWebGPUTexture(device, image),
        createBuffer: (data, usage) => createWebGPUBuffer(device, data, usage),
        updateBuffer: (buffer, data) => updateWebGPUBuffer(device, buffer, data),
        destroyBuffer: (buffer) => { toGpuBuffer(buffer).destroy(); },
        createDataTexture: (data, width, height) => createWebGPUDataTexture(device, data, width, height),
        updateDataTexture: (texture, data, width, height, region) =>
            updateWebGPUDataTexture(device, texture, data, width, height, region),
        createRenderTexture: (width, height) => createWebGPURenderTexture(device, format, width, height),
        readTexture: (texture) => readWebGPUTexture(device, texture),
        // Everything cached for a texture here is kept in a `WeakMap`, so the texture is all there is
        // to let go. The graphics card waits for any work already submitted that reads it.
        destroyTexture: (texture) => { toGpuTexture(texture).destroy(); },
        // Written on the pipeline and read again on the next frame, so it costs nothing until
        // something is drawn. The bind group for the other filtering is built the first time
        // that pairing appears and cached from then on.
        setSmooth: (smooth) => {
            gpu.sprites.defaultSmooth = smooth;
            gpu.tilemaps.defaultSmooth = smooth;
        },
        destroy: () => {
            gpu.post?.destroy();
            gpu.shadow?.destroy();
            gpu.shadowPipeline?.destroy();
            gpu.particles?.destroy();
            gpu.lines?.destroy();
            device.destroy();
            context.unconfigure();
        },
    };
};
