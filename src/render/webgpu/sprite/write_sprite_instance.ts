// everyframe
import { SPRITE_TEXTURE_SLOTS, pictureList } from '../../shared/sprite_batch';
import type { TDrawItem } from '../../interface';
import type { TDrawStencil } from '../../interface/draw/t_draw_stencil';
import { toGpuTexture } from '../texture';
import { isAway } from '../../../loaders/texture/is_away';
import { getTextureBindGroup } from './get_texture_bind_group';
import { batchBindGroup } from './batch_bind_group';
import { spriteSize } from '../../shared/sprite_size';
import { spriteUvWindow } from '../../shared/sprite_uv';
import { spriteRepeat } from '../../shared/sprite_repeat';
import type { TSpritePipeline } from './types/t_sprite_pipeline';
import type { TSpriteRun } from './types/t_sprite_run';
import type { TDrawShader } from '../../interface/draw/t_draw_material';
import type { TUniformValues } from '../../../materials/types/t_uniforms';
import { worldOf } from '../../shared/world_of';
import { pivotPlace } from '../../shared/pivot_place';

/** The middle: where a sprite that names no anchor is held, as every sprite before anchors was. */
const CENTRE = { x: 0.5, y: 0.5 };
/** Where a sprite with a pivot is drawn from, written over sprite by sprite. */
const pivoted = { x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1 };

/**
 * Floats per sprite in the instance buffer: x, y, width, height, rotation, scaleX, scaleY,
 * r, g, b, a, uvOffset x, y, uvScale x, y, anchor x, y, the view and the batch's picture packed into
 * one number, then how many times the picture is laid across and down and where its pattern starts,
 * for a sprite that repeats. Must match the 88-byte stride of the pipeline.
 *
 * @internal
 */
export const SPRITE_FLOATS = 22;

/**
 * Views the shader holds: the screen in slot 0 and up to this many minus one cameras. The sprite
 * shader takes its size from here, and also uses it to unpack a batch's picture from the view
 * number. The particles' and the maps' shaders still write 16 and must match it.
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
 * Frames a batch keeps what it is not using: its record when it is not drawn, and its group of
 * several pictures when it is not drawn or draws only one. Two seconds at 60 frames a second.
 * Something that blinks (a HUD icon, a hurt character) comes back to them and builds nothing, while
 * a level that is gone stops holding its pictures.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const SPARE_SPRITE_FRAMES = 120;

/**
 * One more frame without the run's group of several pictures, which is let go of, with the
 * pictures it holds, once it has gone `SPARE_SPRITE_FRAMES` without being drawn.
 */
const ageBatchGroup = (run: TSpriteRun): void => {
    if (run.batchBindGroup === undefined) return;
    run.batchUnusedFor++;
    if (run.batchUnusedFor >= SPARE_SPRITE_FRAMES) {
        run.batchBindGroup = undefined;
        run.boundTextures = undefined;
        run.boundSmooth = undefined;
    }
};

/**
 * The records from `used` on drew nothing this frame. Each forgets what it drew straight away and
 * keeps only its group, in case the same pictures come back; the ones at the end that have been
 * idle for `SPARE_SPRITE_FRAMES` are dropped. A record is only idle if every one after it is too,
 * so the oldest are always the last ones.
 */
const retireRuns = (sprites: TSpritePipeline, runs: TSpriteRun[], used: number): void => {
    for (let i = used; i < runs.length; i++) {
        const run = runs[i];
        if (run.spareFor === 0) {
            // Down to the white texel rather than empty, so the list keeps its room: see pictureList.
            run.textures.length = 1;
            run.textures[0] = sprites.whiteTexture;
            run.bindGroup = sprites.whiteBindGroup;
            run.material = null;
            run.uniforms = null;
            run.stencil = null;
            run.count = 0;
        }
        run.spareFor++;
        ageBatchGroup(run);
    }
    while (runs.length > used && runs[runs.length - 1].spareFor >= SPARE_SPRITE_FRAMES) {
        runs.pop();
    }
};

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
 * Joins the last consecutive run when its state matches and the picture already has a slot, or
 * fits in a spare one. Custom materials and stencil shapes keep their single-picture contract.
 * A sprite carrying its own knobs opens and closes a run, since a run writes one set of them.
 * Run records and picture lists are reused after the first frame.
 */
