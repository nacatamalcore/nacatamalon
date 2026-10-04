import { hasWebGPU } from "./has_webgpu";

// Get the WebGPU adapter and device
export const createDevice = async (): Promise<{ adapter: GPUAdapter; device: GPUDevice }> => {
    if (!hasWebGPU()) {
        throw new Error('WebGPU is not supported in this environment.');
    }

    const adapter = await navigator.gpu.requestAdapter();
    if (!adapter) {
        throw new Error('Failed to get a WebGPU adapter.');
    }

    const device = await adapter.requestDevice();
    if (!device) {
        throw new Error('Failed to get a WebGPU device.');
    }


    // Get webgpu reports mistakes
    device.addEventListener('uncapturederror', (event) => {
        console.error('[NacatamalOn] WebGPU error:', event.error.message);
    });

    return { adapter, device };
}
