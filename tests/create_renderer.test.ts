import { afterEach, beforeEach, describe, expect, it, mock } from 'bun:test';
import type { IRenderer } from '../src/render';

/**
 * Which backend `createRenderer` ends up with, with both backends replaced: what is tested is the
 * choice, not the drawing, which needs a real GPU and is checked in the browser.
 */

let webgpuError: Error | null = null;
let webgl2Error: Error | null = null;
const calls: string[] = [];

const fakeRenderer = (backend: 'WEBGPU' | 'WEBGL2'): IRenderer => ({
    capabilities: { backend, msaa: 1 },
    frame: () => {},
    createTexture: () => ({ resourceType: 'texture' }),
    createBuffer: () => ({ resourceType: 'buffer' }),
    updateBuffer: () => {},
    destroyBuffer: () => {},
    createDataTexture: () => ({ resourceType: 'texture' }),
    createRenderTexture: () => ({ resourceType: 'texture' }),
    readTexture: async () => ({ width: 0, height: 0, data: new Uint8Array(0) }),
    destroyTexture: () => {},
    setSmooth: () => {},
    destroy: () => {},
});

mock.module('../src/render/webgpu', () => ({
    createWebGPURenderer: async () => {
        calls.push('WEBGPU');
        if (webgpuError !== null) throw webgpuError;
        return fakeRenderer('WEBGPU');
    },
}));
mock.module('../src/render/webgl2', () => ({
    createWebGL2Renderer: async () => {
        calls.push('WEBGL2');
        if (webgl2Error !== null) throw webgl2Error;
        return fakeRenderer('WEBGL2');
    },
}));

const { createRenderer } = await import('../src/render/create_renderer');

const canvas = {} as HTMLCanvasElement;

/**
 * Makes the page look like it has WebGPU, or not.
 */
const setNavigatorGpu = (present: boolean): void => {
    Object.defineProperty(navigator, 'gpu', { value: present ? {} : undefined, configurable: true });
};

describe('createRenderer', () => {
    beforeEach(() => {
        webgpuError = null;
        webgl2Error = null;
        calls.length = 0;
    });
    afterEach(() => {
        setNavigatorGpu(false);
        mock.restore();
    });

    it("'AUTO' takes WebGPU when it starts", async () => {
        setNavigatorGpu(true);
        const renderer = await createRenderer(canvas, { renderer: 'AUTO' });
        expect(renderer.capabilities.backend).toBe('WEBGPU');
        expect(calls).toEqual(['WEBGPU']);
    });

    it("'AUTO' falls back to WebGL2 when WebGPU is there but fails to start", async () => {
        setNavigatorGpu(true);
        webgpuError = new Error('no adapter');
        const renderer = await createRenderer(canvas, { renderer: 'AUTO' });
        expect(renderer.capabilities.backend).toBe('WEBGL2');
        expect(calls).toEqual(['WEBGPU', 'WEBGL2']);
    });

    it("'AUTO' goes straight to WebGL2 without navigator.gpu", async () => {
        setNavigatorGpu(false);
        const renderer = await createRenderer(canvas);
        expect(renderer.capabilities.backend).toBe('WEBGL2');
        expect(calls).toEqual(['WEBGL2']);
    });

    it("'AUTO' names both reasons when nothing starts", async () => {
        setNavigatorGpu(true);
        webgpuError = new Error('no adapter');
        webgl2Error = new Error('no context');
        const failure = createRenderer(canvas, { renderer: 'AUTO' });
        await expect(failure).rejects.toThrow('no adapter');
        await expect(createRenderer(canvas, { renderer: 'AUTO' })).rejects.toThrow('no context');
    });

    it("a named 'WEBGL2' never becomes WebGPU", async () => {
        setNavigatorGpu(true);
        webgl2Error = new Error('no context');
        await expect(createRenderer(canvas, { renderer: 'WEBGL2' })).rejects.toThrow('no context');
        expect(calls).toEqual(['WEBGL2']);
    });

    it("a named 'WEBGPU' never falls back to WebGL2", async () => {
        setNavigatorGpu(true);
        webgpuError = new Error('no adapter');
        await expect(createRenderer(canvas, { renderer: 'WEBGPU' })).rejects.toThrow('no adapter');
        expect(calls).toEqual(['WEBGPU']);
    });
});
