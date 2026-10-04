import { DEPTH_FORMAT, FLAT_DEPTH } from '../frame/depth';
import { PARTICLE_3D_OFFSET, PARTICLE_FLOATS } from '../../shared/particle_instance';
import { PARTICLES_SHADER } from './particles_shader';
import { PARTICLES_3D_SHADER } from './particles_3d_shader';
import type { TCameraSpace } from '../../shared/compute_mvp_3d';
import type { TParticleBlend } from '../../../loaders/particles';

/**
 * How many a frame can hold before the buffer has to grow.
 */
const INITIAL_CAPACITY = 512;

/**
 * Straight alpha, which is what smoke and dust want: a particle covers what is behind it.
 */
const ALPHA_BLEND: GPUBlendState = {
    color: { srcFactor: 'src-alpha', dstFactor: 'one-minus-src-alpha', operation: 'add' },
    alpha: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha', operation: 'add' },
};

/**
 * Adding light, which is the only way fire and sparks read as bright: two embers over each other
 * should be brighter than one, and under alpha the second is merely nearer.
 *
 * The **alpha channel is left alone** (`zero / one`) rather than added like the colour. Adding it
 * too would drive the opacity of the picture being drawn into past one, and a screen-wide effect
 * reading that picture afterwards would find it half transparent. With post-processing already in
 * the engine, that is not a hypothetical.
 */
const ADDITIVE_BLEND: GPUBlendState = {
    color: { srcFactor: 'src-alpha', dstFactor: 'one', operation: 'add' },
    alpha: { srcFactor: 'zero', dstFactor: 'one', operation: 'add' },
};

/**
 * What the card reads per particle: nine numbers in a run of twelve.
 *
 * Location 0 is the shared quad, so these start at 1, the way a sprite's do.
 */
const INSTANCE_LAYOUT: GPUVertexBufferLayout = {
    arrayStride: PARTICLE_FLOATS * 4,
    stepMode: 'instance',
    attributes: [
        { shaderLocation: 1, offset: 0, format: 'float32x2' },
        { shaderLocation: 2, offset: 2 * 4, format: 'float32' },
        { shaderLocation: 3, offset: 3 * 4, format: 'float32' },
        { shaderLocation: 4, offset: 4 * 4, format: 'float32x4' },
        { shaderLocation: 5, offset: 8 * 4, format: 'float32' },
    ],
};

/**
 * The same run read the way a particle in three dimensions lays it out.
 */
const INSTANCE_3D_LAYOUT: GPUVertexBufferLayout = {
    arrayStride: PARTICLE_FLOATS * 4,
    stepMode: 'instance',
    attributes: [
        { shaderLocation: 1, offset: PARTICLE_3D_OFFSET.x * 4, format: 'float32x3' },
        { shaderLocation: 2, offset: PARTICLE_3D_OFFSET.size * 4, format: 'float32' },
        { shaderLocation: 3, offset: PARTICLE_3D_OFFSET.rotation * 4, format: 'float32' },
        { shaderLocation: 4, offset: PARTICLE_3D_OFFSET.r * 4, format: 'float32x4' },
    ],
};

/**
 * Depth for particles in space: **tested and never written.**
 *
 * Tested, so a particle behind a wall is behind the wall. Not written, so particles do not hide
 * each other: one that wrote depth would cut a square hole through the cloud behind it.
 */
const DEEP_DEPTH: GPUDepthStencilState = {
    format: DEPTH_FORMAT,
    depthWriteEnabled: false,
    depthCompare: 'less',
};

/**
 * One view's block: the projection over the view, and the camera's right and up.
 */
const VIEW_SLOT = 256;
const VIEW_FLOATS = 24;

