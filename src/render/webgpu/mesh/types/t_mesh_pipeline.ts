import type { TJointPalette } from '../joint_palette';

/**
 * Everything the mesh pipeline keeps between frames.
 *
 * Two shared buffers and their bind groups, one for what a frame's lights are and one for what each
 * model is. Both grow by doubling, and both are written once a frame: the alternative, a buffer per
 * model, is the shape core had and the reason it had to send its work to the card once per pass.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TMeshPipeline = {
    pipeline: GPURenderPipeline;
    /**
     * The same thing for a model that bends around its bones. Its own pipeline rather than a branch
     * inside the other, because the corners it reads and the shader that reads them both differ,
     * and the rest of the frame must not pay for a choice it never makes.
     */
    skinnedPipeline: GPURenderPipeline;
    /**
     * The same two for a see-through model: tested against depth but writing none. Drawn after the
     * solid ones, so it blends over what is behind it and hides nothing that comes later.
     */
    transparentPipeline: GPURenderPipeline;
    transparentSkinnedPipeline: GPURenderPipeline;
    /**
     * Spelled out and shared, so a bind group made once works with either pipeline. Worked out from
     * each shader instead, they would be two sets that look identical and are not interchangeable.
     */
    /**
     * The effects this game has compiled for models, and the numbers they are drawn with.
     */
    materials: TMeshMaterials;
    layouts: {
        lights: GPUBindGroupLayout;
        texture: GPUBindGroupLayout;
        uniforms: GPUBindGroupLayout;
        joints: GPUBindGroupLayout;
    };
    /**
     * Each skeleton's bones on the card, written once a frame however many models wear them.
     */
    joints: TJointPalette;
    /**
     * Which group points at which skeleton's bones, by the name the skeleton is kept under.
     */
    jointBindGroups: Map<string, { group: GPUBindGroup; buffer: GPUBuffer }>;
    samplers: { nearest: GPUSampler; linear: GPUSampler };
    defaultSmooth: boolean;
    /**
     * A model with no picture is drawn with a single white pixel, as a plain sprite is.
     */
    whiteTexture: GPUTexture;
    /**
     * How a model's picture is read, one sampler per way of reading it: the filter, and what the
     * picture does past its edge each way. Made at boot, all eighteen, so a model asking for one
     * mid-game builds nothing in the middle of a frame. Keyed as `shared/texture_wrap.ts` spells it.
     */
    wrapSamplers: Map<string, GPUSampler>;
    /**
     * Each picture's groups, one per way it has been read, made the first time that way is drawn.
     */
    textureBindGroups: WeakMap<GPUTexture, Map<string, GPUBindGroup>>;
    whiteBindGroups: { nearest: GPUBindGroup; linear: GPUBindGroup };
    /**
     * One slot per scene that has models: what shines on it and how dark its dark side is.
     */
    lights: {
        buffer: GPUBuffer;
        data: Float32Array;
        capacity: number;
        bindGroups: GPUBindGroup[];
        /**
         * One step of depth, bound when a scene casts nothing, so the layout can be one layout.
         */
        blankShadow: GPUTextureView;
        /**
         * How the map is read: comparing, not looking.
         */
        shadowSampler: GPUSampler;
        /**
         * Which map the groups were made against, so they are remade when that changes.
         */
        boundShadow: GPUTextureView | null;
    };
    /**
     * One slot per model drawn this frame, not per model in the game.
     */
    meshes: { buffer: GPUBuffer; data: Float32Array; capacity: number; bindGroups: GPUBindGroup[] };
};

import type { TMeshMaterials } from '../../material/mesh_materials';
