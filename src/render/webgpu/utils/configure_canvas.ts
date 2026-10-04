export type CanvasContext = {
    context: GPUCanvasContext;
    format: GPUTextureFormat;
}

// @ai: internal, do not export from src/index.ts

/**
 * Configures the WebGPU context on a canvas. Must be called after `createDevice`.
 * @returns `{ context: GPUCanvasContext, format: GPUTextureFormat }`
 * @since 1.0.0
 */
export const configureCanvas = (canvas: HTMLCanvasElement, device: GPUDevice): CanvasContext => {
    const context = canvas.getContext('webgpu');
    if (!context) {
        throw new Error('Failed to get WebGPU context from canvas.');
    }

    const format = navigator.gpu.getPreferredCanvasFormat();

    context.configure({
        device,
        format,
        alphaMode: 'opaque',
    });

    return { context, format };
}