const addToRun = (
    sprites: TSpritePipeline,
    texture: GPUTexture,
    smooth: boolean,
    material: TDrawShader | null,
    uniforms: TUniformValues | null,
    distanceField: boolean,
    additive: boolean,
    index: number,
    drawable: number,
    broken: boolean,
    stencil: TDrawStencil | null,
): number => {
    const last = sprites.runCount > 0 ? sprites.runs[sprites.runCount - 1] : undefined;
    const joins = !broken
        && last !== undefined
        // The sampler belongs to the whole run, so the filtering has to agree.
        && last.smooth === smooth
        && last.material === material
        && last.distanceField === distanceField
        && last.additive === additive
        && last.stencil === stencil
        && last.uniforms === null
        && uniforms === null;
    const slot = joins ? last!.textures.indexOf(texture) : -1;
    // Stencil shapes use their own single-picture shader; their camera must stay unpacked too.
    const severalPictures = material === null && (stencil === null || stencil.write === 'none');
    if (joins && (slot >= 0 || (severalPictures && last!.textures.length < SPRITE_TEXTURE_SLOTS))) {
        last!.count++;
        if (slot >= 0) return slot;
        last!.textures.push(texture);
        return last!.textures.length - 1;
    }

    const run = sprites.runs[sprites.runCount];
    if (run === undefined) {
        sprites.runs.push({ textures: pictureList(texture), bindGroup: sprites.whiteBindGroup, smooth, material, uniforms, distanceField, additive, stencil, start: index, count: 1, firstDrawable: drawable, spareFor: 0, batchUnusedFor: 0 });
    } else {
        run.spareFor = 0;
        run.textures.length = 1;
        run.textures[0] = texture;
        run.smooth = smooth;
        run.material = material;
        run.distanceField = distanceField;
        run.additive = additive;
        run.uniforms = uniforms;
        run.stencil = stencil;
        run.start = index;
        run.count = 1;
        run.firstDrawable = drawable;
    }
    sprites.runCount++;
    return 0;
};

