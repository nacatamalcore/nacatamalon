import { TILEMAP_SHADER } from './tilemap_shader';
import { buildTilemapMaterialShader } from '../material/tilemap_material_shader';
import { createFlatMaterials } from '../material/flat_materials';
import type { TTilemapPipeline } from './types/t_tilemap_pipeline';
import { FLAT_DEPTH } from '../frame/depth';

/**
 * Floats a layer hands over: position, scale, rotation, view, two of padding, and the colour.
 *
 * Sixteen and not twelve because the graphics card wants the next slot of a uniform buffer to start
 * on a round number of bytes, and 256 is the number it asks for. The stride below is that.
 *
 * @internal
 */
export const LAYER_FLOATS = 12;

/**
 * Bytes between one layer's numbers and the next inside the shared buffer. Set by the graphics
 * card, not chosen: a bind group can point at an offset, but only a multiple of this one.
 *
 * @internal
 */
export const LAYER_STRIDE = 256;

/**
 * How many layers fit before the buffer has to grow.
 */
const INITIAL_LAYERS = 8;

/**
 * Creates the pipeline that draws a map's layers.
 *
 * It looks through the same frame uniforms as the sprites, so a map and the characters on it share
 * one camera by construction rather than by agreement.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const createTilemapPipeline = (
    device: GPUDevice,
    format: GPUTextureFormat,
    samples: number,
    frameUniforms: GPUBuffer,
    samplers: { nearest: GPUSampler; linear: GPUSampler },
    defaultSmooth: boolean,
): TTilemapPipeline => {
    // Spelled out rather than worked out from the shader, so a layer's material pipeline can bind
    // the very same groups: an automatic layout belongs to one pipeline and nothing else can use it.
    const frameLayout = device.createBindGroupLayout({
        label: 'tilemap frame layout',
        entries: [{ binding: 0, visibility: GPUShaderStage.VERTEX, buffer: { type: 'uniform' } }],
    });
    const textureLayout = device.createBindGroupLayout({
        label: 'tilemap texture layout',
        entries: [
            { binding: 0, visibility: GPUShaderStage.FRAGMENT, sampler: {} },
            { binding: 1, visibility: GPUShaderStage.FRAGMENT, texture: {} },
        ],
    });
    const layerLayout = device.createBindGroupLayout({
        label: 'tilemap layer layout',
        entries: [{
            binding: 0,
            visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT,
            buffer: { type: 'uniform' },
        }],
    });

    /**
     * One corner: where it is inside the map, and which part of the sheet it shows.
     */
    const CORNERS: GPUVertexBufferLayout[] = [{
        arrayStride: 16,
        stepMode: 'vertex',
        attributes: [
            { shaderLocation: 0, offset: 0, format: 'float32x2' },
            { shaderLocation: 1, offset: 8, format: 'float32x2' },
        ],
    }];

    const module = device.createShaderModule({ label: 'tilemap shader', code: TILEMAP_SHADER });
    const pipeline = device.createRenderPipeline({
        label: 'tilemap pipeline',
        layout: device.createPipelineLayout({
            label: 'tilemap pipeline layout',
            bindGroupLayouts: [frameLayout, textureLayout, layerLayout],
        }),
        vertex: {
            module,
            entryPoint: 'vs',
            buffers: CORNERS,
        },
        fragment: {
            module,
            entryPoint: 'fs',
            targets: [{
                format,
                // Straight alpha, the same blend as the sprites: a map's transparent corners have to
                // show what is behind them exactly as a sprite's do.
                blend: {
                    color: { srcFactor: 'src-alpha', dstFactor: 'one-minus-src-alpha', operation: 'add' },
                    alpha: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha', operation: 'add' },
                },
            }],
        },
        // A list and not a strip: a strip cannot start a new cell without wasted corners, and at a
        // few thousand cells two extra corners each are cheaper than the bookkeeping.
        primitive: { topology: 'triangle-list' },
        // As for sprites: present so the pass will take it, and doing nothing.
        depthStencil: FLAT_DEPTH,
        multisample: { count: samples },
    });

    const frameBindGroup = device.createBindGroup({
        label: 'tilemap frame bind group',
        layout: frameLayout,
        entries: [{ binding: 0, resource: { buffer: frameUniforms } }],
    });

    const layerUniforms = {
        buffer: device.createBuffer({
            label: 'tilemap layers',
            size: INITIAL_LAYERS * LAYER_STRIDE,
            usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
        }),
        data: new Float32Array(INITIAL_LAYERS * LAYER_STRIDE / 4),
        capacity: INITIAL_LAYERS,
    };

    return {
        layouts: { frame: frameLayout, texture: textureLayout, layer: layerLayout },
        materials: createFlatMaterials(device, {
            label: 'tilemap',
            format,
            samples,
            shared: [frameLayout, textureLayout, layerLayout],
            vertexBuffers: CORNERS,
            topology: 'triangle-list',
            build: buildTilemapMaterialShader,
        }),
        pipeline,
        frameBindGroup,
        textureBindGroups: new WeakMap(),
        samplers,
        defaultSmooth,
        layerUniforms,
        layerBindGroups: [],
    };
};
