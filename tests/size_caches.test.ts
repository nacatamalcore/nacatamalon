import { describe, expect, it } from 'bun:test';
import { depthViewFor, multisampledViewFor, releaseUnusedDepths } from '../src/render/webgpu/frame/depth';
import { releaseUnusedUpright } from '../src/render/webgl2/frame/render_frame';
import type { TWebGPUState } from '../src/render/webgpu/types/t_webgpu_state';
import type { TWebGL2State } from '../src/render/webgl2/types/t_webgl2_state';

/**
 * What each backend keeps once per size: the depth a pass draws against (WebGPU), and the place a
 * picture is drawn in before it is turned the right way up (WebGL2).
 *
 * Kept because a size drawn every frame should not be made every frame. Let go when a frame did not
 * draw at that size, because some sizes are drawn once: a capture framed at the project's size, the
 * old size of a window that has been resized. Without that each one stayed for the life of the game.
 */

// Bun has no browser, so none of WebGPU's flag tables: the one the depth picture names is enough.
(globalThis as { GPUTextureUsage?: unknown }).GPUTextureUsage ??= { RENDER_ATTACHMENT: 0x10 };

const fakeGpu = (samples = 1) => {
    const made: Array<{ size: string; destroyed: boolean; samples?: number }> = [];
    const gpu = {
        device: {
            createTexture: ({ size, sampleCount }: { size: { width: number; height: number }; sampleCount?: number }) => {
                const entry = { size: `${size.width}x${size.height}`, destroyed: false, ...(sampleCount !== 1 ? { samples: sampleCount } : {}) };
                made.push(entry);
                return { createView: () => ({}), destroy: () => { entry.destroyed = true; } };
            },
        },
        depths: new Map(),
        depthsUsed: new Set(),
        samples,
        multisampled: new Map(),
        format: 'bgra8unorm',
    } as unknown as TWebGPUState;
    return { gpu, made };
};

describe('WebGPU depth pictures, one per size', () => {
    it('keeps a size drawn every frame, and makes it once', () => {
        const { gpu, made } = fakeGpu();
        for (let frame = 0; frame < 3; frame++) {
            depthViewFor(gpu, 640, 480);
            releaseUnusedDepths(gpu);
        }

        expect(made).toEqual([{ size: '640x480', destroyed: false }]);
    });

    it('lets go of a size the frame after it was last drawn at', () => {
        const { gpu, made } = fakeGpu();
        depthViewFor(gpu, 640, 480);
        depthViewFor(gpu, 320, 224);
        releaseUnusedDepths(gpu);

        // The capture is over: only the screen is drawn now.
        depthViewFor(gpu, 640, 480);
        releaseUnusedDepths(gpu);

        expect(made).toEqual([{ size: '640x480', destroyed: false }, { size: '320x224', destroyed: true }]);
        expect([...gpu.depths.keys()]).toEqual(['640x480']);
    });

    it('with msaa, draws against a depth of as many samples, beside a picture of as many, and lets both go', () => {
        const { gpu, made } = fakeGpu(4);
        depthViewFor(gpu, 640, 480);
        multisampledViewFor(gpu, 640, 480);
        releaseUnusedDepths(gpu);
        releaseUnusedDepths(gpu);

        expect(made).toEqual([
            { size: '640x480', destroyed: true, samples: 4 },
            { size: '640x480', destroyed: true, samples: 4 },
        ]);
    });

    it('without msaa, draws straight into the target', () => {
        const { gpu, made } = fakeGpu(1);

        expect(multisampledViewFor(gpu, 640, 480)).toBeNull();
        expect(made).toEqual([]);
    });
});

describe('WebGL2 upright places, one per size', () => {
    const fakeGl = () => {
        const deleted: string[] = [];
        const gl = {
            FRAMEBUFFER: 1, COLOR_ATTACHMENT0: 2, DEPTH_ATTACHMENT: 3, FRAMEBUFFER_ATTACHMENT_OBJECT_NAME: 4,
            bound: null as { name: string } | null,
            bindFramebuffer(_target: number, framebuffer: { name: string } | null) { this.bound = framebuffer; },
            getFramebufferAttachmentParameter(_target: number, attachment: number) {
                return { name: `${this.bound?.name}:${attachment === 2 ? 'color' : 'depth'}` };
            },
            deleteRenderbuffer: (what: { name: string } | null) => { deleted.push(`renderbuffer ${what?.name}`); },
            deleteFramebuffer: (what: { name: string }) => { deleted.push(`framebuffer ${what.name}`); },
        };
        return { gl, deleted };
    };

    it('lets go of a size this frame did not draw at, with both of its buffers, and keeps the rest', () => {
        const { gl, deleted } = fakeGl();
        const state = {
            gl,
            upright: new Map([['640x480', { name: 'screen-size' }], ['320x224', { name: 'capture' }]]),
            uprightUsed: new Set(['640x480']),
            canvases: new Map(),
            canvasesUsed: new Set(),
            samples: 1,
            multisampled: new Map(),
            multisampledUsed: new Set(),
        } as unknown as TWebGL2State;

        releaseUnusedUpright(state);

        expect(deleted.sort()).toEqual(['framebuffer capture', 'renderbuffer capture:color', 'renderbuffer capture:depth']);
        expect([...state.upright.keys()]).toEqual(['640x480']);
        expect(state.uprightUsed.size).toBe(0);
    });
});
