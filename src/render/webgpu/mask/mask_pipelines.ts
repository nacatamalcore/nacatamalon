import { DISTANCE_FIELD_COVERAGE, SPRITE_SHADER_HEAD } from '../sprite/sprite_shader';
import { TILEMAP_SHADER_HEAD } from '../tilemap/tilemap_shader';
import { TILE_CORNERS } from '../tilemap/create_tilemap_pipeline';
import { VERTEX_BUFFERS } from '../sprite/create_sprite_pipeline';
import { DEPTH_FORMAT, FLAT_DEPTH } from '../frame/depth';
import { toGpuTexture } from '../texture';
import type { ITexture } from '../../interface';
import type { TDrawStencil } from '../../interface/draw/t_draw_stencil';
import type { TSpritePipeline } from '../sprite/types/t_sprite_pipeline';
import type { TTilemapPipeline } from '../tilemap/types/t_tilemap_pipeline';

/**
 * What a mask's shape is read by: its alpha, how light it is, or the edge of a vector font's letter.
 */
type TReading = 'alpha' | 'luminance' | 'field';

/**
 * The pipelines that write masks into the stencil, and the one that lays a soft mask's picture over
 * a pass. Made the first time a frame has a mask, so a game with none never compiles them.
 *
 * @internal
 */
export type TMaskPipelines = {
    /** A sprite writing its shape: by how it is read, then by what it does to the stencil. */
    sprite(reading: TReading, write: Exclude<TDrawStencil['write'], 'none'>): GPURenderPipeline;
    /** A map's layer, or a shape drawn as one, writing its shape. */
    tilemap(reading: Exclude<TReading, 'field'>, write: 'add' | 'sub'): GPURenderPipeline;
    /** A soft mask's picture laid over the pass, read in a channel and turned round or not. */
    layer(channel: 'alpha' | 'luminance', invert: boolean): GPURenderPipeline;
    /** The two pictures of a soft mask, bound together. */
    layerBindGroup(content: ITexture, shape: ITexture): GPUBindGroup;
};

/**
 * Where a shape covers: at least half there, read the way it asks. Nothing of its colour is written,
 * only the stencil.
 */
const SPRITE_MASK_FRAGMENT = /* wgsl */ `
override READING: u32 = 0u;

@fragment
fn fs(in: VertexOut) -> @location(0) vec4f {
    let sample = textureSample(spriteTexture, spriteSampler, insideWindow(in.uv, in.window, in.repeat));
    let coverage = distanceFieldCoverage(sample, in.uv);
    var value = sample.a * in.tint.a;
    if (READING == 1u) {
        value = dot(sample.rgb * in.tint.rgb, vec3f(0.2126, 0.7152, 0.0722)) * value;
    }
    if (READING == 2u) {
        value = in.tint.a * coverage;
    }
    if (value < 0.5) {
        discard;
    }
    return vec4f(0.0);
}
`;

const TILEMAP_MASK_FRAGMENT = /* wgsl */ `
override READING: u32 = 0u;

@fragment
fn fs(in: VertexOut) -> @location(0) vec4f {
    let sample = textureSample(tilesTexture, tilesSampler, tileUv(in)) * layer.tint;
    var value = sample.a;
    if (READING == 1u) {
        value = dot(sample.rgb, vec3f(0.2126, 0.7152, 0.0722)) * sample.a;
    }
    if (value < 0.5) {
        discard;
    }
    return vec4f(0.0);
}
`;

/**
 * A soft mask's picture over the pass: the masked things, already drawn and with their colour
 * multiplied by their alpha, let through as much as the shape's picture says at the same pixel. Both
 * pictures are the pass's size, so each is read at the pixel being drawn and nothing is placed.
 */
const LAYER_SHADER = /* wgsl */ `
@group(0) @binding(0) var content: texture_2d<f32>;
@group(0) @binding(1) var shape: texture_2d<f32>;

override CHANNEL: u32 = 0u;
override INVERT: u32 = 0u;

@vertex
fn vs(@builtin(vertex_index) index: u32) -> @builtin(position) vec4f {
    let corner = vec2f(f32((index << 1u) & 2u), f32(index & 2u));
    return vec4f(corner * 2.0 - 1.0, 0.0, 1.0);
}

@fragment
fn fs(@builtin(position) at: vec4f) -> @location(0) vec4f {
    let pixel = vec2i(at.xy);
    let seen = textureLoad(content, pixel, 0);
    let cut = textureLoad(shape, pixel, 0);
    var through = cut.a;
    if (CHANNEL == 1u) {
        through = dot(cut.rgb, vec3f(0.2126, 0.7152, 0.0722));
    }
    if (INVERT == 1u) {
        through = 1.0 - through;
    }
    return seen * clamp(through, 0.0, 1.0);
}
`;

const READINGS: Record<TReading, number> = { alpha: 0, luminance: 1, field: 2 };

const WRITES: Record<Exclude<TDrawStencil['write'], 'none'>, GPUStencilFaceState> = {
    add: { compare: 'equal', failOp: 'keep', depthFailOp: 'keep', passOp: 'increment-clamp' },
    sub: { compare: 'equal', failOp: 'keep', depthFailOp: 'keep', passOp: 'decrement-clamp' },
    // Everything above the reference brought down to it: "the reference is less than what is there".
    reset: { compare: 'less', failOp: 'keep', depthFailOp: 'keep', passOp: 'replace' },
};

