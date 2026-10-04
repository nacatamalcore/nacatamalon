// Per frame
import type { TDrawItem } from '../../interface';
import { toGpuTexture } from '../texture';
import { getTextureBindGroup } from './get_texture_bind_group';
import { spriteSize } from '../../shared/sprite_size';
import { spriteUvWindow } from '../../shared/sprite_uv';
import type { TSpritePipeline } from './types/t_sprite_pipeline';
import type { TDrawShader } from '../../interface/draw/t_draw_material';
import type { TUniformValues } from '../../../materials/types/t_uniforms';
import { worldOf } from '../../shared/world_of';

/**
 * Floats per sprite in the instance buffer: x, y, width, height, rotation, scaleX, scaleY,
 * r, g, b, a, uvOffset x, y, uvScale x, y, anchor x, y, view. Must match the 72-byte stride of
 * the pipeline.
 *
 * @internal
 */
export const SPRITE_FLOATS = 18;

/**
 * Views the shader holds: the screen in slot 0 and up to this many minus one cameras. Must match
 * `MAX_VIEWS` in the sprite shader.
 *
 * @internal
 */
export const MAX_VIEWS = 16;

/**
 * Sprites the instance buffer holds before it first has to grow.
 *
 * @internal
 */
export const INITIAL_SPRITE_CAPACITY = 64;

/**
 * Replaces the instance buffer with one that fits `count` sprites, doubling so a game that keeps
 * spawning grows a few times and then never again.
 */
const growInstances = (device: GPUDevice, sprites: TSpritePipeline, count: number): void => {
    let capacity = sprites.capacity;
    while (capacity < count) {
        capacity *= 2;
    }

    sprites.instances.destroy();
    sprites.instances = device.createBuffer({
        label: 'sprite instances',
        size: capacity * SPRITE_FLOATS * 4,
        usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
    });
    sprites.instanceData = new Float32Array(capacity * SPRITE_FLOATS);
    sprites.capacity = capacity;
};

/**
 * Adds sprite `index` to the current run if it uses the same sheet and the same effect, or opens a
 * new one. Reuses the run objects of earlier frames, so batching allocates nothing once the game has
 * settled.
 *
 * A sprite carrying knobs of its own always opens a run and always closes it, because a run writes
 * one set of them.
 */
const addToRun = (
    sprites: TSpritePipeline,
    bindGroup: GPUBindGroup,
    material: TDrawShader | null,
    uniforms: TUniformValues | null,
    index: number,
    drawable: number,
    broken: boolean,
): void => {
    const last = sprites.runCount > 0 ? sprites.runs[sprites.runCount - 1] : undefined;
    const joins = !broken
        && last !== undefined
        && last.bindGroup === bindGroup
        && last.material === material
        && last.uniforms === null
        && uniforms === null;
    if (joins) {
        last!.count++;
        return;
    }

    const run = sprites.runs[sprites.runCount];
    if (run === undefined) {
        sprites.runs.push({ bindGroup, material, uniforms, start: index, count: 1, firstDrawable: drawable });
    } else {
        run.bindGroup = bindGroup;
        run.material = material;
        run.uniforms = uniforms;
        run.start = index;
        run.count = 1;
        run.firstDrawable = drawable;
    }
    sprites.runCount++;
};

/**
 * Turns this pass's sprites into the instance buffer, groups them into runs that share a texture,
 * and returns how many sprites were written.
 *
 * Runs are **consecutive** sprites with the same texture, never all sprites of a texture: joining
 * sprites that are not next to each other would draw them out of order.
 *
 * A sprite whose texture is still loading is skipped entirely; one whose texture failed draws with
 * the white texel, as its tint. Reads the records the game hands over and copies only numbers.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const writeSpriteInstances = (
    device: GPUDevice,
    sprites: TSpritePipeline,
    drawables: readonly TDrawItem[],
    cameraIndex: readonly number[],
): number => {
    if (drawables.length > sprites.capacity) {
        growInstances(device, sprites, drawables.length);
    }

    const data = sprites.instanceData;
    let count = 0;
    sprites.runCount = 0;
    // True when the last thing looked at was not a sprite, so the next one starts a new batch even
    // if it shares a texture with the one before: a map's layer drawn in between has to stay in
    // between.
    let broken = true;

    for (let i = 0; i < drawables.length; i++) {
        const item = drawables[i];
        switch (item.type) {
            case 'sprite': {
                // Where it ends up, not where it says it is: a box above it may have moved it.
                const transform = worldOf(item);
                const { tint, texture } = item;

                // Not drawn until the image is there, rather than a frame of plain tint in its place.
                if (texture !== null && texture.status === 'loading') {
                    broken = true;
                    break;
                }

                // A sprite that says nothing is read the way the game asked for at boot. Saying
                // otherwise only costs a second bind group for that image, and breaks the run,
                // which is why a whole layer sharing one answer stays one draw call.
                const bindGroup = texture !== null && texture.status === 'ready' && texture.gpu !== null
                    ? getTextureBindGroup(device, sprites, toGpuTexture(texture.gpu), item.smooth ?? sprites.defaultSmooth)
                    : sprites.whiteBindGroup;

                // The window into the image, the whole of it unless the sprite says otherwise, and
                // read backwards when it is mirrored. Shared with the other backend, so the same
                // sprite cannot face two ways depending on who drew it.
                const window = spriteUvWindow(item);

                const o = count * SPRITE_FLOATS;
                data[o] = transform.x;
                data[o + 1] = transform.y;
                // Told nothing, a sprite is the size of what it shows: one frame of a sheet, not
                // the whole sheet. Shared with pointer hit testing, so it is touched at this size.
                const size = spriteSize(item);
                data[o + 2] = size.width;
                data[o + 3] = size.height;
                data[o + 4] = transform.rotation;
                data[o + 5] = transform.scaleX;
                data[o + 6] = transform.scaleY;
                data[o + 7] = tint.r;
                data[o + 8] = tint.g;
                data[o + 9] = tint.b;
                data[o + 10] = tint.a;
                data[o + 11] = window.offsetX;
                data[o + 12] = window.offsetY;
                data[o + 13] = window.scaleX;
                data[o + 14] = window.scaleY;
                // The middle unless the sprite says otherwise, which is where every sprite
                // written before anchors existed expects to be.
                data[o + 15] = item.anchor?.x ?? 0.5;
                data[o + 16] = item.anchor?.y ?? 0.5;
                // Slot 0 is the screen, so camera `c` lives in slot `c + 1`. A camera past what the
                // shader holds falls back to the screen, and `writeFrameUniforms` has said so.
                const camera = cameraIndex[i] ?? -1;
                data[o + 17] = camera >= 0 && camera < MAX_VIEWS - 1 ? camera + 1 : 0;

                addToRun(sprites, bindGroup, item.material ?? null, item.uniforms ?? null, count, i, broken);
                broken = false;
                count++;
                break;
            }
            case 'mesh':
            case 'tilemap':
            case 'particles':
            case 'particles3d':
            case 'lines': {
                // Drawn by its own pipeline, in `renderFrame`, where the two lists are walked
                // together. Here it only cuts the batch.
                broken = true;
                break;
            }
            default: {
                // A new kind of drawable that nobody taught this backend to draw.
                const missing: never = item;
                throw new Error(`[NacatamalOn] WebGPU: no way to draw '${(missing as { type: string }).type}'.`);
            }
        }
    }

    if (count > 0) {
        // For a typed array, offset and size are counted in elements, not bytes.
        device.queue.writeBuffer(sprites.instances, 0, data, 0, count * SPRITE_FLOATS);
    }

    return count;
};
