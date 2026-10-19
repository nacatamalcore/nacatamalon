import type { IRenderer, ITexture } from '../render/interface';

/**
 * A renderer that draws nowhere: every frame is handed over and forgotten, every texture and buffer
 * is a handle with nothing behind it. What the game would show is still worked out above it, in
 * the boxes and in the frame context; only the pixels are missing.
 *
 * It says it is WebGPU, the backend the engine is written against first, so nothing takes a path
 * made for the other one.
 */
export const createNullRenderer = (): IRenderer => {
    const texture = (): ITexture => ({ resourceType: 'texture' });
    return {
        capabilities: { backend: 'WEBGPU', msaa: 1 },
        frame: () => {},
        createTexture: texture,
        setSmooth: () => {},
        createBuffer: () => ({ resourceType: 'buffer' }),
        updateBuffer: () => {},
        destroyBuffer: () => {},
        createDataTexture: texture,
        updateDataTexture: () => {},
        createRenderTexture: texture,
        readTexture: async () => ({ width: 0, height: 0, data: new Uint8Array(0) }),
        destroyTexture: () => {},
        destroy: () => {},
    };
};
