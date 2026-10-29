import { afterEach, describe, expect, it, mock, spyOn } from 'bun:test';
import { createMaterial } from '../src/gameobjects/material/create_material';
import { applyShader, rememberOverrides } from '../src/materials/apply_shader';
import { newPostEffect } from '../src/post/new_post_effect';
import { createSpriteMaterials } from '../src/render/webgl2/material/sprite_materials';
import { createTilemapMaterials } from '../src/render/webgl2/material/tilemap_materials';
import { createMeshMaterials } from '../src/render/webgl2/material/mesh_materials';
import { createMeshMaterials as createGpuMeshMaterials } from '../src/render/webgpu/material/mesh_materials';
import type { TDrawShader } from '../src/render/interface/draw/t_draw_material';
import type { TShader } from '../src/loaders/shader/types/t_shader';

/**
 * A material holds 64 numbers, the engine's own included, on both cards. One that asks for more is
 * told so when it is made, once, and both cards draw it with the built-in look. WebGL2 used to throw
 * out of the middle of every frame instead, and take everything else in it down too.
 */

/**
 * `count` colours, each four numbers: with `mu.time` and `mu.resolution` taking the first four,
 * fifteen fill a material exactly and sixteen are one too many.
 */
const colours = (count: number): Record<string, number[]> => {
    const knobs: Record<string, number[]> = {};
    for (let i = 0; i < count; i++) knobs[`c${i}`] = [1, 0, 1, 1];
    return knobs;
};

const MESH = 'fn effect(surface: vec4<f32>, ctx: FragContext) -> vec4<f32> { return surface; }';
const SPRITE = 'fn effect(color: vec4<f32>, uv: vec2<f32>) -> vec4<f32> { return color; }';

/**
 * A card that answers everything and draws nothing, which is enough to see whether a program is built.
 */
const fakeGl = (): { gl: WebGL2RenderingContext; programs: () => number } => {
    let made = 0;
    const gl = new Proxy({
        createProgram: () => { made++; return {}; },
        getProgramParameter: () => true,
        getShaderParameter: () => true,
    } as Record<string, unknown>, {
        get: (target, key: string) => (key in target ? target[key] : () => ({})),
    }) as unknown as WebGL2RenderingContext;
    return { gl, programs: () => made };
};

const drawShader = (count: number, glsl: string): TDrawShader => ({
    id: 'm', name: 'crowded', fragment: MESH, fragmentGlsl: glsl, vertex: null, vertexGlsl: null,
    uniforms: colours(count),
    uniformSig: Object.fromEntries(Object.keys(colours(count)).map((name) => [name, 'vec4<f32>'])),
}) as unknown as TDrawShader;

// The card's numbers for which stage sees what, which a test runner does not have.
(globalThis as Record<string, unknown>).GPUShaderStage ??= { VERTEX: 1, FRAGMENT: 2, COMPUTE: 4 };

afterEach(() => { mock.restore(); });

