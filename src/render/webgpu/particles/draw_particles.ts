import { getTextureBindGroup } from '../sprite/get_texture_bind_group';
import { PARTICLE_FLOATS } from '../../shared/particle_instance';
import { toGpuTexture } from '../texture';
import type { TDrawItem, TDrawParticles, TDrawParticles3d } from '../../interface';
import type { TParticlesPipeline } from './create_particles_pipeline';
import type { TSpritePipeline } from '../sprite/types/t_sprite_pipeline';

/**
 * An emitter's particles and those of every effect they set off, however deep.
 */
const countWithChildren = (item: TDrawParticles | TDrawParticles3d): number => {
    let total = item.count;
    for (const child of item.children ?? []) {
        total += countWithChildren(child);
    }
    return total;
};

/**
 * How many particles this frame will draw, counted **before** anything is recorded.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const countParticles = (drawables: readonly TDrawItem[]): number => {
    let total = 0;
    for (const item of drawables) {
        if (item.type === 'particles' || item.type === 'particles3d') {
            total += countWithChildren(item);
        }
    }
    return total;
};

/**
 * Draws one emitter's particles: one call, however many it is holding.
 *
 * The whole lot goes in one draw, which is worth saying plainly because it is a real limit of the
 * model and not an oversight: **nothing can be put between two particles of one emitter.** Two
 * clouds that have to interleave are two emitters with different `zIndex`.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
const drawOneEmitter = (
    device: GPUDevice,
    gpuPass: GPURenderPassEncoder,
    particles: TParticlesPipeline,
    sprites: TSpritePipeline,
    item: TDrawParticles,
): void => {
    if (item.count === 0) {
        return;
    }

    // No picture yet is drawn as a white square the colour tints, rather than not drawn at all: an
    // effect you can see and tune beats a blank screen while an image is still on its way.
    const texture = item.texture;
    const ready = texture !== null && texture.status === 'ready' && texture.gpu !== null;
    const smooth = item.smooth ?? sprites.defaultSmooth;
    const group = ready
        ? getTextureBindGroup(device, sprites, toGpuTexture(texture.gpu!), smooth)
        : sprites.whiteBindGroup;

    const at = particles.write(item.instances, item.count);

    gpuPass.setPipeline(particles.pipelineFor(item.blend));
    gpuPass.setBindGroup(0, sprites.bindGroup);
    gpuPass.setBindGroup(1, group);
    gpuPass.setVertexBuffer(0, sprites.quad);
    // Its own stretch of the one shared buffer. The offset is what lets every emitter live in one
    // buffer without two of them writing over each other before the frame is submitted.
    gpuPass.setVertexBuffer(1, particles.buffer, at * PARTICLE_FLOATS * 4, item.count * PARTICLE_FLOATS * 4);
    gpuPass.draw(4, item.count);
};

/**
 * Draws one emitter's particles in three dimensions, seen through view `view`'s block.
 *
 * The same picture rule, the same one shared buffer and the same offset as a flat emitter. What
 * changes is the pipeline, which faces each square to the camera and tests depth, and group 0, which
 * is the scene's camera rather than the flat views.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
const drawOneEmitter3d = (
    device: GPUDevice,
    gpuPass: GPURenderPassEncoder,
    particles: TParticlesPipeline,
    sprites: TSpritePipeline,
    item: TDrawParticles3d,
    view: number,
): void => {
    if (item.count === 0 || view < 0) {
        return;
    }

    const texture = item.texture;
    const ready = texture !== null && texture.status === 'ready' && texture.gpu !== null;
    const smooth = item.smooth ?? sprites.defaultSmooth;
    const group = ready
        ? getTextureBindGroup(device, sprites, toGpuTexture(texture.gpu!), smooth)
        : sprites.whiteBindGroup;

    const at = particles.write(item.instances, item.count);

    gpuPass.setPipeline(particles.pipeline3dFor(item.blend));
    gpuPass.setBindGroup(0, particles.viewGroup(view));
    gpuPass.setBindGroup(1, group);
    gpuPass.setVertexBuffer(0, sprites.quad);
    gpuPass.setVertexBuffer(1, particles.buffer, at * PARTICLE_FLOATS * 4, item.count * PARTICLE_FLOATS * 4);
    gpuPass.draw(4, item.count);
};

/**
 * Draws an emitter and then every effect its particles set off, each in a call of its own.
 *
 * The children are drawn even when the emitter has nothing left of its own: a rocket that has burnt
 * out still has its sparks in the air.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const drawParticles = (
    device: GPUDevice,
    gpuPass: GPURenderPassEncoder,
    particles: TParticlesPipeline,
    sprites: TSpritePipeline,
    item: TDrawParticles,
): void => {
    drawOneEmitter(device, gpuPass, particles, sprites, item);
    for (const child of item.children ?? []) {
        drawParticles(device, gpuPass, particles, sprites, child);
    }
};

/**
 * The same in depth, through the same view as its emitter.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const drawParticles3d = (
    device: GPUDevice,
    gpuPass: GPURenderPassEncoder,
    particles: TParticlesPipeline,
    sprites: TSpritePipeline,
    item: TDrawParticles3d,
    view: number,
): void => {
    drawOneEmitter3d(device, gpuPass, particles, sprites, item, view);
    for (const child of item.children ?? []) {
        drawParticles3d(device, gpuPass, particles, sprites, child, view);
    }
};
