import { SPRITE_BATCH_DISTANCE_FIELD_SHADER, SPRITE_BATCH_SHADER } from './batch_shader';
import { SPRITE_TEXTURE_SLOTS } from '../../shared/sprite_batch';
import { buildSpriteDistanceFieldMaterialShader, buildSpriteMaterialShader } from '../material/sprite_material_shader';
import { createFlatMaterials } from '../material/flat_materials';
import type { TSpritePipeline } from './types/t_sprite_pipeline';
import { INITIAL_SPRITE_CAPACITY, SPRITE_FLOATS } from './write_sprite_instance';
import { FLAT_DEPTH } from '../frame/depth';
import { ADDITIVE_BLEND, ALPHA_BLEND } from '../frame/blend';
import { withoutLights2d } from '../../shared/lighting_2d_shader';
import type { TSpriteVariant } from './types/t_sprite_pipeline';

/**
 * How the corners and the per-sprite data are read.
 *
 * A value of its own because the material pipelines are fed the very same one: they run a different
 * fragment over the identical quad, and a second copy of this table is a second place for a stride
 * to go wrong.
 *
 * @internal
 */
export const VERTEX_BUFFERS: GPUVertexBufferLayout[] = [
    // buffer 0: the corners of the quad, shared by every sprite
    {
        arrayStride: 8,
        stepMode: 'vertex',
        attributes: [
            { shaderLocation: 0, offset: 0, format: 'float32x2' },   // corner
        ],
    },
    // buffer 1: one entry per sprite, 18 floats = 72 bytes
    {
        arrayStride: 88,
        stepMode: 'instance',
        attributes: [
            { shaderLocation: 1, offset: 0, format: 'float32x2' },   // x, y
            { shaderLocation: 2, offset: 8, format: 'float32x2' },   // width, height
            { shaderLocation: 3, offset: 16, format: 'float32' },    // rotation
            { shaderLocation: 4, offset: 20, format: 'float32x2' },  // scaleX, scaleY
            { shaderLocation: 5, offset: 28, format: 'float32x4' },  // r, g, b, a
            { shaderLocation: 6, offset: 44, format: 'float32x2' },  // uvOffset x, y
            { shaderLocation: 7, offset: 52, format: 'float32x2' },  // uvScale x, y
            { shaderLocation: 8, offset: 60, format: 'float32x2' },  // anchor x, y
            { shaderLocation: 9, offset: 68, format: 'float32' },    // view
            { shaderLocation: 10, offset: 72, format: 'float32x2' }, // pictures across, down
            { shaderLocation: 11, offset: 80, format: 'float32x2' }, // where the pattern starts
        ],
    },
];

/**
 * The four corners of the quad every sprite is drawn from, as a triangle strip.
 *
 * A value of its own for the same reason as the table above: a node's small picture in the shader
 * composer is drawn from the very same corners.
 *
 * @internal
 */
export const SPRITE_QUAD = new Float32Array([
    -0.5, -0.5,
    0.5, -0.5,
    -0.5, 0.5,
    0.5, 0.5,
]);

/**
 * Creates the sprite pipeline for rendering sprites.
 * @internal
 * @param device The GPU device.
 * @param format The texture format.
 * @param samples How many samples per pixel the passes it draws in have: 1, or 4 with `msaa`.
 * @param frameUniforms The shared uniform buffer holding the game's resolution and this frame's views.
 * @param samplers The two ways of reading a texture, nearest and linear.
 * @param defaultSmooth What a sprite that does not choose gets, from the game's `smooth` option.
 * @param whiteTexture The single white texel an untextured sprite samples.
 * @returns The created sprite pipeline module.
 */
