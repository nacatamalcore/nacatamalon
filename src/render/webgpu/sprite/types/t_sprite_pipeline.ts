import type { TSpriteRun } from './t_sprite_run';
import type { TFlatMaterials } from '../../material/flat_materials';

/**
 * Everything the sprite pipeline creates once and reuses every frame.
 *
 * @internal
 */
export type TSpritePipeline = {
    /**
     * How the GPU reads the quad and the per-sprite data, and which shader runs.
     */
    pipeline: GPURenderPipeline;
    /**
     * The same, ending in the distance-field read: for the characters of a text in a vector font.
     */
    distanceFieldPipeline: GPURenderPipeline;
    /**
     * The first two groups, spelled out rather than taken from the pipeline.
     *
     * Shared with every material pipeline, which is the whole reason they are spelled out: a bind
     * group belongs to the layout it was made against, and an automatic layout belongs to one
     * pipeline alone.
     */
    layouts: { frame: GPUBindGroupLayout; texture: GPUBindGroupLayout };
    /**
     * The effects this game has compiled, and the numbers they are drawn with.
     */
    materials: TFlatMaterials;
    /**
     * The same effects compiled to end in the distance-field read, for a vector font's text that
     * carries one. Kept apart because the same material is a different shader there.
     */
    distanceFieldMaterials: TFlatMaterials;
    /**
     * The 4 corners of a quad (a triangle strip), shared by every sprite.
     */
    quad: GPUBuffer;
    /**
     * Binds the shared frame uniforms (resolution and views) to this pipeline.
     */
    bindGroup: GPUBindGroup;
    /**
     * One 72-byte entry per sprite. Replaced by a bigger one when a frame has more sprites than fit.
     */
    instances: GPUBuffer;
    /**
     * The CPU copy of `instances`, `SPRITE_FLOATS` per sprite, reused every frame so drawing allocates nothing.
     */
    instanceData: Float32Array;
    /**
     * How many sprites `instances` and `instanceData` can hold right now.
     */
    capacity: number;
    /**
     * Both ways of reading a texture, made once at boot: `nearest` keeps a scaled-up pixel from
     * being blurred, `linear` blends between texels. A sprite picks one; the game's `smooth`
     * decides for everything that does not.
     */
    samplers: { nearest: GPUSampler; linear: GPUSampler };
    /**
     * What a sprite gets when it says nothing, from the game's `smooth` option.
     */
    defaultSmooth: boolean;
    /**
     * Group 1 for a sprite with no texture, or one whose texture failed: a white texel the tint colours.
     */
    whiteBindGroup: GPUBindGroup;
    /**
     * Group 1 per uploaded texture, made the first time it is drawn, and one per filtering: the
     * sampler is part of the group, so the same image shown crisp in one place and smooth in
     * another needs one of each.
     */
    textureBindGroups: WeakMap<GPUTexture, { nearest?: GPUBindGroup; linear?: GPUBindGroup }>;
    /**
     * This frame's batches. Reused between frames: only the first `runCount` are valid.
     */
    runs: TSpriteRun[];
    /**
     * How many of `runs` this frame filled.
     */
    runCount: number;
};
