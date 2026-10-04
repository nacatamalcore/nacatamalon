/**
 * Everything the tilemap pipeline makes once and reuses.
 *
 * @internal
 */
export type TTilemapPipeline = {
    /**
     * The three groups, spelled out rather than taken from the pipeline, so a layer's material
     * pipeline can bind the very same ones.
     */
    layouts: { frame: GPUBindGroupLayout; texture: GPUBindGroupLayout; layer: GPUBindGroupLayout };
    /**
     * The effects this game has compiled for map layers.
     */
    materials: TFlatMaterials;
    pipeline: GPURenderPipeline;
    /**
     * Binds the shared frame uniforms, the same ones the sprites look through.
     */
    frameBindGroup: GPUBindGroup;
    /**
     * The sheet of a layer, one group per texture and filtering, made the first time it is drawn.
     */
    textureBindGroups: WeakMap<GPUTexture, { nearest?: GPUBindGroup; linear?: GPUBindGroup }>;
    samplers: { nearest: GPUSampler; linear: GPUSampler };
    defaultSmooth: boolean;
    /**
     * Where a layer's own numbers go: its position, turn, scale, colour and which camera it looks
     * through. One slot per layer drawn this frame, in one buffer, because a bind group can only
     * point at one place at a time and a frame can hold many layers.
     */
    layerUniforms: { buffer: GPUBuffer; data: Float32Array; capacity: number };
    /**
     * One bind group per slot of that buffer, made as the frames need them.
     */
    layerBindGroups: GPUBindGroup[];
};

import type { TFlatMaterials } from '../../material/flat_materials';
