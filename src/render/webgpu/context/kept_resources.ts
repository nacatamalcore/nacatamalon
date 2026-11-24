import { createWebGPUTexture } from '../texture';
import { createWebGPUBuffer, createWebGPUDataTexture, createWebGPURenderTexture, updateWebGPUBuffer, updateWebGPUDataTexture } from '../resources';
import type { IBuffer, ITexture, TBufferUsage, TTextureRegion } from '../../interface';
import { paddedUpload } from '../resources/create_buffer';
import type { TWebGPUBuffer } from '../resources/create_buffer';
import type { TWebGPUTexture } from '../texture';

/**
 * What a picture is made again from: the decoded file, the bytes somebody worked out (a palette), or
 * nothing but its size for one that is drawn into.
 */
type TTextureSource =
    | { kind: 'image'; image: ImageBitmap; mipmaps: boolean }
    | { kind: 'data'; data: Uint8Array; width: number; height: number; mipmaps: boolean }
    | { kind: 'render'; width: number; height: number };

/**
 * What a buffer is made again from: a copy of every byte it holds, as of the last write. A copy and
 * not the array it came from, which whoever made it may write again for something else.
 */
type TBufferSource = { bytes: Uint8Array; usage: TBufferUsage };

/**
 * Everything the game holds on the card, with what each is made again from when the card is lost.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TKeptResources = {
    createTexture(image: ImageBitmap, mipmaps?: boolean): ITexture;
    createDataTexture(data: Uint8Array, width: number, height: number, mipmaps?: boolean): ITexture;
    updateDataTexture(texture: ITexture, data: Uint8Array, width: number, height: number, region?: TTextureRegion): void;
    createRenderTexture(width: number, height: number): ITexture;
    destroyTexture(texture: ITexture): void;
    createBuffer(data: Float32Array | Uint16Array | Uint32Array, usage: TBufferUsage): IBuffer;
    updateBuffer(buffer: IBuffer, data: Float32Array | Uint16Array | Uint32Array, at?: number): void;
    destroyBuffer(buffer: IBuffer): void;
    /**
     * Makes everything again on the device there is now. The game holds the same handles as before:
     * what changes is the card's object inside each. A picture that was drawn into comes back empty.
     */
    restore(): void;
    /**
     * Lets go of the images kept, when the renderer ends.
     */
    release(): void;
};

/**
 * Keeps what the game puts on the card so it can be put there again. `card` says which device and
 * format there is now.
 *
 * The same as the WebGL2 backend does, at the same cost: what is on the card is also in memory.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const keepResources = (card: () => { device: GPUDevice; format: GPUTextureFormat }): TKeptResources => {
    const textures = new Map<TWebGPUTexture, TTextureSource>();
    const buffers = new Map<TWebGPUBuffer, TBufferSource>();

    const makeTexture = (source: TTextureSource): TWebGPUTexture => {
        const { device, format } = card();
        if (source.kind === 'image') return createWebGPUTexture(device, source.image, source.mipmaps);
        if (source.kind === 'data') return createWebGPUDataTexture(device, source.data, source.width, source.height, source.mipmaps) as TWebGPUTexture;
        return createWebGPURenderTexture(device, format, source.width, source.height) as TWebGPUTexture;
    };
    const keep = (source: TTextureSource): TWebGPUTexture => {
        const texture = makeTexture(source);
        textures.set(texture, source);
        return texture;
    };
    const bytesOf = (data: ArrayBufferView): Uint8Array => new Uint8Array(data.buffer, data.byteOffset, data.byteLength);

    return {
        createTexture: (image, mipmaps = false) => keep({ kind: 'image', image, mipmaps }),
        createDataTexture: (data, width, height, mipmaps = false) => keep({ kind: 'data', data: data.slice(), width, height, mipmaps }),
        updateDataTexture: (texture, data, width, height, region) => {
            updateWebGPUDataTexture(card().device, texture, data, width, height, region);
            const source = textures.get(texture as TWebGPUTexture);
            if (source?.kind !== 'data') return;
            if (region === undefined) {
                source.data.set(data.subarray(0, source.data.length));
                return;
            }
            for (let row = region.y; row < region.y + region.height; row++) {
                const at = (row * width + region.x) * 4;
                source.data.set(data.subarray(at, at + region.width * 4), at);
            }
        },
        createRenderTexture: (width, height) => keep({ kind: 'render', width, height }),
        destroyTexture: (texture) => {
            const source = textures.get(texture as TWebGPUTexture);
            if (source?.kind === 'image') source.image.close();
            textures.delete(texture as TWebGPUTexture);
            (texture as TWebGPUTexture).gpuTexture.destroy();
        },
        createBuffer: (data, usage) => {
            const buffer = createWebGPUBuffer(card().device, data, usage);
            const bytes = new Uint8Array(buffer.capacity);
            bytes.set(bytesOf(data));
            buffers.set(buffer, { bytes, usage });
            return buffer;
        },
        updateBuffer: (buffer, data, at = 0) => {
            updateWebGPUBuffer(card().device, buffer, data, at);
            buffers.get(buffer as TWebGPUBuffer)?.bytes.set(bytesOf(paddedUpload(data)), at);
        },
        destroyBuffer: (buffer) => {
            buffers.delete(buffer as TWebGPUBuffer);
            (buffer as TWebGPUBuffer).gpuBuffer.destroy();
        },
        restore: () => {
            for (const [texture, source] of textures) {
                try {
                    texture.gpuTexture = makeTexture(source).gpuTexture;
                } catch (error) {
                    // One picture that cannot be read again is not worth the game: empty, at its size.
                    console.warn('[NacatamalOn] WebGPU: a picture could not be put on the graphics card again, so it is drawn as nothing. Load it again to have it back.', error);
                    texture.gpuTexture = (createWebGPURenderTexture(card().device, 'rgba8unorm', texture.gpuTexture.width, texture.gpuTexture.height) as TWebGPUTexture).gpuTexture;
                }
            }
            for (const [buffer, { bytes, usage }] of buffers) {
                // Whole four bytes always: the room was rounded up when it was made.
                buffer.gpuBuffer = createWebGPUBuffer(card().device, new Uint32Array(bytes.buffer), usage).gpuBuffer;
            }
        },
        release: () => {
            for (const source of textures.values()) if (source.kind === 'image') source.image.close();
            textures.clear();
            buffers.clear();
        },
    };
};
