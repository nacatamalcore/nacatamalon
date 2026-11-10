import { bitmapPixels } from '../headless_environment';
import { paintFrame } from './paint_frame';
import type { TPaintStore, TPainted } from './paint_frame';
import type { TColor } from '../../color';
import type { IRenderer } from '../../render/interface/i_renderer';
import type { ITexture } from '../../render/interface/i_texture';
import type { IBuffer } from '../../render/interface/i_buffer';
import type { TFrameContext } from '../../render/interface/t_frame_context';

/**
 * A renderer with no graphics card behind it, for a game run without a browser.
 *
 * While the game runs it draws nothing, so running costs what it did: every frame is handed over
 * and forgotten, as before. What it keeps is what the game hands it (each picture's pixels, each
 * buffer's numbers), so that when a picture of the game is asked for (`paint`), the frame can be
 * drawn here, in memory, the way the card would have drawn it.
 *
 * It says it is WebGPU, the backend the engine is written against first, so nothing takes a path
 * made for the other one.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TCpuRenderer = IRenderer & {
    /**
     * Draws `ctx` in memory and gives back the screen's picture, `width` by `height`, with what it
     * could not draw.
     */
    paint(ctx: TFrameContext, width: number, height: number): TPainted;
};

/**
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const createCpuRenderer = (options: { background: TColor; smooth: boolean }): TCpuRenderer => {
    const store: TPaintStore = {
        pictures: new WeakMap(),
        buffers: new WeakMap(),
        smooth: options.smooth,
        background: options.background,
    };
    const texture = (): ITexture => ({ resourceType: 'texture' });

    return {
        capabilities: { backend: 'WEBGPU', msaa: 1 },
        // Nothing to draw, so a crossing's picture of the scene going out counts as taken: the
        // change must not wait for a card that is not there.
        frame: (ctx) => {
            for (const effect of ctx.post ?? []) {
                if (effect.outgoing === 'take') effect.outgoing = 'taken';
            }
        },
        createTexture: (image) => {
            const made = texture();
            const pixels = bitmapPixels.get(image as unknown as object);
            if (pixels !== undefined) {
                store.pictures.set(made, pixels);
            }
            return made;
        },
        setSmooth: (smooth) => {
            store.smooth = smooth;
        },
        createBuffer: (data) => {
            const made: IBuffer = { resourceType: 'buffer' };
            store.buffers.set(made, data.slice());
            return made;
        },
        updateBuffer: (buffer, data, at = 0) => {
            // From the beginning, as a card's buffer is written: whatever was past it is kept. What
            // does not fit is not written at all, as a card refuses it, so a picture taken here
            // does not show what the screen would not.
            const held = store.buffers.get(buffer);
            const first = at / data.BYTES_PER_ELEMENT;
            if (held !== undefined && held.length >= first + data.length) {
                held.set(data, first);
            }
        },
        destroyBuffer: (buffer) => {
            store.buffers.delete(buffer);
        },
        createDataTexture: (data, width, height) => {
            const expected = width * height * 4;
            if (data.length !== expected) {
                throw new Error(`[NacatamalOn] createDataTexture: ${width} by ${height} needs ${expected} bytes and ${data.length} were given.`);
            }
            const made = texture();
            store.pictures.set(made, { width, height, data: data.slice() });
            return made;
        },
        updateDataTexture: (target, data, width, height, region) => {
            const held = store.pictures.get(target);
            if (held === undefined || held.width !== width || held.height !== height) {
                if (data.length !== width * height * 4) {
                    throw new Error(`[NacatamalOn] updateDataTexture: ${width} by ${height} needs ${width * height * 4} bytes and ${data.length} were given.`);
                }
                store.pictures.set(target, { width, height, data: data.slice() });
                return;
            }
            if (region === undefined) {
                held.data.set(data.subarray(0, width * height * 4));
                return;
            }
            for (let y = region.y; y < region.y + region.height; y++) {
                const from = (y * width + region.x) * 4;
                held.data.set(data.subarray(from, from + region.width * 4), from);
            }
        },
        createRenderTexture: (width, height) => {
            // Its bytes are only made when a picture is painted into it, so a game that never asks
            // for one does not hold them.
            const made = texture();
            store.pictures.set(made, { width, height, data: new Uint8Array(0) });
            return made;
        },
        // What a pass drew into is only drawn when a picture is asked for, so a capture made by the
        // game itself reads nothing back, as it did.
        readTexture: async () => ({ width: 0, height: 0, data: new Uint8Array(0) }),
        destroyTexture: (target) => {
            store.pictures.delete(target);
        },
        destroy: () => {},
        paint: (ctx, width, height) => paintFrame(ctx, width, height, store),
    };
};
