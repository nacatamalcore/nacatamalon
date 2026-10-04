import { DEPTH_FORMAT } from '../frame/depth';

/**
 * The state every model pipeline is built with: how it blends, what it throws away, and what it does
 * with depth.
 *
 * At module level and exported because a material's pipeline has to be built with exactly this. The
 * one thing a material changes is the shader; anything else differing would show up as a model that
 * is drawn in front of something it should be behind, which reads as a sorting bug.
 *
 * `writesDepth` is the one exception, and it is the model's rather than the material's: a
 * see-through model is tested against depth like any other but writes none, or it would hide what is
 * drawn after it and behind it. So every model pipeline comes in two, and the frame picks per model.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const describeMeshPipeline = (
    label: string,
    module: GPUShaderModule,
    layout: GPUPipelineLayout,
    buffers: GPUVertexBufferLayout[],
    format: GPUTextureFormat,
    samples: number,
    writesDepth = true,
): GPURenderPipelineDescriptor => ({
    label,
    layout,
    vertex: { module, entryPoint: 'vs', buffers },
    fragment: {
        module,
        entryPoint: 'fs',
        targets: [{
            format,
            blend: {
                color: { srcFactor: 'src-alpha', dstFactor: 'one-minus-src-alpha', operation: 'add' },
                alpha: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha', operation: 'add' },
            },
        }],
    },
    // Facing away is thrown out: half of a closed shape is always pointing away from the
    // viewer, and drawing it costs as much as the half that can be seen.
    primitive: { topology: 'triangle-list', cullMode: 'back' },
    // The one thing in the frame that really uses depth: nearer wins, and it says so for the
    // ones behind it. A see-through one only asks.
    depthStencil: { format: DEPTH_FORMAT, depthWriteEnabled: writesDepth, depthCompare: 'less' },
    multisample: { count: samples },
});

/**
 * One corner: where it is, which way its surface faces, and what it shows.
 *
 * Shared with a material's pipeline, so a second copy of these strides cannot drift.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const MESH_CORNERS: GPUVertexBufferLayout = {
    arrayStride: 32,
    stepMode: 'vertex',
    attributes: [
        { shaderLocation: 0, offset: 0, format: 'float32x3' },
        { shaderLocation: 1, offset: 12, format: 'float32x3' },
        { shaderLocation: 2, offset: 24, format: 'float32x2' },
    ],
};

/**
 * The colour painted on each corner, in a run of its own beside the first: four bytes, which the card
 * reads as four numbers from 0 to 1 and smears across the triangle.
 *
 * Every shape has one (white when nobody painted it), so every model pipeline reads it and there is
 * no second set of pipelines for shapes without. Shared with a material's pipeline for the same
 * reason the corners are.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const MESH_COLORS: GPUVertexBufferLayout = {
    arrayStride: 4,
    stepMode: 'vertex',
    attributes: [{ shaderLocation: 5, offset: 0, format: 'unorm8x4' }],
};
