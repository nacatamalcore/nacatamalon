import type { TWebGPUState } from '../types/t_webgpu_state';

/**
 * The depth format every pipeline in this backend is built against.
 *
 * One format, named once: a pipeline is compiled for the attachments it will meet, so a pass whose
 * depth does not match what its pipelines declared is rejected outright. That is a whole class of
 * "everything went black" that a single constant makes impossible.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const DEPTH_FORMAT: GPUTextureFormat = 'depth24plus-stencil8';

/**
 * What every pipeline drawing into a pass says about the stencil: drawn where it equals the pass's
 * reference, and left as it is. The reference is set per entry (`TDrawStencil.ref`), and is 0 with
 * the stencil cleared to 0 whenever nothing is masked, so it passes everywhere. Only the pipelines
 * that write a mask's shape say otherwise.
 *
 * Declared by all of them, models included, because a pass with a stencil only takes pipelines that
 * agree on it, and because an entry that is not masked has to stay out of where a mask still is.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const STENCIL_TEST: Pick<GPUDepthStencilState, 'stencilFront' | 'stencilBack' | 'stencilReadMask' | 'stencilWriteMask'> = {
    stencilFront: { compare: 'equal', failOp: 'keep', depthFailOp: 'keep', passOp: 'keep' },
    stencilBack: { compare: 'equal', failOp: 'keep', depthFailOp: 'keep', passOp: 'keep' },
    stencilReadMask: 0xff,
    stencilWriteMask: 0,
};

/**
 * What the 2D pipelines declare so they can share a pass with meshes: they neither test nor write
 * depth, and say so. A sprite drawn after a mesh still paints over it, which is what painter's
 * order promises, and a mesh drawn after a sprite is still sorted against other meshes.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const FLAT_DEPTH: GPUDepthStencilState = {
    format: DEPTH_FORMAT,
    depthWriteEnabled: false,
    depthCompare: 'always',
    ...STENCIL_TEST,
};

/**
 * The depth picture for something of this size, made once and kept.
 *
 * Kept by size rather than one for everything, because a frame can draw into pictures of different
 * sizes (a capture, a screen inside the world) and remaking the same one twice a frame would be
 * worse than holding both.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const depthViewFor = (gpu: TWebGPUState, width: number, height: number): GPUTextureView => {
    const key = `${width}x${height}`;
    gpu.depthsUsed.add(key);
    const existing = gpu.depths.get(key);
    if (existing !== undefined) {
        return existing.createView();
    }

    const texture = gpu.device.createTexture({
        size: { width, height },
        format: DEPTH_FORMAT,
        // As many samples as the colour it is drawn beside, or the pass is refused.
        sampleCount: gpu.samples,
        usage: GPUTextureUsage.RENDER_ATTACHMENT,
    });
    gpu.depths.set(key, texture);
    return texture.createView();
};

/**
 * With more than one sample, the picture a pass of this size is drawn into before it is resolved
 * into its real target; `null` with one, when the pass draws straight into its target.
 *
 * Kept by size for the reason `depthViewFor` gives, and let go with the depth pictures.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const multisampledViewFor = (gpu: TWebGPUState, width: number, height: number): GPUTextureView | null => {
    if (gpu.samples === 1) {
        return null;
    }
    const key = `${width}x${height}`;
    gpu.depthsUsed.add(key);
    let texture = gpu.multisampled.get(key);
    if (texture === undefined) {
        texture = gpu.device.createTexture({
            size: { width, height },
            format: gpu.format,
            sampleCount: gpu.samples,
            usage: GPUTextureUsage.RENDER_ATTACHMENT,
        });
        gpu.multisampled.set(key, texture);
    }
    return texture.createView();
};

/**
 * Lets go of every depth picture this frame did not ask for, and starts counting the next frame.
 *
 * Kept by size, so the screen and the pictures inside a scene, drawn every frame, are never touched;
 * what goes is a size nothing draws at any more. The card waits for any work already sent that
 * reads it.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const releaseUnusedDepths = (gpu: TWebGPUState): void => {
    for (const cache of [gpu.depths, gpu.multisampled]) {
        for (const [key, texture] of cache) {
            if (!gpu.depthsUsed.has(key)) {
                texture.destroy();
                cache.delete(key);
            }
        }
    }
    gpu.depthsUsed.clear();
};
