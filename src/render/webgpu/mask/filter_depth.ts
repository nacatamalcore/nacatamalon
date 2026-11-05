import { DEPTH_FORMAT, FLAT_DEPTH, STENCIL_TEST } from '../frame/depth';
import type { ITexture } from '../../interface';
import type { TLayerPart } from '../../shared/layer_parts';

/**
 * The depth of what a filter holds, kept for its layer: what lets a model inside a filter be hidden
 * pixel by pixel by a model in front of it, and hide what is behind it, instead of being laid over
 * the scene whole.
 *
 * The pass that draws what the filter holds keeps its depth (see `readableDepthFor`). Straight after
 * it, two pictures the size of the filter's region are made from it:
 *
 * - **its own**: the depth each pixel was drawn at, far where nothing with depth was drawn;
 * - **the nearest**: for each pixel, the nearest depth within the effects' reach, which is what a
 *   glow's halo or a drop shadow is given, so the halo round the part of a model that is hidden is
 *   hidden with it. Found in two sweeps, across and then down, so it costs the reach and not its
 *   square.
 *
 * The layer is then laid in three parts, each where the others are not: where the things were drawn
 * and are more there than not, tested and written at their own depth; what the effects drew round
 * them, and what they left faint of them, tested at the nearest depth and not written, so a faint
 * halo does not hide a model drawn after it; and the rest, far from anything with depth, laid over
 * what is there as before. The halo may be laid later than the rest, after the solid models that
 * come straight after it (see `deepLayerOrder`).
 *
 * Only a filter that holds something with depth asks for any of this; one over 2D things is drawn as
 * it always was, and a game with none never builds it.
 *
 * @internal
 */
export type TFilterDepth = {
    /** Starts a frame that keeps the depth of `count` filters. */
    beginFrame(count: number): void;
    /**
     * Makes the two pictures for one filter from the depth of the pass that drew what it holds, and
     * keeps them under the filter's picture, for its layer.
     */
    keep(encoder: GPUCommandEncoder, depth: GPUTexture, region: { x: number; y: number; width: number; height: number }, reach: number, picture: ITexture): void;
    /** What binds the two pictures kept for a filter's picture this frame, `null` if none were. */
    layerGroup(picture: ITexture): GPUBindGroup | null;
    /** The pipeline that lays one part of a layer with its depth. */
    layerPipeline(part: TLayerPart): GPURenderPipeline;
    /** Lets go of the pictures no frame has used in a while. */
    endFrame(): void;
    destroy(): void;
};


/** Read exactly as the pass wrote it, and written back from the layer the same. */
const KEPT_FORMAT: GPUTextureFormat = 'depth32float';

/**
 * How far, in real pixels, the nearest depth is looked for. Past this a halo is laid over what is
 * there, as one without depth is: by then it is faint, and the sweep would cost more than it shows.
 */
const MOST_REACH = 64;

/** How many frames in a row pictures go unused before they are let go of. */
const SPARE_FRAMES = 180;

/** One slot of the sweeps' numbers: the smallest offset a card takes. */
const STEP_SLOT = 256;

const FULL_TRIANGLE = /* wgsl */ `
struct Job {
    offset: vec2i,
    reach: i32,
    across: u32,
};

@group(0) @binding(1) var<uniform> job: Job;

@vertex
fn vs(@builtin(vertex_index) index: u32) -> @builtin(position) vec4f {
    let corner = vec2f(f32((index << 1u) & 2u), f32(index & 2u));
    return vec4f(corner * 2.0 - 1.0, 0.0, 1.0);
}
`;

/**
 * The pass's depth, read at the region's pixels. Off the pass, nothing was drawn: far. With samples,
 * the first one is read, which is where a model is when it covers the pixel at all.
 */
