import { hasWebGPU } from "./has_webgpu";

// Get the WebGPU adapter and device
export const createDevice = async (): Promise<{ adapter: GPUAdapter; device: GPUDevice }> => {
    if (!hasWebGPU()) {
        throw new Error('this browser has no WebGPU');
    }

    const adapter = await navigator.gpu.requestAdapter();
    if (!adapter) {
        throw new Error('the browser gave no graphics adapter');
    }

    const device = await adapter.requestDevice();
    if (!device) {
        throw new Error('the graphics adapter gave no device');
    }


    // Get webgpu reports mistakes
    device.addEventListener('uncapturederror', (event) => {
        console.error('[NacatamalOn] WebGPU error:', event.error.message);
    });

    return { adapter, device };
}
