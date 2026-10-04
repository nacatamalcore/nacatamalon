import { describe, expect, it, spyOn } from 'bun:test';
import { SHADOW_MAP_SIZE } from '../src/render/shared/light_space';

/**
 * The one picture a light draws into, made twice: once per card.
 *
 * These tests exist because the two halves were written apart and have to end up saying the same
 * thing. Core's do not: one card clips the back of a shape away while making the map and the other
 * does not, one softens the edge and the other does not, and one has no bias at all. The result is
 * a scene that stripes itself on a machine you do not own, with the same numbers in the game.
 *
 * Neither card is real. What is checked is what each backend *asks* for, which is exactly where
 * the two are free to drift.
 */

// The names the WebGPU half reads off the global. Only the bits matter, and only that they differ.
Object.assign(globalThis, { GPUTextureUsage: { RENDER_ATTACHMENT: 16, TEXTURE_BINDING: 4 } });

const { createShadowMap: createWebGPUShadowMap, SHADOW_FORMAT } = await import('../src/render/webgpu/shadow/shadow_map');
const { createShadowMap: createWebGL2ShadowMap } = await import('../src/render/webgl2/shadow/shadow_map');

/**
 * A device that agrees to everything and remembers what it was asked for.
 */
const recordingDevice = () => {
    const textures: GPUTextureDescriptor[] = [];
    const samplers: GPUSamplerDescriptor[] = [];
    const device = {
        createTexture: (descriptor: GPUTextureDescriptor) => {
            textures.push(descriptor);
            return { createView: () => ({}), destroy: () => {} };
        },
        createSampler: (descriptor: GPUSamplerDescriptor) => {
            samplers.push(descriptor);
            return {};
        },
    } as unknown as GPUDevice;
    return { device, textures, samplers };
};

/**
 * A context whose constants are their own names, so what the code asked for can be read back in
 * words instead of numbers.
 */
const recordingGl = (complete = true) => {
    const params = new Map<string, unknown>();
    const calls: Array<{ name: string; args: unknown[] }> = [];
    const note = (name: string, ...args: unknown[]) => { calls.push({ name, args }); };

    const gl = new Proxy({
        createTexture: () => ({ id: 'texture' }),
        createFramebuffer: () => ({ id: 'framebuffer' }),
        bindTexture: (...a: unknown[]) => note('bindTexture', ...a),
        bindFramebuffer: (...a: unknown[]) => note('bindFramebuffer', ...a),
        texImage2D: (...a: unknown[]) => note('texImage2D', ...a),
        texParameteri: (_target: string, name: string, value: unknown) => { params.set(name, value); },
        framebufferTexture2D: (...a: unknown[]) => note('framebufferTexture2D', ...a),
        drawBuffers: (...a: unknown[]) => note('drawBuffers', ...a),
        readBuffer: (...a: unknown[]) => note('readBuffer', ...a),
        checkFramebufferStatus: () => (complete ? 'FRAMEBUFFER_COMPLETE' : 'FRAMEBUFFER_INCOMPLETE_ATTACHMENT'),
        deleteTexture: (...a: unknown[]) => note('deleteTexture', ...a),
        deleteFramebuffer: (...a: unknown[]) => note('deleteFramebuffer', ...a),
    } as Record<string, unknown>, {
        // Anything not written above is a constant, and its value is its own name.
        get: (target, key: string) => (key in target ? target[key] : key),
    }) as unknown as WebGL2RenderingContext;

    return { gl, params, calls };
};

