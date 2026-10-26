import { afterEach, describe, expect, it, mock, spyOn } from 'bun:test';
import { createMeshMaterials } from '../src/render/webgpu/material/mesh_materials';
import { createMaterial } from '../src/gameobjects/material/create_material';

/**
 * A material's pipeline, compiled and checked apart from the frame.
 *
 * On WebGPU a shader that will not compile is not refused when it is made: the card says so a moment
 * later. A pipeline used in that moment is a broken one, and a broken pipeline throws away every draw
 * of its pass: a whole frame gone, not one model. So a material is not drawn until the card has said
 * its pipeline is good, and falls back to the built-in shader once it has said it is not.
 */

// The card's numbers for which stage sees what, which a test runner does not have.
(globalThis as Record<string, unknown>).GPUShaderStage ??= { VERTEX: 1, FRAGMENT: 2, COMPUTE: 4 };
(globalThis as Record<string, unknown>).GPUBufferUsage ??= { UNIFORM: 64, COPY_DST: 8 };

/**
 * A card that answers when it is told to: each pipeline asked for waits until `settle` says whether
 * it compiled.
 */
const fakeDevice = (messages: string[] = []) => {
    const asked: Array<{ resolve: (pipeline: unknown) => void; reject: (error: unknown) => void }> = [];
    const device = {
        createBindGroupLayout: () => ({}),
        createPipelineLayout: () => ({}),
        createShaderModule: () => ({
            getCompilationInfo: () => Promise.resolve({ messages: messages.map((message) => ({ type: 'error', lineNum: 3, message })) }),
        }),
        createRenderPipelineAsync: () => new Promise((resolve, reject) => { asked.push({ resolve, reject }); }),
        pushErrorScope: () => {},
        popErrorScope: () => Promise.resolve(null),
    };
    const settle = async (good: boolean): Promise<void> => {
        for (const one of asked) {
            if (good) one.resolve({ pipeline: true }); else one.reject(new Error('Invalid ShaderModule'));
        }
        // The answers, then what they set off, then the compilation messages a refusal reads.
        for (let i = 0; i < 5; i++) await Promise.resolve();
    };
    return { device: device as unknown as GPUDevice, settle };
};

const layouts = { lights: {}, texture: {}, uniforms: {}, joints: {} } as never;
const effect = () => createMaterial({ shader: 'mesh3d', fragment: 'fn effect(surface: vec4<f32>, ctx: FragContext) -> vec4<f32> { return surface; }' });

afterEach(() => { mock.restore(); });

describe('a material whose pipeline is still being compiled', () => {
    it('is pending, and drawn only once the card has said its pipeline is good', async () => {
        const { device, settle } = fakeDevice();
        const materials = createMeshMaterials(device, 'rgba8unorm', 1, layouts, {} as GPUTexture, new Map());
        const entry = materials.get(effect());

        expect(entry.pending).toBe(true);
        expect(entry.pipeline).toBeNull();
        expect(entry.failed).toBe(false);

        await settle(true);
        expect(entry.pending).toBe(false);
        expect(entry.pipeline).not.toBeNull();
        expect(entry.transparentPipeline).not.toBeNull();
    });

    it('falls back to the built-in shader once the card refuses it, and says why in its own lines', async () => {
        const warn = spyOn(console, 'warn').mockImplementation(() => {});
        const { device, settle } = fakeDevice(["unresolved value 'nope'"]);
        const materials = createMeshMaterials(device, 'rgba8unorm', 1, layouts, {} as GPUTexture, new Map());
        const entry = materials.get(effect());

        await settle(false);
        expect(entry.pending).toBe(false);
        expect(entry.failed).toBe(true);
        expect(entry.pipeline).toBeNull();
        expect(warn).toHaveBeenCalledTimes(1);
        expect(String(warn.mock.calls[0]![1])).toContain("3: unresolved value 'nope'");
    });
});
