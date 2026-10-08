// Per frame
import type { TDrawItem } from '../../interface';
import { spriteSize } from '../../shared/sprite_size';
import { spriteUvWindow } from '../../shared/sprite_uv';
import { toGlTexture } from '../texture';
import type { TSpritePipeline } from './types/t_sprite_pipeline';
import type { TDrawShader } from '../../interface/draw/t_draw_material';
import type { TUniformValues } from '../../../materials/types/t_uniforms';
import { worldOf } from '../../shared/world_of';

/**
 * Floats per sprite in the instance buffer: x, y, width, height, rotation, scaleX, scaleY,
 * r, g, b, a, uvOffset x, y, uvScale x, y, anchor x, y, view.
 *
 * A copy of the WebGPU backend's layout, kept on purpose instead of shared. The test
 * `webgl2_layout.test.ts` writes the same drawables through both and compares the floats, so the
 * two copies cannot drift apart without a red test.
 *
 * @internal
 */
export const SPRITE_FLOATS = 18;

/**
 * Bytes per sprite in the instance buffer: the stride every per-sprite attribute steps by.
 *
 * @internal
 */
export const SPRITE_STRIDE = SPRITE_FLOATS * 4;

/**
 * Views the shader holds: the screen in slot 0 and up to this many minus one cameras. Must match the
 * size of `views` in the sprite shader.
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
 * Makes the instance buffer fit `count` sprites, doubling so a game that keeps spawning grows a few
 * times and then never again. The buffer object stays the same, only its storage is replaced, so
 * the vertex array that points at it needs nothing.
 */
const growInstances = (gl: WebGL2RenderingContext, sprites: TSpritePipeline, count: number): void => {
    let capacity = sprites.capacity;
    while (capacity < count) {
        capacity *= 2;
    }

    gl.bindBuffer(gl.ARRAY_BUFFER, sprites.instances);
    gl.bufferData(gl.ARRAY_BUFFER, capacity * SPRITE_STRIDE, gl.DYNAMIC_DRAW);
    sprites.instanceData = new Float32Array(capacity * SPRITE_FLOATS);
    sprites.capacity = capacity;
};

/**
 * Adds sprite `index` to the current run if it uses the same texture read the same way, the same
 * effect and the same blend, or opens a new run. Reuses the run objects of earlier frames, so batching allocates
 * nothing once the game has settled.
 *
 * A sprite carrying knobs of its own always opens a run and always closes it, because a run writes
 * one set of them.
 */
const addToRun = (
    sprites: TSpritePipeline,
    texture: WebGLTexture,
    sampler: WebGLSampler,
    material: TDrawShader | null,
    uniforms: TUniformValues | null,
    distanceField: boolean,
    additive: boolean,
    index: number,
    drawable: number,
    broken: boolean,
): void => {
    const last = sprites.runCount > 0 ? sprites.runs[sprites.runCount - 1] : undefined;
    const joins = !broken
        && last !== undefined
        && last.texture === texture
        && last.sampler === sampler
        && last.material === material
        && last.distanceField === distanceField
        && last.additive === additive
        && last.uniforms === null
        && uniforms === null;
    if (joins) {
        last!.count++;
        return;
    }

    const run = sprites.runs[sprites.runCount];
    if (run === undefined) {
        sprites.runs.push({ texture, sampler, material, uniforms, distanceField, additive, start: index, count: 1, firstDrawable: drawable });
    } else {
        run.texture = texture;
        run.sampler = sampler;
        run.material = material;
        run.distanceField = distanceField;
        run.additive = additive;
        run.uniforms = uniforms;
        run.start = index;
        run.count = 1;
        run.firstDrawable = drawable;
    }
    sprites.runCount++;
};

/**
 * Turns this pass's sprites into the instance buffer, groups them into runs that share a texture and
 * a filtering, and returns how many sprites were written.
 *
 * The same walk as the WebGPU backend: a sprite whose texture is still loading is skipped, one whose
 * texture failed draws with the white texel as its tint, and runs are only ever **consecutive**
 * sprites, so the order on screen is the order given.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const writeSpriteInstances = (
    gl: WebGL2RenderingContext,
    sprites: TSpritePipeline,
    drawables: readonly TDrawItem[],
    cameraIndex: readonly number[],
): number => {
    if (drawables.length > sprites.capacity) {
        growInstances(gl, sprites, drawables.length);
    }

    const data = sprites.instanceData;
    let count = 0;
    sprites.runCount = 0;
    // True when the last thing looked at was not a sprite: a map's layer drawn in between has to
    // stay in between, so the next sprite starts a new batch.
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

                let glTexture = sprites.whiteTexture;
                let smooth = sprites.defaultSmooth;
                if (texture !== null && texture.status === 'ready' && texture.gpu !== null) {
                    const uploaded = toGlTexture(texture.gpu);
                    // Only missing between a restore and its re-upload. Skipped like a texture
                    // still loading, never drawn as a white square for one frame.
                    if (uploaded === null) {
                        broken = true;
                        break;
                    }
                    glTexture = uploaded;
                    smooth = item.smooth ?? sprites.defaultSmooth;
                }
                const sampler = smooth ? sprites.samplers.linear : sprites.samplers.nearest;

                const o = count * SPRITE_FLOATS;
                data[o] = transform.x;
                data[o + 1] = transform.y;
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
                // The window into the image, read backwards when the sprite is mirrored. Shared
                // with the other backend: which part of the picture, and which way round, is one
                // answer.
                const window = spriteUvWindow(item);
                data[o + 11] = window.offsetX;
                data[o + 12] = window.offsetY;
                data[o + 13] = window.scaleX;
                data[o + 14] = window.scaleY;
                data[o + 15] = item.anchor?.x ?? 0.5;
                data[o + 16] = item.anchor?.y ?? 0.5;
                // Slot 0 is the screen, so camera `c` lives in slot `c + 1`. A camera past what the
                // shader holds falls back to the screen, and `writeFrameUniforms` has said so.
                const camera = cameraIndex[i] ?? -1;
                data[o + 17] = camera >= 0 && camera < MAX_VIEWS - 1 ? camera + 1 : 0;

                addToRun(sprites, glTexture, sampler, item.material ?? null, item.uniforms ?? null, item.distanceField === true, item.blend === 'additive', count, i, broken);
                broken = false;
                count++;
                break;
            }
            case 'mesh':
            case 'tilemap':
            case 'particles':
            case 'particles3d':
            case 'lines': {
                // Drawn by its own pipeline, in `renderFrame`. Here it only cuts the batch.
                broken = true;
                break;
            }
            default: {
                // A new kind of drawable that nobody taught this backend to draw.
                const missing: never = item;
                throw new Error(`[NacatamalOn] WebGL2: no way to draw '${(missing as { type: string }).type}'.`);
            }
        }
    }

    if (count > 0) {
        gl.bindBuffer(gl.ARRAY_BUFFER, sprites.instances);
        // Offset and length in elements of the typed array, not bytes.
        gl.bufferSubData(gl.ARRAY_BUFFER, 0, data, 0, count * SPRITE_FLOATS);
    }

    return count;
};
