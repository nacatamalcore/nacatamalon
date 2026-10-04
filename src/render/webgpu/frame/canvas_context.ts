import type { TWebGPUState } from '../types/t_webgpu_state';

/**
 * The context of another canvas a pass draws on, configured once with this game's device.
 *
 * The same device and the same format as the game's own canvas, so every pipeline already built
 * draws on it as it is. `null` when the canvas will not give a WebGPU context, which is a canvas
 * somebody already drew on some other way: the pass is skipped rather than failing every frame.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const canvasContextFor = (gpu: TWebGPUState, canvas: HTMLCanvasElement): GPUCanvasContext | null => {
    const kept = gpu.canvases.get(canvas);
    if (kept !== undefined) {
        return kept;
    }
    const context = canvas.getContext('webgpu');
    if (context === null) {
        return null;
    }
    context.configure({ device: gpu.device, format: gpu.format, alphaMode: 'opaque' });
    gpu.canvases.set(canvas, context);
    return context;
};
