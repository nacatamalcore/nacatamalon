// everyframe
import { toGpuBuffer } from '../resources';
import { toGpuTexture } from '../texture';
import { LAYER_FLOATS, LAYER_STRIDE } from './create_tilemap_pipeline';
import { MAX_VIEWS } from '../sprite/write_sprite_instance';
import type { TDrawTilemapLayer } from '../../interface';
import type { TTilemapPipeline } from './types/t_tilemap_pipeline';
import { worldOf } from '../../shared/world_of';

/**
 * The sheet of a layer, read the way it asked, made the first time that pairing is drawn.
 */
const textureBindGroup = (device: GPUDevice, tilemaps: TTilemapPipeline, texture: GPUTexture, smooth: boolean): GPUBindGroup => {
    const filter = smooth ? 'linear' : 'nearest';
    let cached = tilemaps.textureBindGroups.get(texture);
    if (cached === undefined) {
        cached = {};
        tilemaps.textureBindGroups.set(texture, cached);
    }
    const existing = cached[filter];
    if (existing !== undefined) {
        return existing;
    }

    const group = device.createBindGroup({
        label: `tilemap texture bind group (${filter})`,
        layout: tilemaps.layouts.texture,
        entries: [
            { binding: 0, resource: tilemaps.samplers[filter] },
            { binding: 1, resource: texture.createView() },
        ],
    });
    cached[filter] = group;
    return group;
};

/**
 * Makes room for more layers than the buffer holds, doubling so it settles after a few frames.
 */
const growLayers = (device: GPUDevice, tilemaps: TTilemapPipeline, needed: number): void => {
    let capacity = tilemaps.layerUniforms.capacity;
    while (capacity < needed) {
        capacity *= 2;
    }
    tilemaps.layerUniforms.buffer.destroy();
    tilemaps.layerUniforms.buffer = device.createBuffer({
        label: 'tilemap layers',
        size: capacity * LAYER_STRIDE,
        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });
    tilemaps.layerUniforms.data = new Float32Array(capacity * LAYER_STRIDE / 4);
    tilemaps.layerUniforms.capacity = capacity;
    // The old groups pointed at the buffer that just went.
    tilemaps.layerBindGroups = [];
};

/**
 * Writes one layer's own numbers into its slot of the shared buffer, and hands back the group that
 * points at that slot.
 */
const layerBindGroup = (device: GPUDevice, tilemaps: TTilemapPipeline, slot: number, layer: TDrawTilemapLayer, view: number): GPUBindGroup => {
    const floats = tilemaps.layerUniforms.data;
    const at = slot * LAYER_STRIDE / 4;
    // Where the map ends up, not where it says it is: a box above it may have moved it.
    const transform = worldOf(layer);
    floats[at] = transform.x;
    floats[at + 1] = transform.y;
    floats[at + 2] = transform.scaleX;
    floats[at + 3] = transform.scaleY;
    floats[at + 4] = transform.rotation;
    floats[at + 5] = view;
    // 6 and 7 are padding: the colour has to start on a round number of bytes.
    floats[at + 8] = layer.tint.r;
    floats[at + 9] = layer.tint.g;
    floats[at + 10] = layer.tint.b;
    floats[at + 11] = layer.tint.a;
    device.queue.writeBuffer(tilemaps.layerUniforms.buffer, slot * LAYER_STRIDE, floats, at, LAYER_FLOATS);

    const existing = tilemaps.layerBindGroups[slot];
    if (existing !== undefined) {
        return existing;
    }
    const group = device.createBindGroup({
        label: `tilemap layer bind group ${slot}`,
        layout: tilemaps.layouts.layer,
        entries: [{ binding: 0, resource: { buffer: tilemaps.layerUniforms.buffer, offset: slot * LAYER_STRIDE, size: LAYER_STRIDE } }],
    });
    tilemaps.layerBindGroups[slot] = group;
    return group;
};

/**
 * Draws one layer of a map: one call per mesh it holds, whatever its number of cells.
 *
 * `slot` is which set of the shared numbers this layer uses, and it climbs through the frame: a
 * frame with a ground layer, a canopy and a second map uses three.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const drawTilemapLayer = (
    device: GPUDevice,
    gpuPass: GPURenderPassEncoder,
    tilemaps: TTilemapPipeline,
    layer: TDrawTilemapLayer,
    camera: number,
    slot: number,
    time: number,
    width: number,
    height: number,
): void => {
    // Not drawn until the sheet is there, exactly like a sprite: a map of white squares for one
    // frame is worse than a map that appears a moment later.
    const texture = layer.texture;
    if (texture === null || texture.status !== 'ready' || texture.gpu === null) {
        return;
    }

    if (slot >= tilemaps.layerUniforms.capacity) {
        growLayers(device, tilemaps, slot + 1);
    }

    // An effect of its own runs a different pipeline over the same cells. One that would not
    // compile falls through: the layer keeps its sheet, its colour and its place.
    const material = layer.material ?? null;
    const compiled = material !== null && material.fragment !== null ? tilemaps.materials.get(material) : null;
    const effect = compiled !== null && !compiled.failed && compiled.pipeline !== null ? compiled : null;

    gpuPass.setPipeline(effect !== null ? effect.pipeline! : tilemaps.pipeline);
    gpuPass.setBindGroup(0, tilemaps.frameBindGroup);
    gpuPass.setBindGroup(1, textureBindGroup(device, tilemaps, toGpuTexture(texture.gpu), layer.smooth ?? tilemaps.defaultSmooth));
    // Slot 0 of the views is the screen, so camera `c` is in slot `c + 1`: the same rule the
    // sprites follow, because they are looked at through the same table.
    const view = camera >= 0 && camera < MAX_VIEWS - 1 ? camera + 1 : 0;
    gpuPass.setBindGroup(2, layerBindGroup(device, tilemaps, slot, layer, view));

    if (effect !== null) {
        gpuPass.setBindGroup(tilemaps.materials.group, tilemaps.materials.bind(
            effect, material!.uniforms ?? {}, layer.uniforms ?? null, time, width, height,
        ));
    }

    for (const mesh of layer.meshes) {
        if (mesh.buffer === null || mesh.vertexCount === 0) {
            continue;
        }
        gpuPass.setVertexBuffer(0, toGpuBuffer(mesh.buffer));
        gpuPass.draw(mesh.vertexCount);
    }
};