const copyShader = (multisampled: boolean): string => /* wgsl */ `
@group(0) @binding(0) var source: ${multisampled ? 'texture_depth_multisampled_2d' : 'texture_depth_2d'};
${FULL_TRIANGLE}
@fragment
fn fs(@builtin(position) at: vec4f) -> @builtin(frag_depth) f32 {
    let pixel = vec2i(at.xy) + job.offset;
    let size = vec2i(textureDimensions(source));
    if (any(pixel < vec2i(0)) || any(pixel >= size)) {
        return 1.0;
    }
    return textureLoad(source, pixel, 0);
}
`;

/** The nearest depth within `reach` pixels, across or down. */
const SPREAD_SHADER = /* wgsl */ `
@group(0) @binding(0) var source: texture_depth_2d;
${FULL_TRIANGLE}
@fragment
fn fs(@builtin(position) at: vec4f) -> @builtin(frag_depth) f32 {
    let pixel = vec2i(at.xy);
    let size = vec2i(textureDimensions(source));
    let along = select(vec2i(0, 1), vec2i(1, 0), job.across == 1u);
    var nearest = 1.0;
    for (var k = -job.reach; k <= job.reach; k++) {
        let other = pixel + along * k;
        if (all(other >= vec2i(0)) && all(other < size)) {
            nearest = min(nearest, textureLoad(source, other, 0));
        }
    }
    return nearest;
}
`;

/**
 * A filter's picture over its rectangle of the pass, as the layer without depth lays it, one part at
 * a time: each part draws only where it is the one, at the depth it is given.
 */
const LAYER_SHADER = /* wgsl */ `
struct Place {
    rect: vec4f,
    size: vec2f,
};

struct Laid {
    @location(0) colour: vec4f,
    @builtin(frag_depth) depth: f32,
};

@group(0) @binding(0) var picture: texture_2d<f32>;
@group(0) @binding(1) var<uniform> place: Place;
@group(1) @binding(0) var own: texture_depth_2d;
@group(1) @binding(1) var near: texture_depth_2d;

override PART: u32 = 0u;

@vertex
fn vs(@builtin(vertex_index) index: u32) -> @builtin(position) vec4f {
    let corner = vec2f(f32(index & 1u), f32((index >> 1u) & 1u));
    let pixel = place.rect.xy + corner * place.rect.zw;
    let clip = pixel / place.size * 2.0 - 1.0;
    return vec4f(clip.x, -clip.y, 0.0, 1.0);
}

@fragment
fn fs(@builtin(position) at: vec4f) -> Laid {
    let size = vec2i(textureDimensions(picture));
    let pixel = clamp(vec2i(at.xy) - vec2i(place.rect.xy), vec2i(0), size - 1);
    let colour = textureLoad(picture, pixel, 0);
    let mine = textureLoad(own, pixel, 0);
    let nearest = textureLoad(near, pixel, 0);
    // Where a model is, and the effects left it more there than not: what hides what is behind.
    let solid = mine < 1.0 && colour.a >= 0.5;
    var depth = mine;
    if (PART == 0u && !solid) {
        discard;
    }
    if (PART == 1u) {
        if (solid || (mine >= 1.0 && nearest >= 1.0)) {
            discard;
        }
        depth = select(nearest, mine, mine < 1.0);
    }
    if (PART == 2u) {
        if (mine < 1.0 || nearest < 1.0) {
            discard;
        }
        depth = 0.0;
    }
    return Laid(colour, depth);
}
`;

const PART_NUMBERS: Record<TLayerPart, number> = { own: 0, near: 1, rest: 2 };

/** How each part meets the depth of the pass it is laid in. */
const PART_DEPTHS: Record<TLayerPart, GPUDepthStencilState> = {
    own: { format: DEPTH_FORMAT, depthWriteEnabled: true, depthCompare: 'less', ...STENCIL_TEST },
    near: { format: DEPTH_FORMAT, depthWriteEnabled: false, depthCompare: 'less', ...STENCIL_TEST },
    rest: FLAT_DEPTH,
};

type TSlot = { width: number; height: number; own: GPUTexture; near: GPUTexture };