/**
 * Makes the mask pipelines, each compiled the first time it is asked for.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const createMaskPipelines = (
    device: GPUDevice,
    format: GPUTextureFormat,
    samples: number,
    sprites: TSpritePipeline,
    tilemaps: TTilemapPipeline,
): TMaskPipelines => {
    const spriteModule = device.createShaderModule({ label: 'mask sprite shader', code: SPRITE_SHADER_HEAD + DISTANCE_FIELD_COVERAGE + SPRITE_MASK_FRAGMENT });
    const tilemapModule = device.createShaderModule({ label: 'mask tilemap shader', code: TILEMAP_SHADER_HEAD + TILEMAP_MASK_FRAGMENT });
    const layerModule = device.createShaderModule({ label: 'mask layer shader', code: LAYER_SHADER });
    const spriteLayout = device.createPipelineLayout({ label: 'mask sprite layout', bindGroupLayouts: [sprites.layouts.frame, sprites.layouts.texture] });
    const tilemapLayout = device.createPipelineLayout({
        label: 'mask tilemap layout',
        bindGroupLayouts: [tilemaps.layouts.frame, tilemaps.layouts.texture, tilemaps.layouts.layer],
    });
    const pictures = device.createBindGroupLayout({
        label: 'mask layer pictures',
        entries: [
            { binding: 0, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: 'unfilterable-float' } },
            { binding: 1, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: 'unfilterable-float' } },
        ],
    });
    const layerLayout = device.createPipelineLayout({ label: 'mask layer layout', bindGroupLayouts: [pictures] });

    // Writes the stencil and nothing of the colour.
    const writing = (write: Exclude<TDrawStencil['write'], 'none'>): GPUDepthStencilState => ({
        format: DEPTH_FORMAT,
        depthWriteEnabled: false,
        depthCompare: 'always',
        stencilFront: WRITES[write],
        stencilBack: WRITES[write],
        stencilReadMask: 0xff,
        stencilWriteMask: 0xff,
    });

    const kept = new Map<string, GPURenderPipeline>();
    const once = (key: string, make: () => GPURenderPipeline): GPURenderPipeline => {
        let pipeline = kept.get(key);
        if (pipeline === undefined) {
            pipeline = make();
            kept.set(key, pipeline);
        }
        return pipeline;
    };
    const groups = new WeakMap<ITexture, WeakMap<ITexture, GPUBindGroup>>();

    return {
        sprite: (reading, write) => once(`sprite ${reading} ${write}`, () => device.createRenderPipeline({
            label: `mask sprite ${reading} ${write}`,
            layout: spriteLayout,
            vertex: { module: spriteModule, entryPoint: 'vs', buffers: VERTEX_BUFFERS },
            fragment: {
                module: spriteModule,
                entryPoint: 'fs',
                constants: { READING: READINGS[reading] },
                targets: [{ format, writeMask: 0 }],
            },
            primitive: { topology: 'triangle-strip' },
            depthStencil: writing(write),
            multisample: { count: samples },
        })),
        tilemap: (reading, write) => once(`tilemap ${reading} ${write}`, () => device.createRenderPipeline({
            label: `mask tilemap ${reading} ${write}`,
            layout: tilemapLayout,
            vertex: {
                module: tilemapModule,
                entryPoint: 'vs',
                buffers: TILE_CORNERS,
            },
            fragment: {
                module: tilemapModule,
                entryPoint: 'fs',
                constants: { READING: READINGS[reading] },
                targets: [{ format, writeMask: 0 }],
            },
            primitive: { topology: 'triangle-list' },
            depthStencil: writing(write),
            multisample: { count: samples },
        })),
        layer: (channel, invert) => once(`layer ${channel} ${invert}`, () => device.createRenderPipeline({
            label: `mask layer ${channel}${invert ? ' inverted' : ''}`,
            layout: layerLayout,
            vertex: { module: layerModule, entryPoint: 'vs' },
            fragment: {
                module: layerModule,
                entryPoint: 'fs',
                constants: { CHANNEL: channel === 'luminance' ? 1 : 0, INVERT: invert ? 1 : 0 },
                // Its colour is already multiplied by its alpha, which is what laying it over asks for.
                targets: [{
                    format,
                    blend: {
                        color: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha', operation: 'add' },
                        alpha: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha', operation: 'add' },
                    },
                }],
            },
            primitive: { topology: 'triangle-list' },
            // Kept inside the masks around it, like anything else in the pass.
            depthStencil: FLAT_DEPTH,
            multisample: { count: samples },
        })),
        layerBindGroup: (content, shape) => {
            let byShape = groups.get(content);
            if (byShape === undefined) {
                byShape = new WeakMap();
                groups.set(content, byShape);
            }
            let group = byShape.get(shape);
            if (group === undefined) {
                group = device.createBindGroup({
                    label: 'mask layer pictures',
                    layout: pictures,
                    entries: [
                        { binding: 0, resource: toGpuTexture(content).createView() },
                        { binding: 1, resource: toGpuTexture(shape).createView() },
                    ],
                });
                byShape.set(shape, group);
            }
            return group;
        },
    };
};
