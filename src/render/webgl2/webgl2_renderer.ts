import { getColor } from '../../color';
import type { IRenderer, TRendererOptions } from '../interface';
import { watchContextLoss } from './context/watch_context_loss';
import { createGpuResources } from './create_gpu_resources';
import { renderFrame } from './frame';
import { FRAME_UNIFORM_FLOATS } from './frame/write_frame_uniforms';
import { uploadTexture, type TWebGL2Texture } from './texture';
import { createWebGL2Buffer, createWebGL2DataTexture, createWebGL2RenderTexture, destroyWebGL2Texture, readWebGL2Texture, toGlBuffer, updateWebGL2Buffer } from './resources';
import type { TWebGL2State } from './types/t_webgl2_state';
import { createContext } from './utils';

/**
 * The WebGL2 backend. Same contract, older API: this is what makes `IRenderer` an interface
 * rather than a habit.
 *
 * MSAA here is the context attribute, not a sample count to choose, so `capabilities` reports
 * what `getContextAttributes()` actually gave.
 *
 * The trap this backend exists to expose: WebGL2 is a **state machine** and WebGPU is not. Any
 * `IRenderer` method whose contract only makes sense with a command encoder has leaked WebGPU
 * into the interface, and this file is where that shows up.
 *
 * @category Render
 * @since 1.0.0
 */
export const createWebGL2Renderer = async (
    canvas: HTMLCanvasElement,
    options: TRendererOptions = {},
): Promise<IRenderer> => {
    const gl = createContext(canvas);

    // Black when nobody said, like the WebGPU backend: `createGame` always passes one.
    const clearColor = options.background ?? getColor('black');
    const { frameUniformBuffer, sprites, tilemaps, meshes } = createGpuResources(gl, options.smooth === true);

    const state: TWebGL2State = {
        gl,
        clearColor,
        frameUniforms: { data: new Float32Array(FRAME_UNIFORM_FLOATS), buffer: frameUniformBuffer },
        sprites,
        tilemaps,
        meshes,
        // Built on the first frame that has an effect, never before: see `TWebGL2State.post`.
        post: null,
        // Same promise, same reason: see `TWebGL2State.shadow`.
        shadow: null,
        shadowPipeline: null,
        // The same, for the first frame that draws an emitter.
        particles: null,
        lines: null,
        framebuffers: new Map(),
        upright: new Map(),
        uprightUsed: new Set(),
        canvases: new Map(),
        canvasesUsed: new Set(),
        // What was asked for, as far as this card goes. 4 is the most `msaa` asks, and every WebGL2 card
        // offers at least 4.
        samples: options.msaa === 4 ? Math.min(4, gl.getParameter(gl.MAX_SAMPLES) as number) : 1,
        multisampled: new Map(),
        multisampledUsed: new Set(),
        textures: new Set(),
        lost: gl.isContextLost(),
    };
    const unwatchContext = watchContextLoss(canvas, state);

    return {
        capabilities: {
            backend: 'WEBGL2',
            // What was obtained. The context itself has no antialiasing: the samples are the passes'
            // own (see `bindMultisampled`), so a picture drawn into gets them as well as the screen.
            msaa: state.samples,
        },
        frame: (ctx) => renderFrame(state, ctx),
        createTexture: (image) => {
            // The image stays with the handle: it is what a restore uploads again. A texture made
            // while the context is lost is uploaded by that restore, like every other.
            const texture: TWebGL2Texture = {
                resourceType: 'texture',
                source: { kind: 'image', image },
                glTexture: state.lost ? null : uploadTexture(gl, image),
            };
            state.textures.add(texture);
            return texture;
        },
        createBuffer: (data, usage) => createWebGL2Buffer(gl, data, usage),
        updateBuffer: (buffer, data) => updateWebGL2Buffer(gl, buffer, data),
        destroyBuffer: (buffer) => { gl.deleteBuffer(toGlBuffer(buffer)); },
        createDataTexture: (data, width, height) => {
            const texture = createWebGL2DataTexture(gl, data, width, height) as TWebGL2Texture;
            state.textures.add(texture);
            return texture;
        },
        createRenderTexture: (width, height) => {
            const texture = createWebGL2RenderTexture(gl, width, height) as TWebGL2Texture;
            state.textures.add(texture);
            return texture;
        },
        readTexture: (texture) => readWebGL2Texture(gl, texture),
        destroyTexture: (texture) => destroyWebGL2Texture(state, texture),
        // Read again on the next frame, so it costs nothing until something is drawn.
        setSmooth: (smooth) => {
            state.sprites.defaultSmooth = smooth;
            state.tilemaps.defaultSmooth = smooth;
        },
        destroy: () => {
            unwatchContext();
            state.post?.destroy();
            state.shadow?.destroy();
            state.shadowPipeline?.destroy();
            state.particles?.destroy();
            state.lines?.destroy();
            for (const texture of state.textures) {
                if (texture.source.kind === 'image') {
                    texture.source.image.close();
                }
            }
            state.textures.clear();
            state.lost = true;
            gl.getExtension('WEBGL_lose_context')?.loseContext();
        },
    };
};
