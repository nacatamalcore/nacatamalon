import { DEPTH_FORMAT } from '../frame/depth';
import { LINE_VERTEX_FLOATS } from '../../shared/line_vertex';
import { LINES_SHADER } from './lines_shader';
import type { TCameraSpace } from '../../shared/compute_mvp_3d';

/**
 * How many corners a frame can hold before the buffer has to grow.
 */
const INITIAL_CAPACITY = 1024;

/**
 * Straight alpha, so a line can be faded out by its colour.
 */
const ALPHA_BLEND: GPUBlendState = {
    color: { srcFactor: 'src-alpha', dstFactor: 'one-minus-src-alpha', operation: 'add' },
    alpha: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha', operation: 'add' },
};

/**
 * What the card reads per corner: where it is, then its colour.
 */
const VERTEX_LAYOUT: GPUVertexBufferLayout = {
    arrayStride: LINE_VERTEX_FLOATS * 4,
    attributes: [
        { shaderLocation: 0, offset: 0, format: 'float32x3' },
        { shaderLocation: 1, offset: 3 * 4, format: 'float32x4' },
    ],
};

/**
 * Depth for lines: **tested and written**, the same as a model.
 *
 * Tested, so a model in front hides the line. Written, so the line hides what is drawn behind it
 * afterwards: lines and models are drawn in the order they were made, and a line that did not write
 * would be painted over by a model further away that happened to be made later.
 */
const LINE_DEPTH: GPUDepthStencilState = {
    format: DEPTH_FORMAT,
    depthWriteEnabled: true,
    depthCompare: 'less',
};

/**
 * One view's block: the projection over the view.
 */
const VIEW_SLOT = 256;
const VIEW_FLOATS = 16;

/**
 * What every set of lines in this game is drawn with.
 *
 * **One buffer for all of them**, not one each, the way the particles do it: a set owns nothing
 * here, so destroying one has nothing to give back. Each writes its corners at an offset of its own
 * and draws from there.
 *
 * Built the first time a frame has lines in it, so a game with none never pays for it.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const createLinesPipeline = (device: GPUDevice, format: GPUTextureFormat, samples: number) => {
    const module = device.createShaderModule({ label: 'lines', code: LINES_SHADER });
    const viewLayout = device.createBindGroupLayout({
        label: 'lines view layout',
        entries: [{ binding: 0, visibility: GPUShaderStage.VERTEX, buffer: { type: 'uniform' } }],
    });
    const pipeline = device.createRenderPipeline({
        label: 'lines',
        layout: device.createPipelineLayout({ label: 'lines pipeline layout', bindGroupLayouts: [viewLayout] }),
        vertex: { module, entryPoint: 'vs', buffers: [VERTEX_LAYOUT] },
        fragment: { module, entryPoint: 'fs', targets: [{ format, blend: ALPHA_BLEND }] },
        primitive: { topology: 'line-list' },
        depthStencil: LINE_DEPTH,
        multisample: { count: samples },
    });

    // One block per scene seen in depth, written once a pass, whatever number of sets read it.
    let viewCapacity = 4;
    let views = device.createBuffer({
        label: 'lines views',
        size: viewCapacity * VIEW_SLOT,
        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });
    let viewGroups: GPUBindGroup[] = [];

    let capacity = INITIAL_CAPACITY;
    let corners = device.createBuffer({
        label: 'line corners',
        size: capacity * LINE_VERTEX_FLOATS * 4,
        usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
    });
    let written = 0;

    return {
        pipeline,
        get buffer(): GPUBuffer {
            return corners;
        },

        /**
         * Makes room for every corner this frame will draw, **before any draw is recorded**: a buffer
         * that grew in the middle would leave the draws already recorded pointing at nothing.
         */
        beginFrame: (count: number): void => {
            written = 0;
            if (count <= capacity) {
                return;
            }
            while (capacity < count) {
                capacity *= 2;
            }
            corners.destroy();
            corners = device.createBuffer({
                label: 'line corners',
                size: capacity * LINE_VERTEX_FLOATS * 4,
                usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
            });
        },

        /**
         * Writes how each scene in depth is seen, one block each, before anything reads them.
         */
        writeViews: (spaces: readonly TCameraSpace[]): void => {
            if (spaces.length > viewCapacity) {
                while (viewCapacity < spaces.length) {
                    viewCapacity *= 2;
                }
                views.destroy();
                views = device.createBuffer({
                    label: 'lines views',
                    size: viewCapacity * VIEW_SLOT,
                    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
                });
                viewGroups = [];
            }
            for (let i = 0; i < spaces.length; i++) {
                device.queue.writeBuffer(views, i * VIEW_SLOT, spaces[i].viewProjection);
            }
        },

        /**
         * The group that points at view `slot`'s block.
         */
        viewGroup: (slot: number): GPUBindGroup => {
            viewGroups[slot] ??= device.createBindGroup({
                label: `lines view ${slot}`,
                layout: viewLayout,
                entries: [{ binding: 0, resource: { buffer: views, offset: slot * VIEW_SLOT, size: VIEW_FLOATS * 4 } }],
            });
            return viewGroups[slot];
        },

        /**
         * Puts one set's corners in the buffer and says where they went.
         */
        write: (data: Float32Array, count: number): number => {
            const at = written;
            device.queue.writeBuffer(corners, at * LINE_VERTEX_FLOATS * 4, data, 0, count * LINE_VERTEX_FLOATS);
            written += count;
            return at;
        },

        destroy: (): void => {
            corners.destroy();
            views.destroy();
        },
    };
};

/**
 * Everything this backend keeps for its lines.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TLinesPipeline = ReturnType<typeof createLinesPipeline>;