/**
 * What every emitter in this game is drawn with.
 *
 * **One buffer for all of them**, not one each, and that is what makes forgetting to free something
 * impossible rather than merely unlikely: an emitter owns nothing here, so destroying one has
 * nothing to give back. Each writes its own run at an offset of its own and draws from there.
 *
 * It borrows the sprite pipeline's groups, quad, samplers and texture bindings rather than making
 * its own. A bind group belongs to the layout it was made against, so sharing the layout is what
 * lets the picture a sprite is already drawing be the picture a particle draws, with nothing built
 * twice.
 *
 * The second blend is built only when something asks for it.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const createParticlesPipeline = (
    device: GPUDevice,
    format: GPUTextureFormat,
    samples: number,
    layouts: { frame: GPUBindGroupLayout; texture: GPUBindGroupLayout },
) => {
    const module = device.createShaderModule({ label: 'particles', code: PARTICLES_SHADER });
    const module3d = device.createShaderModule({ label: 'particles 3d', code: PARTICLES_3D_SHADER });
    const viewLayout = device.createBindGroupLayout({
        label: 'particles 3d view layout',
        entries: [{ binding: 0, visibility: GPUShaderStage.VERTEX, buffer: { type: 'uniform' } }],
    });
    const pipelineLayout3d = device.createPipelineLayout({
        label: 'particles 3d pipeline layout',
        bindGroupLayouts: [viewLayout, layouts.texture],
    });
    const pipelineLayout = device.createPipelineLayout({
        label: 'particles pipeline layout',
        bindGroupLayouts: [layouts.frame, layouts.texture],
    });
    const quadLayout: GPUVertexBufferLayout = {
        arrayStride: 2 * 4,
        attributes: [{ shaderLocation: 0, offset: 0, format: 'float32x2' }],
    };

    const built = new Map<TParticleBlend, GPURenderPipeline>();
    const pipelineFor = (blend: TParticleBlend): GPURenderPipeline => {
        let pipeline = built.get(blend);
        if (pipeline === undefined) {
            pipeline = device.createRenderPipeline({
                label: `particles (${blend})`,
                layout: pipelineLayout,
                vertex: { module, entryPoint: 'vs', buffers: [quadLayout, INSTANCE_LAYOUT] },
                fragment: {
                    module,
                    entryPoint: 'fs',
                    targets: [{ format, blend: blend === 'additive' ? ADDITIVE_BLEND : ALPHA_BLEND }],
                },
                primitive: { topology: 'triangle-strip' },
                // Declared and not used, like a sprite's: in the plane the order is the zIndex, and
                // a particle that wrote depth would punch a hole through the cloud behind it, which
                // is precisely what stops smoke looking like smoke.
                depthStencil: FLAT_DEPTH,
                multisample: { count: samples },
            });
            built.set(blend, pipeline);
        }
        return pipeline;
    };

    const built3d = new Map<TParticleBlend, GPURenderPipeline>();
    const pipeline3dFor = (blend: TParticleBlend): GPURenderPipeline => {
        let pipeline = built3d.get(blend);
        if (pipeline === undefined) {
            pipeline = device.createRenderPipeline({
                label: `particles 3d (${blend})`,
                layout: pipelineLayout3d,
                vertex: { module: module3d, entryPoint: 'vs', buffers: [quadLayout, INSTANCE_3D_LAYOUT] },
                fragment: {
                    module: module3d,
                    entryPoint: 'fs',
                    targets: [{ format, blend: blend === 'additive' ? ADDITIVE_BLEND : ALPHA_BLEND }],
                },
                primitive: { topology: 'triangle-strip' },
                depthStencil: DEEP_DEPTH,
                multisample: { count: samples },
            });
            built3d.set(blend, pipeline);
        }
        return pipeline;
    };

    // One block per scene seen in depth, written once a pass, whatever number of emitters read it.
    let viewCapacity = 4;
    let views = device.createBuffer({
        label: 'particles 3d views',
        size: viewCapacity * VIEW_SLOT,
        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });
    let viewGroups: GPUBindGroup[] = [];
    const viewData = new Float32Array(VIEW_FLOATS);

    let capacity = INITIAL_CAPACITY;
    let instances = device.createBuffer({
        label: 'particle instances',
        size: capacity * PARTICLE_FLOATS * 4,
        usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
    });
    let written = 0;

    return {
        pipelineFor,
        get buffer(): GPUBuffer {
            return instances;
        },

        /**
         * Makes room for every particle this frame will draw, **before any draw is recorded**.
         *
         * A buffer that grew in the middle would throw away the one the draws already recorded were
         * pointing at, and they would find nothing there at the moment of submitting. The same trap
         * models, maps, materials and screen effects all avoid the same way.
         */
        beginFrame: (count: number): void => {
            written = 0;
            if (count <= capacity) {
                return;
            }
            while (capacity < count) {
                capacity *= 2;
            }
            instances.destroy();
            instances = device.createBuffer({
                label: 'particle instances',
                size: capacity * PARTICLE_FLOATS * 4,
                usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
            });
        },

        /**
         * Writes how each scene in depth is seen, one block each, before anything reads them.
         *
         * Grown the same way the particle buffer is, and for the same reason: the groups made for
         * the old one would point at nothing.
         */
        writeViews: (spaces: readonly TCameraSpace[]): void => {
            if (spaces.length > viewCapacity) {
                while (viewCapacity < spaces.length) {
                    viewCapacity *= 2;
                }
                views.destroy();
                views = device.createBuffer({
                    label: 'particles 3d views',
                    size: viewCapacity * VIEW_SLOT,
                    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
                });
                viewGroups = [];
            }
            for (let i = 0; i < spaces.length; i++) {
                const space = spaces[i];
                viewData.set(space.viewProjection, 0);
                viewData[16] = space.right[0];
                viewData[17] = space.right[1];
                viewData[18] = space.right[2];
                viewData[20] = space.up[0];
                viewData[21] = space.up[1];
                viewData[22] = space.up[2];
                device.queue.writeBuffer(views, i * VIEW_SLOT, viewData);
            }
        },

        /**
         * The group that points at view `slot`'s block.
         */
        viewGroup: (slot: number): GPUBindGroup => {
            viewGroups[slot] ??= device.createBindGroup({
                label: `particles 3d view ${slot}`,
                layout: viewLayout,
                entries: [{ binding: 0, resource: { buffer: views, offset: slot * VIEW_SLOT, size: VIEW_FLOATS * 4 } }],
            });
            return viewGroups[slot];
        },

        pipeline3dFor,

        /**
         * Puts one emitter's particles in the buffer and says where they went.
         */
        write: (data: Float32Array, count: number): number => {
            const at = written;
            device.queue.writeBuffer(instances, at * PARTICLE_FLOATS * 4, data, 0, count * PARTICLE_FLOATS);
            written += count;
            return at;
        },

        destroy: (): void => {
            instances.destroy();
            views.destroy();
            built.clear();
            built3d.clear();
        },
    };
};

/**
 * Everything this backend keeps for its particles.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TParticlesPipeline = ReturnType<typeof createParticlesPipeline>;