describe('a material with more numbers than it holds', () => {
    it('is told when it is made, once for all its copies, with what it needs and what fits', () => {
        const warn = spyOn(console, 'warn').mockImplementation(() => {});
        for (let i = 0; i < 3; i++) {
            createMaterial({ shader: 'mesh3d', name: 'crowded', fragment: MESH, uniforms: colours(16) });
        }

        expect(warn).toHaveBeenCalledTimes(1);
        const said = String(warn.mock.calls[0]![0]);
        expect(said).toStartWith('[NacatamalOn] createMaterial: the material "crowded" needs 68 numbers');
        expect(said).toContain('one holds 64, mu.time and mu.resolution included, so it draws with the built-in look.');
    });

    it('says nothing when it fits exactly', () => {
        const warn = spyOn(console, 'warn').mockImplementation(() => {});
        createMaterial({ shader: 'mesh3d', fragment: MESH, uniforms: colours(15) });
        createMaterial({ fragment: SPRITE, uniforms: colours(15) });
        expect(warn).not.toHaveBeenCalled();
    });

    it('is told for a sprite too, and when a file adds the numbers that tip it over', () => {
        const warn = spyOn(console, 'warn').mockImplementation(() => {});
        createMaterial({ name: 'flat', fragment: SPRITE, uniforms: colours(17) });
        expect(String(warn.mock.calls[0]![0])).toContain('the material "flat" needs 72 numbers');

        // Fifteen asked at the call fit; the file's two more do not. What the call asked is kept
        // for when the file lands, which is what createMaterial does with a file still on the way.
        const material = createMaterial({ shader: 'mesh3d', name: 'filed', fragment: MESH, uniforms: colours(15) });
        rememberOverrides(material, colours(15));
        expect(warn).toHaveBeenCalledTimes(1);
        const file = {
            shader: 'mesh3d', src: '/more.wgsl', fragment: MESH, fragmentGlsl: null, vertex: null, vertexGlsl: null,
            uniforms: { x: [0, 0, 0, 0], y: [0, 0, 0, 0] }, uniformSig: { x: 'vec4<f32>', y: 'vec4<f32>' },
        } as unknown as TShader;
        applyShader(material, file);
        expect(warn).toHaveBeenCalledTimes(2);
        expect(String(warn.mock.calls[1]![0])).toContain('the material "filed" needs 72 numbers');
    });

    it('is told for a screen effect, whose four engine numbers leave room for fourteen colours', () => {
        const warn = spyOn(console, 'warn').mockImplementation(() => {});
        newPostEffect({ name: 'fits', fragment: SPRITE, uniforms: colours(14) }, null, 'scene');
        expect(warn).not.toHaveBeenCalled();

        newPostEffect({ name: 'tint', fragment: SPRITE, uniforms: colours(15) }, null, 'scene');
        const said = String(warn.mock.calls[0]![0]);
        expect(said).toStartWith('[NacatamalOn] usePostProcess: the effect "tint" needs 68 numbers');
        expect(said).toContain('mu.time, mu.resolution, mu.progress and mu.phase included, so it is skipped');
    });
});

describe('on each card, a material with too many numbers', () => {
    it('is drawn the built-in way on WebGL2 without building a program, sprite, map layer and model alike', () => {
        const warn = spyOn(console, 'warn').mockImplementation(() => {});
        const { gl, programs } = fakeGl();
        const glsl = 'vec4 effect(vec4 color, vec2 uv) { return color; }';

        expect(createSpriteMaterials(gl).get(drawShader(16, glsl)).failed).toBe(true);
        expect(createTilemapMaterials(gl).get(drawShader(16, glsl)).failed).toBe(true);
        expect(createMeshMaterials(gl).get(drawShader(16, 'vec4 effect(vec4 surface, FragContext ctx) { return surface; }')).failed).toBe(true);
        expect(programs()).toBe(0);
        // Said where it was made, not again by the card.
        expect(warn).not.toHaveBeenCalled();
    });

    it('builds one that fits exactly on WebGL2', () => {
        const { gl, programs } = fakeGl();
        expect(createSpriteMaterials(gl).get(drawShader(15, 'vec4 effect(vec4 color, vec2 uv) { return color; }')).failed).toBe(false);
        expect(programs()).toBe(1);
    });

    it('is drawn the built-in way on WebGPU, quietly', () => {
        const warn = spyOn(console, 'warn').mockImplementation(() => {});
        const layouts = { lights: {}, texture: {}, uniforms: {}, joints: {} } as never;
        const device = new Proxy({}, { get: () => () => ({}) }) as unknown as GPUDevice;
        const materials = createGpuMeshMaterials(device, 'rgba8unorm', 1, layouts, {} as GPUTexture, new Map());

        const entry = materials.get(drawShader(16, ''));
        expect(entry.failed).toBe(true);
        expect(entry.pipeline).toBeNull();
        expect(warn).not.toHaveBeenCalled();
    });
});