describe('the picture a light draws into, on WebGPU', () => {
    it('is a full-float depth picture that can be both drawn into and read', () => {
        const { device, textures } = recordingDevice();
        createWebGPUShadowMap(device);

        expect(textures).toHaveLength(1);
        expect(textures[0].format).toBe(SHADOW_FORMAT);
        expect(SHADOW_FORMAT).toBe('depth32float');
        // Both halves of the job. Only the first is what the frame's own depth already had, and
        // the whole of this step is that reading it back is the second.
        expect(textures[0].usage & GPUTextureUsage.RENDER_ATTACHMENT).toBeTruthy();
        expect(textures[0].usage & GPUTextureUsage.TEXTURE_BINDING).toBeTruthy();
    });

    it('reads it by comparing rather than by looking, and softens four steps at once', () => {
        const { device, samplers } = recordingDevice();
        createWebGPUShadowMap(device);

        expect(samplers[0].compare).toBe('less-equal');
        // Linear on a comparing sampler is not blur: it is the card answering four steps and
        // averaging the yeses, which is the free softening. Nearest would throw it away.
        expect(samplers[0].magFilter).toBe('linear');
        expect(samplers[0].minFilter).toBe('linear');
        expect(samplers[0].addressModeU).toBe('clamp-to-edge');
        expect(samplers[0].addressModeV).toBe('clamp-to-edge');
    });
});

describe('the picture a light draws into, on WebGL2', () => {
    it('is a full-float depth texture, not the renderbuffer the frame uses', () => {
        const { gl, calls } = recordingGl();
        createWebGL2ShadowMap(gl);

        const upload = calls.find((call) => call.name === 'texImage2D');
        expect(upload).toBeDefined();
        expect(upload!.args[2]).toBe('DEPTH_COMPONENT32F');
        expect(upload!.args[3]).toBe(SHADOW_MAP_SIZE);
        expect(upload!.args[4]).toBe(SHADOW_MAP_SIZE);
    });

    it('reads it by comparing rather than by looking, by the same comparison as the other card', () => {
        const { gl, params } = recordingGl();
        createWebGL2ShadowMap(gl);

        expect(params.get('TEXTURE_COMPARE_MODE')).toBe('COMPARE_REF_TO_TEXTURE');
        // LEQUAL is what the other card calls `less-equal`. Two names, and it has to be one choice.
        expect(params.get('TEXTURE_COMPARE_FUNC')).toBe('LEQUAL');
        expect(params.get('TEXTURE_MIN_FILTER')).toBe('LINEAR');
        expect(params.get('TEXTURE_MAG_FILTER')).toBe('LINEAR');
        expect(params.get('TEXTURE_WRAP_S')).toBe('CLAMP_TO_EDGE');
        expect(params.get('TEXTURE_WRAP_T')).toBe('CLAMP_TO_EDGE');
    });

    it('says out loud that it draws no colour, which is what stops the card calling it incomplete', () => {
        const { gl, calls } = recordingGl();
        createWebGL2ShadowMap(gl);

        expect(calls.find((call) => call.name === 'drawBuffers')!.args[0]).toEqual(['NONE']);
        expect(calls.find((call) => call.name === 'readBuffer')!.args[0]).toBe('NONE');
    });

    it('gives nothing back and says why when the card will not take it, instead of throwing', () => {
        const warn = spyOn(console, 'warn').mockImplementation(() => {});
        const { gl, calls } = recordingGl(false);

        const map = createWebGL2ShadowMap(gl);

        expect(map).toBeNull();
        expect(warn).toHaveBeenCalled();
        // And it takes back what it made: a refused map must not leak a picture this size.
        expect(calls.some((call) => call.name === 'deleteTexture')).toBe(true);
        expect(calls.some((call) => call.name === 'deleteFramebuffer')).toBe(true);
        warn.mockRestore();
    });
});

describe('what the two cards must not disagree about', () => {
    it('is the same size on both, because it is one number and not two', () => {
        const { device, textures } = recordingDevice();
        const webgpu = createWebGPUShadowMap(device);
        const { gl } = recordingGl();
        const webgl2 = createWebGL2ShadowMap(gl);

        expect(webgpu.size).toBe(SHADOW_MAP_SIZE);
        expect(webgl2!.size).toBe(SHADOW_MAP_SIZE);
        expect(textures[0].size).toEqual({ width: SHADOW_MAP_SIZE, height: SHADOW_MAP_SIZE });
    });
});