/**
 * Makes what keeps a filter's depth and lays its layer with it. `pictureLayout` is what binds a
 * filter's picture and where it goes (the mask pipelines' own), shared with the layer without depth.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const createFilterDepth = (
    device: GPUDevice,
    format: GPUTextureFormat,
    samples: number,
    pictureLayout: GPUBindGroupLayout,
): TFilterDepth => {
    const jobEntry: GPUBindGroupLayoutEntry = {
        binding: 1, visibility: GPUShaderStage.FRAGMENT, buffer: { type: 'uniform', hasDynamicOffset: true, minBindingSize: 16 },
    };
    const copyLayout = device.createBindGroupLayout({
        label: 'filter depth copy',
        entries: [{ binding: 0, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: 'depth', multisampled: samples > 1 } }, jobEntry],
    });
    const spreadLayout = device.createBindGroupLayout({
        label: 'filter depth spread',
        entries: [{ binding: 0, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: 'depth' } }, jobEntry],
    });
    const pairLayout = device.createBindGroupLayout({
        label: 'filter depth pair',
        entries: [
            { binding: 0, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: 'depth' } },
            { binding: 1, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: 'depth' } },
        ],
    });
    // Writes the depth it was given and nothing else.
    const sweep = (label: string, code: string, layout: GPUBindGroupLayout): GPURenderPipeline => {
        const module = device.createShaderModule({ label, code });
        return device.createRenderPipeline({
            label,
            layout: device.createPipelineLayout({ label, bindGroupLayouts: [layout] }),
            vertex: { module, entryPoint: 'vs' },
            fragment: { module, entryPoint: 'fs', targets: [] },
            primitive: { topology: 'triangle-list' },
            depthStencil: { format: KEPT_FORMAT, depthWriteEnabled: true, depthCompare: 'always' },
        });
    };
    const copy = sweep('filter depth copy', copyShader(samples > 1), copyLayout);
    const spread = sweep('filter depth spread', SPREAD_SHADER, spreadLayout);
    const layerModule = device.createShaderModule({ label: 'filter layer with depth shader', code: LAYER_SHADER });
    const layerLayout = device.createPipelineLayout({ label: 'filter layer with depth layout', bindGroupLayouts: [pictureLayout, pairLayout] });
    const layers = new Map<TLayerPart, GPURenderPipeline>();

    const slots: TSlot[] = [];
    // The picture between the two sweeps, one per size: used and done with inside one filter.
    const between = new Map<string, GPUTexture>();
    const betweenUsed = new Set<string>();
    const laid = new Map<ITexture, GPUBindGroup>();
    const job = new Int32Array(4);
    let jobs: GPUBuffer | null = null;
    let capacity = 0;
    let used = 0;
    let idle = 0;

    const depthPicture = (label: string, width: number, height: number): GPUTexture => device.createTexture({
        label,
        size: { width, height },
        format: KEPT_FORMAT,
        usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
    });

    const slotFor = (index: number, width: number, height: number): TSlot => {
        const existing = slots[index];
        if (existing !== undefined && existing.width === width && existing.height === height) {
            return existing;
        }
        existing?.own.destroy();
        existing?.near.destroy();
        const slot = { width, height, own: depthPicture('filter depth own', width, height), near: depthPicture('filter depth near', width, height) };
        slots[index] = slot;
        return slot;
    };

    const betweenFor = (width: number, height: number): GPUTexture => {
        const key = `${width}x${height}`;
        betweenUsed.add(key);
        let texture = between.get(key);
        if (texture === undefined) {
            texture = depthPicture('filter depth between', width, height);
            between.set(key, texture);
        }
        return texture;
    };

    // One job: `source` read through `pipeline` into `into`, with its numbers in slot `slot`.
    const run = (
        encoder: GPUCommandEncoder, pipeline: GPURenderPipeline, layout: GPUBindGroupLayout,
        source: GPUTextureView, into: GPUTexture, slot: number,
        offsetX: number, offsetY: number, reach: number, across: boolean,
    ): void => {
        job[0] = offsetX;
        job[1] = offsetY;
        job[2] = reach;
        job[3] = across ? 1 : 0;
        device.queue.writeBuffer(jobs!, slot * STEP_SLOT, job);
        const group = device.createBindGroup({
            label: 'filter depth job',
            layout,
            entries: [{ binding: 0, resource: source }, { binding: 1, resource: { buffer: jobs!, offset: 0, size: 16 } }],
        });
        const pass = encoder.beginRenderPass({
            label: 'filter depth',
            colorAttachments: [],
            depthStencilAttachment: { view: into.createView(), depthClearValue: 1, depthLoadOp: 'clear', depthStoreOp: 'store' },
        });
        pass.setPipeline(pipeline);
        pass.setBindGroup(0, group, [slot * STEP_SLOT]);
        pass.draw(3);
        pass.end();
    };

    return {
        beginFrame: (count) => {
            used = 0;
            laid.clear();
            // Three jobs a filter, each with numbers of its own: none is sent before the next is
            // written, so they cannot share.
            if (count * 3 > capacity) {
                jobs?.destroy();
                capacity = Math.max(6, count * 3);
                jobs = device.createBuffer({ label: 'filter depth jobs', size: capacity * STEP_SLOT, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
            }
        },
        keep: (encoder, depth, region, reach, picture) => {
            if (jobs === null || used * 3 + 3 > capacity) {
                return;
            }
            const index = used++;
            const slot = slotFor(index, region.width, region.height);
            const far = Math.min(MOST_REACH, Math.max(0, Math.floor(reach)));
            run(encoder, copy, copyLayout, depth.createView({ aspect: 'depth-only' }), slot.own, index * 3, region.x, region.y, 0, false);
            if (far > 0) {
                const half = betweenFor(region.width, region.height);
                run(encoder, spread, spreadLayout, slot.own.createView(), half, index * 3 + 1, 0, 0, far, true);
                run(encoder, spread, spreadLayout, half.createView(), slot.near, index * 3 + 2, 0, 0, far, false);
            }
            laid.set(picture, device.createBindGroup({
                label: 'filter depth pair',
                layout: pairLayout,
                entries: [
                    { binding: 0, resource: slot.own.createView() },
                    // With no reach, the nearest depth is each pixel's own.
                    { binding: 1, resource: (far > 0 ? slot.near : slot.own).createView() },
                ],
            }));
        },
        layerGroup: (picture) => laid.get(picture) ?? null,
        layerPipeline: (part) => {
            let pipeline = layers.get(part);
            if (pipeline === undefined) {
                pipeline = device.createRenderPipeline({
                    label: `filter layer with depth, ${part}`,
                    layout: layerLayout,
                    vertex: { module: layerModule, entryPoint: 'vs' },
                    fragment: {
                        module: layerModule,
                        entryPoint: 'fs',
                        constants: { PART: PART_NUMBERS[part] },
                        // Its colour is already multiplied by its alpha, which is what laying it over asks for.
                        targets: [{
                            format,
                            blend: {
                                color: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha', operation: 'add' },
                                alpha: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha', operation: 'add' },
                            },
                        }],
                    },
                    primitive: { topology: 'triangle-strip' },
                    depthStencil: PART_DEPTHS[part],
                    multisample: { count: samples },
                });
                layers.set(part, pipeline);
            }
            return pipeline;
        },
        endFrame: () => {
            const spare = slots.length > used || between.size > betweenUsed.size;
            idle = spare ? idle + 1 : 0;
            if (idle >= SPARE_FRAMES) {
                for (const slot of slots.splice(used)) {
                    slot.own.destroy();
                    slot.near.destroy();
                }
                for (const [key, texture] of between) {
                    if (!betweenUsed.has(key)) {
                        texture.destroy();
                        between.delete(key);
                    }
                }
                idle = 0;
            }
            betweenUsed.clear();
        },
        destroy: () => {
            for (const slot of slots.splice(0)) {
                slot.own.destroy();
                slot.near.destroy();
            }
            for (const texture of between.values()) {
                texture.destroy();
            }
            between.clear();
            jobs?.destroy();
            jobs = null;
        },
    };
};
