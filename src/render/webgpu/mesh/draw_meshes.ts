import { fillLightUniforms, fillMeshUniforms, LIGHT_UNIFORM_FLOATS, MESH_UNIFORM_FLOATS } from '../../shared';
import { isTransparentMesh } from '../../shared/is_transparent_mesh';
import { textureWrapOf, wrapKey } from '../../shared/texture_wrap';
import { toGpuBuffer } from '../resources';
import { toGpuTexture } from '../texture';
import { LIGHT_STRIDE, MESH_STRIDE } from './create_mesh_pipeline';
import type { TCameraSpace } from '../../shared/compute_mvp_3d';
import type { TDrawMesh, TDrawView3d } from '../../interface';
import type { TShadowUniforms } from '../../shared/fill_light_uniforms';
import type { TMeshPipeline } from './types/t_mesh_pipeline';

/**
 * The picture of a model, read the way it asked (its filter, and what it does past its edge), made
 * the first time that pairing is drawn.
 */
const textureBindGroup = (device: GPUDevice, meshes: TMeshPipeline, mesh: TDrawMesh): GPUBindGroup => {
    const filter = (mesh.material.smooth ?? meshes.defaultSmooth) ? 'linear' : 'nearest';
    const ready = mesh.material.texture !== null && mesh.material.texture.status === 'ready' && mesh.material.texture.gpu !== null;
    const gpuTexture = ready ? toGpuTexture(mesh.material.texture!.gpu!) : null;
    if (gpuTexture === null) {
        // One white pixel reads the same whatever it does past its edge.
        return meshes.whiteBindGroups[filter];
    }

    const { u, v } = textureWrapOf(mesh.material);
    const key = wrapKey(filter, u, v);
    let cached = meshes.textureBindGroups.get(gpuTexture);
    if (cached === undefined) {
        cached = new Map();
        meshes.textureBindGroups.set(gpuTexture, cached);
    }
    let group = cached.get(key);
    if (group === undefined) {
        group = device.createBindGroup({
            layout: meshes.layouts.texture,
            entries: [{ binding: 0, resource: meshes.wrapSamplers.get(key)! }, { binding: 1, resource: gpuTexture.createView() }],
        });
        cached.set(key, group);
    }
    return group;
};

/**
 * Makes room for more of something than the buffer holds, doubling so it settles after a frame or two.
 */
