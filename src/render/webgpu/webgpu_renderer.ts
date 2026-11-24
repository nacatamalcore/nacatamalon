import { destroyCustoms, newCustomsOnCard } from './custom/customs';
import { attachGpuPassAccess } from '../extensions/gpu_pass_bridge';
import { getColor } from '../../color';
import type { IRenderer, TRendererOptions } from '../interface';
import { createDevice } from './utils';
import { configureCanvas } from './utils/configure_canvas';
import { renderFrame } from './frame';
import { FRAME_UNIFORM_FLOATS } from './frame/write_frame_uniforms';
import { createSpritePipeline } from './sprite/create_sprite_pipeline';
import { createTilemapPipeline } from './tilemap/create_tilemap_pipeline';
import { createMeshPipeline } from './mesh/create_mesh_pipeline';
import { readWebGPUTexture } from './resources';
import { keepResources } from './context/kept_resources';
import { watchDeviceLoss } from './context/watch_device_loss';
import type { TWebGPUState } from './types/t_webgpu_state';
import { createWhiteTexture } from './texture';

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

    // WebGPU offers 1 and 4 and nothing in between, and every card has 4 for the canvas's format.
    const samples = options.msaa === 4 ? 4 : 1;

    // Black when nobody said, rather than a second copy of the engine's default: `createGame`
    // always passes one through `cleanGameOptions`, so this only covers a direct call.
    const clearColor = options.background ?? getColor('black');

    const defaultSmooth = options.smooth === true;

    /**
     * What every game draws with, on the device given: for the boot, and for a card that came back.
     */
    const buildOn = (device: GPUDevice, smooth: boolean) => {
        // Shared by every pipeline: the game's resolution and the views, written once per frame.
        const frameUniforms = {
            data: new Float32Array(FRAME_UNIFORM_FLOATS),
            buffer: device.createBuffer({
                label: 'frame uniforms',
                size: FRAME_UNIFORM_FLOATS * 4,
                usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
            }),
        };

        // Both are made at boot rather than on demand: a sampler is cheap, and a sprite asking for
        // the other one mid-game must not have to build anything in the middle of a frame.
        const samplers = {
            // Only ever the picture itself, never one of its mipmaps: sprites, map layers and particles
            // are drawn at the size they are, and the WebGL2 backend reads them the same way.
            nearest: device.createSampler({ label: 'nearest', magFilter: 'nearest', minFilter: 'nearest', lodMaxClamp: 0 }),
            linear: device.createSampler({ label: 'linear', magFilter: 'linear', minFilter: 'linear', lodMaxClamp: 0 }),
        };

        // One white pixel, shared: a sprite and a model with no picture both draw with it.
        const white = createWhiteTexture(device);

        return {
            frameUniforms,
            sprites: createSpritePipeline(device, format, samples, frameUniforms.buffer, samplers, smooth, white),
            tilemaps: createTilemapPipeline(device, format, samples, frameUniforms.buffer, samplers, smooth),
            meshes: createMeshPipeline(device, format, samples, samplers, smooth, white),
        };
    };

    const gpu: TWebGPUState = {
        device,
        context,
        lost: false,
        canvases: new WeakMap(),
        clearColor,
        format,
        // Built on the first frame that has an effect, and never before: see `TWebGPUState.post`.
        post: null,
        // Same promise, same reason: see `TWebGPUState.shadows`.
        shadows: [],
        shadowPipeline: null,
        shadowsSpareFor: 0,
        // The same, for the first frame that draws an emitter.
        particles: null,
        // And for the first frame that draws a line.
        lines: null,
        // And each kind a plugin registered, the first frame that draws one.
        customs: newCustomsOnCard(),
        masks: null,
        filterDepth: null,
        ...buildOn(device, defaultSmooth),
        depths: new Map(),
        depthsUsed: new Set(),
        samples,
        multisampled: new Map(),
    };

    const restored = new Set<() => void>();
    const kept = keepResources(() => ({ device: gpu.device, format }));
    const { deviceLost, isLost, end } = watchDeviceLoss(gpu, {
        lost: () => {
            gpu.gpuPasses?.reset();
            destroyCustoms(gpu.customs);
        },
        restore: (next) => {
            context.configure({ device: next, format, alphaMode: 'opaque' });
            gpu.device = next;
            // The other canvases are told of the new device the next time each is drawn on.
            gpu.canvases = new WeakMap();
            Object.assign(gpu, buildOn(next, gpu.sprites.defaultSmooth));
            // What is built on demand went with the card: dropped, and the next frame that needs one
            // builds it, as the first that needed one did.
            gpu.post = null;
            gpu.shadows = [];
            gpu.shadowPipeline = null;
            gpu.shadowsSpareFor = 0;
            gpu.particles = null;
            gpu.lines = null;
            gpu.masks = null;
            gpu.filterDepth = null;
            gpu.depths.clear();
            gpu.depthsUsed.clear();
            gpu.multisampled.clear();
            kept.restore();
            gpu.gpuPasses?.restore();
            for (const told of [...restored]) told();
        },
        gaveUp: () => { gpu.gpuPasses?.destroy(); },
    });

    return attachGpuPassAccess({
        capabilities: {
            backend: 'WEBGPU',
            // What was actually obtained. Upstream reads this to decide, never the request.
            msaa: samples,
        },
        frame: (ctx) => {
            if (!isLost()) {
                renderFrame(gpu, ctx);
            }
        },
        deviceLost,
        onRestored: (listener) => {
            restored.add(listener);
            return () => { restored.delete(listener); };
        },
        // Kept so they can be put on the card again if it is lost: see `keepResources`.
        createTexture: kept.createTexture,
        createBuffer: kept.createBuffer,
        updateBuffer: kept.updateBuffer,
        destroyBuffer: kept.destroyBuffer,
        createDataTexture: kept.createDataTexture,
        updateDataTexture: kept.updateDataTexture,
        createRenderTexture: kept.createRenderTexture,
        readTexture: (texture) => readWebGPUTexture(gpu.device, texture),
        // Everything cached for a texture here is kept in a `WeakMap`, so the texture is all there is
        // to let go. The graphics card waits for any work already submitted that reads it.
        destroyTexture: kept.destroyTexture,
        // Written on the pipeline and read again on the next frame, so it costs nothing until
        // something is drawn. The bind group for the other filtering is built the first time
        // that pairing appears and cached from then on.
        setSmooth: (smooth) => {
            gpu.sprites.defaultSmooth = smooth;
            gpu.tilemaps.defaultSmooth = smooth;
            gpu.meshes.defaultSmooth = smooth;
        },
        destroy: () => {
            end();
            gpu.gpuPasses?.destroy();
            gpu.post?.destroy();
            for (const map of gpu.shadows) map.destroy();
            gpu.shadowPipeline?.destroy();
            gpu.particles?.destroy();
            gpu.lines?.destroy();
            destroyCustoms(gpu.customs);
            gpu.filterDepth?.destroy();
            kept.release();
            gpu.device.destroy();
            context.unconfigure();
        },
    }, { backend: 'WEBGPU', state: gpu });
};