/**
 * Turns this pass's sprites into the instance buffer, groups consecutive sprites read the same way
 * into runs of up to eight pictures, and returns how many sprites were written.
 *
 * Runs are **consecutive** sprites, never all sprites of a texture: joining sprites that are not
 * next to each other would draw them out of order. Custom materials keep a single picture per run.
 *
 * A sprite whose texture is still loading is skipped entirely; one whose texture failed draws with
 * the white texel, as its tint. Reads the records the game hands over and copies only numbers.
 *
 * `passIndex` says which of this frame's passes this is, counting only the ones drawn: the first is
 * 0. Each keeps its own records, so the screen and a camera's view do not take each other's groups.
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
    stencil: readonly TDrawStencil[] | null = null,
    passIndex = 0,
): number => {
    sprites.runs = sprites.runsByPass[passIndex] ??= [];
    if (drawables.length > sprites.capacity) {
        growInstances(device, sprites, drawables.length);
    }

    const data = sprites.instanceData;
    let count = 0;
    sprites.runCount = 0;
    // True when the last thing looked at was not a sprite, so the next one starts a new batch even
    // if it could have joined the one before: a map's layer drawn in between has to stay in between.
    let broken = true;

    for (let i = 0; i < drawables.length; i++) {
        const item = drawables[i];
        switch (item.type) {
            case 'sprite': {
                // Where it ends up, not where it says it is: a box above it may have moved it.
                const transform = worldOf(item);
                const { tint, texture } = item;

                // Not drawn until the image is there, rather than a frame of plain tint in its place,
                // and not after it was released either.
                if (isAway(texture)) {
                    broken = true;
                    break;
                }

                const picture = texture !== null && texture.status === 'ready' && texture.gpu !== null
                    ? toGpuTexture(texture.gpu) : sprites.whiteTexture;

                // The window into the image, the whole of it unless the sprite says otherwise, and
                // read backwards when it is mirrored. Shared with the other backend, so the same
                // sprite cannot face two ways depending on who drew it.
                const window = spriteUvWindow(item);

                // Told nothing, a sprite is the size of what it shows: one frame of a sheet, not
                // the whole sheet. Shared with pointer hit testing, so it is touched at this size.
                const size = spriteSize(item);
                // Turned about its pivot when it has one, held by it; about its anchor otherwise.
                const place = pivotPlace(transform, item, item.anchor ?? CENTRE, size.width, size.height, pivoted);
                const anchor = item.pivot ?? item.anchor ?? CENTRE;
                const o = count * SPRITE_FLOATS;
                data[o] = place.x;
                data[o + 1] = place.y;
                data[o + 2] = size.width;
                data[o + 3] = size.height;
                data[o + 4] = place.rotation;
                data[o + 5] = place.scaleX;
                data[o + 6] = place.scaleY;
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
                data[o + 15] = anchor.x;
                data[o + 16] = anchor.y;
                // Slot 0 is the screen, so camera `c` lives in slot `c + 1`. A camera past what the
                // shader holds falls back to the screen, and `writeFrameUniforms` has said so.
                const camera = cameraIndex[i] ?? -1;
                data[o + 17] = camera >= 0 && camera < MAX_VIEWS - 1 ? camera + 1 : 0;
                const repeat = spriteRepeat(item);
                data[o + 18] = repeat.tilesX;
                data[o + 19] = repeat.tilesY;
                data[o + 20] = repeat.shiftX;
                data[o + 21] = repeat.shiftY;

                const slot = addToRun(sprites, picture, item.smooth ?? sprites.defaultSmooth, item.material ?? null, item.uniforms ?? null, item.distanceField === true, item.blend === 'additive', count, i, broken, stencil?.[i] ?? null);
                // The view number carries the batch's picture too: view + slot * MAX_VIEWS. It stays
                // below 128, so a float holds it exactly.
                data[o + 17] += slot * MAX_VIEWS;
                broken = false;
                count++;
                break;
            }
            case 'mesh':
            case 'tilemap':
            case 'particles':
            case 'particles-3d':
            case 'lines':
            case 'custom':
            case 'mask-layer':
            case 'filter-layer': {
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

    for (let i = 0; i < sprites.runCount; i++) {
        const run = sprites.runs[i];
        if (run.textures.length > 1) {
            run.bindGroup = batchBindGroup(device, sprites, run);
            continue;
        }
        run.bindGroup = run.textures[0] === sprites.whiteTexture
            ? sprites.whiteBindGroup : getTextureBindGroup(device, sprites, run.textures[0], run.smooth);
        // Back to one picture: a run that came from several keeps their group a while, in case
        // they come back, but not for ever.
        ageBatchGroup(run);
    }
    retireRuns(sprites, sprites.runs, sprites.runCount);
    if (count > 0) {
        // For a typed array, offset and size are counted in elements, not bytes.
        device.queue.writeBuffer(sprites.instances, 0, data, 0, count * SPRITE_FLOATS);
    }

    return count;
};

/**
 * Closes the frame once its `passCount` passes are drawn. The passes it did not draw this time lose
 * their batches like a batch that is not drawn does, after `SPARE_SPRITE_FRAMES`.
 *
 * Their lists stay, even empty, so a pass that comes and goes does not make a new one each time.
 * There are never more than the most passes the game has drawn in one frame, and an empty list
 * holds nothing.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const endSpriteFrame = (sprites: TSpritePipeline, passCount: number): void => {
    for (let i = passCount; i < sprites.runsByPass.length; i++) {
        retireRuns(sprites, sprites.runsByPass[i], 0);
    }
    if (passCount === 0) {
        sprites.runCount = 0;
    }
};