const grow = (device: GPUDevice, slots: TMeshPipeline['meshes'], needed: number, stride: number, label: string): void => {
    let capacity = slots.capacity;
    while (capacity < needed) {
        capacity *= 2;
    }
    slots.buffer.destroy();
    slots.buffer = device.createBuffer({ label, size: capacity * stride, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
    slots.data = new Float32Array(capacity * stride / 4);
    slots.capacity = capacity;
    // The groups that are gone pointed at the buffer that just went.
    slots.bindGroups = [];
};

/**
 * Writes each scene's lights into their own slot, once for the whole frame.
 *
 * Per scene and not per frame because scenes stack, and per frame and not per model because every
 * model in a scene is lit by the same lamps: that is the whole reason the lights are a block of
 * their own.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const writeMeshLights = (
    device: GPUDevice,
    meshes: TMeshPipeline,
    views: readonly TDrawView3d[],
    shadow: TShadowUniforms | null = null,
    shadowView: GPUTextureView | null = null,
): void => {
    if (views.length === 0) {
        return;
    }
    if (views.length > meshes.lights.capacity) {
        grow(device, meshes.lights, views.length, LIGHT_STRIDE, 'mesh lights');
    }

    // The map the groups below will point at, and whether that is a change. A group is made once
    // and kept, so the frame a shadow first appears is the frame they all have to be made again.
    const map = shadowView ?? meshes.lights.blankShadow;
    if (meshes.lights.boundShadow !== map) {
        meshes.lights.boundShadow = map;
        meshes.lights.bindGroups = [];
    }

    const floats = meshes.lights.data;
    views.forEach((view, index) => {
        const at = index * LIGHT_STRIDE / 4;
        // Only the scene the shadow was drawn for is told about it. Another scene stacked over it
        // has its own lights and its own numbering, so the index would point at a different lamp.
        const its = shadow !== null && shadow.view === view ? shadow : null;
        fillLightUniforms(floats.subarray(at, at + LIGHT_UNIFORM_FLOATS), view.lights, view.ambient, its, view.fog ?? null);

        if (meshes.lights.bindGroups[index] === undefined) {
            meshes.lights.bindGroups[index] = device.createBindGroup({
                label: `mesh lights ${index}`,
                layout: meshes.layouts.lights,
                entries: [
                    { binding: 0, resource: { buffer: meshes.lights.buffer, offset: index * LIGHT_STRIDE, size: LIGHT_UNIFORM_FLOATS * 4 } },
                    { binding: 1, resource: map },
                    { binding: 2, resource: meshes.lights.shadowSampler },
                ],
            });
        }
    });

    device.queue.writeBuffer(meshes.lights.buffer, 0, floats, 0, views.length * LIGHT_STRIDE / 4);
};

/**
 * Makes room for this frame's models, before any of them is written.
 *
 * Counted first and grown once, because growing throws away the buffer the slots already written
 * were pointing at.
 *
 * @internal
 */
export const reserveMeshSlots = (device: GPUDevice, meshes: TMeshPipeline, needed: number): void => {
    if (needed > meshes.meshes.capacity) {
        grow(device, meshes.meshes, needed, MESH_STRIDE, 'mesh uniforms');
    }
};

/**
 * The group pointing at one skeleton's bones, made the first time they are drawn.
 *
 * Remade when the run of bones is a different one, which happens when a rig changed size: the group
 * would otherwise still point at a buffer nobody writes to any more.
 */
const jointBindGroup = (device: GPUDevice, meshes: TMeshPipeline, skeleton: NonNullable<TDrawMesh['skeleton']>): GPUBindGroup => {
    const buffer = meshes.joints.upload(skeleton);
    const held = meshes.jointBindGroups.get(skeleton.key);
    if (held !== undefined && held.buffer === buffer) {
        return held.group;
    }

    const group = device.createBindGroup({
        label: `skeleton ${skeleton.key}`,
        layout: meshes.layouts.joints,
        entries: [{ binding: 0, resource: { buffer } }],
    });
    meshes.jointBindGroups.set(skeleton.key, { group, buffer });
    return group;
};

/**
 * Draws one model: its numbers into its own slot, then the shape.
 *
 * A slot per **draw** and not per model: a model drawn in two passes is two sets of numbers, and
 * one slot would have the second overwrite the first before either had been sent.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const drawMesh = (
    device: GPUDevice,
    pass: GPURenderPassEncoder,
    meshes: TMeshPipeline,
    mesh: TDrawMesh,
    space: TCameraSpace,
    viewSlot: number,
    slot: number,
    width: number,
    height: number,
    time: number,
): boolean => {
    const geometry = mesh.geometry;
    if (geometry === null || geometry.vertexBuffer === null || geometry.colorBuffer === null || geometry.indexBuffer === null || geometry.indexCount === 0) {
        return false;
    }
    // A picture that has not arrived: nothing is drawn, rather than a shape in a colour it will
    // stop being a moment later.
    if (mesh.material.texture !== null && mesh.material.texture.status === 'loading') {
        return false;
    }

    const at = slot * MESH_STRIDE / 4;
    // Written at an offset rather than through a slice of it: a slice is an object, and one per
    // model per frame is the last thing this path was still making.
    fillMeshUniforms(meshes.meshes.data, at, mesh, space);
    device.queue.writeBuffer(meshes.meshes.buffer, slot * MESH_STRIDE, meshes.meshes.data, at, MESH_UNIFORM_FLOATS);

    if (meshes.meshes.bindGroups[slot] === undefined) {
        meshes.meshes.bindGroups[slot] = device.createBindGroup({
            label: `mesh uniforms ${slot}`,
            layout: meshes.layouts.uniforms,
            entries: [{ binding: 0, resource: { buffer: meshes.meshes.buffer, offset: slot * MESH_STRIDE, size: MESH_UNIFORM_FLOATS * 4 } }],
        });
    }

    // Bones and the corners that name them have to arrive together: a model with one and not the
    // other would read whichever corners happened to be bound and scatter.
    const bends = mesh.skeleton !== null && geometry.skinBuffer !== null;

    // A model that bends never takes the effect path, and that is a real limit rather than an
    // oversight: the bone blend lives in the built-in corner stage, and letting an author move a
    // corner as well would mean a third shader that does both.
    const surface = mesh.material;
    const custom = !bends && (surface.fragment !== null || surface.vertex !== null)
        ? meshes.materials.get(surface)
        : null;
    const effect = custom !== null && !custom.failed && custom.pipeline !== null ? custom : null;

    // A see-through model takes the twin that writes no depth. The frame already put it after the
    // solid ones, furthest first; this is the half of that only the card can do.
    const glass = isTransparentMesh(mesh);
    const pipeline = effect !== null
        ? (glass ? effect.transparentPipeline : effect.pipeline)!
        : bends
            ? (glass ? meshes.transparentSkinnedPipeline : meshes.skinnedPipeline)
            : (glass ? meshes.transparentPipeline : meshes.pipeline);
    pass.setPipeline(pipeline);
    // Its own scene's lights. A model always belongs to one: a scene with models had its lighting
    // worked out when the frame was put together.
    pass.setBindGroup(0, meshes.lights.bindGroups[Math.max(viewSlot, 0)]);
    pass.setBindGroup(1, textureBindGroup(device, meshes, mesh));
    pass.setBindGroup(2, meshes.meshes.bindGroups[slot]);
    pass.setVertexBuffer(0, toGpuBuffer(geometry.vertexBuffer));
    pass.setVertexBuffer(1, toGpuBuffer(geometry.colorBuffer));

    if (bends) {
        pass.setBindGroup(3, jointBindGroup(device, meshes, mesh.skeleton!));
        pass.setVertexBuffer(2, toGpuBuffer(geometry.skinBuffer!));
    } else if (effect !== null) {
        // The same group number the bones would have used, which is free precisely because the two
        // can never be wanted at once.
        pass.setBindGroup(meshes.materials.group, meshes.materials.bind(
            effect, surface.uniforms ?? {}, null, time, width, height,
        ));
    }

    pass.setIndexBuffer(toGpuBuffer(geometry.indexBuffer), geometry.indexType);
    pass.drawIndexed(geometry.indexCount);
    return true;
};
