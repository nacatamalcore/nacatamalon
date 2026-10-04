import type { TSpriteRun } from './t_sprite_run';

/**
 * Everything the WebGL2 sprite pipeline creates once and reuses every frame. The same shape as the
 * WebGPU one, with GL objects where that one has bind groups.
 *
 * Every GL object here dies with the context. On a restore the whole record is built again by
 * `createSpritePipeline`, never patched field by field.
 *
 * @internal
 */
export type TSpritePipeline = {
    /**
     * The effects this game has compiled on this card, and the numbers they are drawn with.
     */
    materials: TSpriteMaterials;
    /**
     * The linked sprite shader.
     */
    program: WebGLProgram;
    /**
     * Remembers which buffer feeds each attribute and that the per-sprite ones advance per instance.
     */
    vao: WebGLVertexArrayObject;
    /**
     * The 4 corners of a quad (a triangle strip), shared by every sprite.
     */
    quad: WebGLBuffer;
    /**
     * One 72-byte entry per sprite. Grown in place with `bufferData` when a frame has more sprites than fit.
     */
    instances: WebGLBuffer;
    /**
     * The CPU copy of `instances`, `SPRITE_FLOATS` per sprite, reused every frame so drawing allocates nothing.
     */
    instanceData: Float32Array;
    /**
     * How many sprites `instances` and `instanceData` can hold right now.
     */
    capacity: number;
    /**
     * Both ways of reading a texture, made once. In WebGL2 a sampler object bound to a texture unit
     * wins over the texture's own parameters, which is what lets one image be read both ways.
     */
    samplers: { nearest: WebGLSampler; linear: WebGLSampler };
    /**
     * What a sprite gets when it says nothing, from the game's `smooth` option.
     */
    defaultSmooth: boolean;
    /**
     * A single white texel: what a sprite with no texture, or a failed one, samples.
     */
    whiteTexture: WebGLTexture;
    /**
     * This frame's batches. Reused between frames: only the first `runCount` are valid.
     */
    runs: TSpriteRun[];
    /**
     * How many of `runs` this frame filled.
     */
    runCount: number;
};

import type { TSpriteMaterials } from '../../material/sprite_materials';