export const createSpritePipeline = (
    device: GPUDevice,
    format: GPUTextureFormat,
    samples: number,
    frameUniforms: GPUBuffer,
    samplers: { nearest: GPUSampler; linear: GPUSampler },
    defaultSmooth: boolean,
    whiteTexture: GPUTexture,
): TSpritePipeline => {

    // Spelled out rather than worked out from the shader, for the reason the models already give:
    // the material pipelines share these first two groups, and a bind group made once has to be
    // usable by all of them. Worked out per pipeline, each would get its own layout that no other
    // could take, and nothing about them would look different.
    const frameLayout = device.createBindGroupLayout({
        label: 'sprite frame layout',
        entries: [{ binding: 0, visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT, buffer: { type: 'uniform' } }],
    });
    const textureLayout = device.createBindGroupLayout({
        label: 'sprite texture layout',
        entries: [
            { binding: 0, visibility: GPUShaderStage.FRAGMENT, sampler: {} },
            ...Array.from({ length: SPRITE_TEXTURE_SLOTS }, (_, i) => ({ binding: i + 1, visibility: GPUShaderStage.FRAGMENT, texture: {} })),
        ],
    });

    const pipelineLayout = device.createPipelineLayout({
        label: 'sprite pipeline layout',
        bindGroupLayouts: [frameLayout, textureLayout],
    });
    // The plain one and the one for distance fields differ in their ending and in nothing else, and
    // each comes covering or adding light: four pipelines from two shaders.
    const pipelineFor = (label: string, module: GPUShaderModule, blend: GPUBlendState): GPURenderPipeline => {
        return device.createRenderPipeline({
            label: `${label} pipeline`,
            layout: pipelineLayout,
            vertex: {
                module,
                entryPoint: 'vs',
                buffers: VERTEX_BUFFERS,
            },
            fragment: {
                module,
                entryPoint: 'fs',
                targets: [{
                    format,
                    blend,
                }],
            },
            primitive: { topology: 'triangle-strip' },
            // Declared, not used: a pass with depth only accepts pipelines that say what they do with
            // it. Sprites neither test nor write it.
            depthStencil: FLAT_DEPTH,
            multisample: { count: samples },
        });
    };
    // And each of the four twice: lit by the 2D lights, and for a pass with none, where reading
    // them would be work for nothing on every pixel.
    const variant = (lit: boolean): TSpriteVariant => {
        const name = lit ? 'sprite' : 'sprite unlit';
        const shader = (code: string) => (lit ? code : withoutLights2d(code));
        const plain = device.createShaderModule({ label: `${name} shader`, code: shader(SPRITE_BATCH_SHADER) });
        const field = device.createShaderModule({ label: `${name} distance field shader`, code: shader(SPRITE_BATCH_DISTANCE_FIELD_SHADER) });
        return {
            pipeline: pipelineFor(name, plain, ALPHA_BLEND),
            distanceFieldPipeline: pipelineFor(`${name} distance field`, field, ALPHA_BLEND),
            additivePipeline: pipelineFor(`${name} additive`, plain, ADDITIVE_BLEND),
            additiveDistanceFieldPipeline: pipelineFor(`${name} distance field additive`, field, ADDITIVE_BLEND),
        };
    };


    // Buffers
    const quadData = SPRITE_QUAD;
    const quadBuffer = device.createBuffer({
        label: 'Sprite Quad',
        size: quadData.byteLength,
        usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST
    });
    device.queue.writeBuffer(quadBuffer, 0, quadData);

    const bindGroup = device.createBindGroup({
        label: 'sprite bind group',
        layout: frameLayout,
        entries: [
            {
                binding: 0,
                resource: {
                    buffer: frameUniforms,
                },
            },
        ],
    });

    // Group 1 for sprites without a usable texture. Built here, once, because every frame needs it.
    const whiteView = whiteTexture.createView();
    const whiteBindGroup = device.createBindGroup({
        label: 'sprite white bind group',
        layout: textureLayout,
        entries: [
            { binding: 0, resource: defaultSmooth ? samplers.linear : samplers.nearest },
            ...Array.from({ length: SPRITE_TEXTURE_SLOTS }, (_, i) => ({ binding: i + 1, resource: whiteView })),
        ],
    });

    // Room for a first batch of sprites. `writeSpriteInstances` doubles it when a frame needs more.
    const capacity = INITIAL_SPRITE_CAPACITY;
    const instanceData = new Float32Array(capacity * SPRITE_FLOATS);
    const instances = device.createBuffer({
        label: 'sprite instances',
        size: instanceData.byteLength,
        usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
    });

    return {
        lit: variant(true),
        unlit: variant(false),
        layouts: { frame: frameLayout, texture: textureLayout },
        materials: createFlatMaterials(device, {
            label: 'sprite',
            format,
            samples,
            shared: [frameLayout, textureLayout],
            vertexBuffers: VERTEX_BUFFERS,
            topology: 'triangle-strip',
            build: buildSpriteMaterialShader,
        }),
        distanceFieldMaterials: createFlatMaterials(device, {
            label: 'sprite distance field',
            format,
            samples,
            shared: [frameLayout, textureLayout],
            vertexBuffers: VERTEX_BUFFERS,
            topology: 'triangle-strip',
            build: buildSpriteDistanceFieldMaterialShader,
        }),
        quad: quadBuffer,
        bindGroup,
        instances,
        instanceData,
        capacity,
        samplers,
        defaultSmooth,
        whiteBindGroup,
        whiteTexture,
        textureBindGroups: new WeakMap(),
        runsByPass: [],
        runs: [],
        runCount: 0,
    };
};
