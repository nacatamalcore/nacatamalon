import { afterEach, describe, expect, it, mock, spyOn } from 'bun:test';
import { mipLevelsOf } from '../src/render/shared/mip_levels';
import { mapNamesOf } from '../src/render/shared/material_maps';
import { buildMeshMaterialShader, buildMeshMaterialShadowShader } from '../src/render/webgpu/material/mesh_material_shader';
import { buildMeshMaterialShaderGlsl, buildMeshMaterialShadowShaderGlsl } from '../src/render/webgl2/material/mesh_material_shader';
import { flatMapsWgsl } from '../src/render/webgpu/material/flat_maps';
import { flatMapsGlsl } from '../src/render/webgl2/material/flat_maps';
import { buildSpriteMaterialShader } from '../src/render/webgpu/material/sprite_material_shader';
import { generateWebGPUMipmaps } from '../src/render/webgpu/texture/generate_mipmaps';
import { createWebGPUDataTexture } from '../src/render/webgpu/resources/create_data_texture';
import { updateWebGPUDataTexture } from '../src/render/webgpu/resources/update_data_texture';
import { createWebGL2DataTexture, updateWebGL2DataTexture } from '../src/render/webgl2/resources';
import { restoreTexture } from '../src/render/webgl2/texture';
import { compileShader, composerMapSample, composerMul, composerSwizzle, composerTextureSample, composerUniform, composerUv, composerVertexPosition, composerAdd, composerVec3, composerX, composerVec2 } from '../src/shader_composer';
import { nodeDef } from '../src/shader_composer';
import { createScene } from '../src/scene/create_scene';
import { createPixelTexture } from '../src/gameobjects/pixel_texture';
import { createPixels } from '../src/pixels';
import { useLoadTexture } from '../src/hooks/loaders/use_load_texture';
import { isMipmapped } from '../src/loaders/texture/mipmapped_texture';
import { whenLoaded } from '../src/loaders/track_load';
import { createTestGame, startTestScene } from './helpers/test_game';
import { parseSceneDoc, serializeScene } from '../src/scene/document';
import { loadAssets } from '../src/scene/document/scene_from_doc';
import { createMesh } from '../src/gameobjects/mesh/create_mesh';
import { useCubeGeometry } from '../src/hooks/geometry/use_cube_geometry';
import type { TWebGL2Texture } from '../src/render/webgl2/texture';
import type { TTexture } from '../src/loaders';
import type { TComposerNode } from '../src/shader_composer';

/**
 * Pictures with mipmaps: smaller and smaller copies, made on the card, and read by a model from the
 * copy its size on the screen asks for. The built-in shader picks the copy on its own; a material's
 * readers pick it by how the model's picture coordinate runs, measured once where every pixel is
 * still running, so a hook may call them inside a branch.
 */

(globalThis as Record<string, unknown>).GPUTextureUsage ??= { COPY_SRC: 1, COPY_DST: 2, TEXTURE_BINDING: 4, STORAGE_BINDING: 8, RENDER_ATTACHMENT: 16 };

const SIG = {};
const WGSL_TILE = `fn effect(surface: vec4<f32>, ctx: FragContext) -> vec4<f32> {
    if (ctx.uv.x > 0.5) { return sampleMapScaled_detail(ctx.uv * 8.0, vec2<f32>(8.0)); }
    return sampleMap_tint(ctx.uv);
}`;
const GLSL_TILE = `vec4 effect(vec4 surface, FragContext ctx) {
    if (ctx.uv.x > 0.5) { return sampleMapScaled_detail(ctx.uv * 8.0, vec2(8.0)); }
    return sampleMap_tint(ctx.uv);
}`;

describe('how many copies a picture has', () => {
    it('halves down to one pixel, by its longer side', () => {
        expect(mipLevelsOf(256, 64)).toBe(9);
        expect(mipLevelsOf(1, 1)).toBe(1);
        expect(mipLevelsOf(5, 3)).toBe(3);
        expect(mipLevelsOf(0, 0)).toBe(1);
    });
});

describe('a material\'s readers, in WGSL', () => {
    const wgsl = buildMeshMaterialShader(WGSL_TILE, null, SIG, mapNamesOf(WGSL_TILE));

    it('finds the maps read by either reader', () => {
        expect(mapNamesOf(WGSL_TILE)).toEqual(['detail', 'tint']);
    });

    it('measures the picture coordinate once, before the hook can branch', () => {
        const measured = wgsl.indexOf('meshUvDx = dpdx(uv);');
        expect(measured).toBeGreaterThan(-1);
        expect(wgsl).toContain('meshUvDy = dpdy(uv);');
        expect(measured).toBeLessThan(wgsl.indexOf('let shaded = effect('));
        expect(wgsl).toContain('var<private> meshUvDx: vec2<f32>;');
    });

    it('reads the picture and every map by the steps measured, and a scaled read by them times its scale', () => {
        expect(wgsl).toContain('return textureSampleGrad(meshTexture, meshSampler, uv, meshUvDx, meshUvDy);');
        expect(wgsl).toContain('fn sampleTextureScaled(uv: vec2<f32>, scale: vec2<f32>) -> vec4<f32> {\n    return textureSampleGrad(meshTexture, meshSampler, uv, meshUvDx * scale, meshUvDy * scale);');
        expect(wgsl).toContain('fn sampleMapScaled_detail(uv: vec2<f32>, scale: vec2<f32>) -> vec4<f32> {\n    return textureSampleGrad(mapTexture0, mapSampler0, uv, meshUvDx * scale, meshUvDy * scale);');
        expect(wgsl).toContain('fn sampleMap_tint(uv: vec2<f32>) -> vec4<f32> {\n    return textureSampleGrad(mapTexture1, mapSampler1, uv, meshUvDx, meshUvDy);');
        // No read a hook can reach that a branch would make illegal, or that ignores the mipmaps.
        // The occlusion's is the one plain read, called before the hook (see below).
        expect(wgsl).not.toMatch(/textureSample\((?!meshOcclusion)|textureSampleLevel\(meshTexture|textureSampleLevel\(mapTexture/);
    });

    it('measures it in a shadow cut out of its picture too, and declares the steps in one that is not', () => {
        const cut = buildMeshMaterialShadowShader(null, SIG, ['tint'], false, { fragment: WGSL_TILE.replace(/sampleMapScaled_detail\(ctx.uv \* 8.0, vec2<f32>\(8.0\)\)/, 'vec4<f32>(1.0)') });
        expect(cut).toContain('meshUvDx = dpdx(in.uv);');
        // A corner hook reading a map in a shadow with no colour stage: the readers are there, the
        // steps stay zero, so the picture itself is read.
        const plain = buildMeshMaterialShadowShader('fn vertex(pos: vec3<f32>, ctx: VertContext) -> vec3<f32> { return pos + sampleMap_height(ctx.uv).xyz; }', SIG, ['height']);
        expect(plain).toContain('var<private> meshUvDx: vec2<f32>;');
        expect(plain).not.toContain('dpdx');
    });
});

describe('the occlusion picture', () => {
    it('is read from its mipmaps too, by the read that picks one, called only where nothing has branched', () => {
        expect(buildMeshMaterialShader(null, null, SIG)).toContain('textureSample(meshOcclusion, occlusionSampler, uv).r');
        expect(buildMeshMaterialShaderGlsl(null, null, SIG).fragment).toContain('texture(meshOcclusion, uv).r');
    });
});

describe('a material\'s readers, in GLSL', () => {
    const { vertex, fragment } = buildMeshMaterialShaderGlsl(
        GLSL_TILE,
        'vec3 vertex(vec3 pos, VertContext ctx) { return pos + sampleMapScaled_detail(pos.xz, vec2(2.0)).xyz; }',
        SIG,
        ['detail', 'tint'],
    );

    it('measures the picture coordinate at the top of the colour half', () => {
        expect(fragment).toContain('meshUvDx = dFdx(uv);');
        expect(fragment.indexOf('meshUvDx = dFdx(uv);')).toBeLessThan(fragment.indexOf('vec4 shaded = effect('));
        expect(fragment).toContain('vec4 sampleTextureScaled(vec2 uv, vec2 scale) {\n    return textureGrad(meshTexture, uv, meshUvDx * scale, meshUvDy * scale);');
        expect(fragment).toContain('vec4 sampleMapScaled_detail(vec2 uv, vec2 scale) {\n    return textureGrad(meshMap0, uv, meshUvDx * scale, meshUvDy * scale);');
    });

    it('reads the picture itself in the corner half, scale or no scale', () => {
        expect(vertex).toContain('vec4 sampleMapScaled_detail(vec2 uv, vec2 scale) {\n    return textureLod(meshMap0, uv, 0.0);');
        expect(vertex).not.toContain('textureGrad');
        expect(vertex).not.toContain('dFdx');
    });

    it('measures it in a shadow cut out of its picture', () => {
        const cut = buildMeshMaterialShadowShaderGlsl(null, SIG, ['tint'], false, { fragment: 'vec4 effect(vec4 surface, FragContext ctx) { return sampleMap_tint(ctx.uv); }' });
        expect(cut.fragment).toContain('meshUvDx = dFdx(vUv);');
    });
});

describe('what is flat', () => {
    it('has the scaled readers too, reading the picture itself as the plain ones do', () => {
        expect(flatMapsWgsl(2, ['grain'])).toContain('fn sampleMapScaled_grain(uv: vec2f, scale: vec2f) -> vec4f {\n    return sampleMap_grain(uv);');
        expect(flatMapsGlsl(['grain'])).toContain('vec4 sampleMapScaled_grain(vec2 uv, vec2 scale) {\n    return sampleMap_grain(uv);');
        expect(buildSpriteMaterialShader('fn effect(color: vec4f) -> vec4f { return sampleTextureScaled(vec2f(0.5), vec2f(2.0)); }', SIG)).toContain('fn sampleTextureScaled(uv: vec2f, scale: vec2f) -> vec4f');
    });
});

describe('the shader composer', () => {
    const lit = (color: ReturnType<typeof composerUv>) => compileShader({ shader: 'mesh3d', color: composerSwizzle(color, 'rgb') });

    it('reads with the scale it is given, as a pair', () => {
        const one = lit(composerMapSample('detail', composerMul(composerUv(), 8), { scale: 8 }));
        expect(one.fragment).toMatch(/sampleMapScaled_detail\(.*vec2<f32>\(8\.0\)\)/);
        const two = lit(composerTextureSample(composerUv(), { scale: [4, 2] }));
        expect(two.fragment).toMatch(/sampleTextureScaled\(.*vec2<f32>\(4\.0, 2\.0\)\)/);
        expect(two.fragmentGlsl).toMatch(/sampleTextureScaled\(.*vec2\(4\.0, 2\.0\)\)/);
    });

    it('takes a scale worked out in the graph', () => {
        const shader = lit(composerMapSample('detail', composerUv(), { scale: composerUniform('tiles', [3, 3]) }));
        expect(shader.fragment).toMatch(/sampleMapScaled_detail\(.*mu\.tiles/);
    });

    it('reads plainly without one, and in a vertex graph reads the scaled one, which reads the picture itself', () => {
        expect(lit(composerMapSample('detail', composerUv())).fragment).toContain('sampleMap_detail(');
        const moved = compileShader({
            shader: 'mesh3d',
            position: composerAdd(composerVertexPosition(), composerVec3(0, composerX(composerMapSample('height', composerUv(), { scale: 2 })), 0)),
        });
        expect(moved.vertex).toContain('sampleMapScaled_height(');
    });

    it('refuses a scale of the wrong size', () => {
        expect(() => composerMapSample('detail', composerUv(), { scale: composerVec3(1, 2, 3) })).toThrow();
        expect(() => composerMapSample('detail', composerUv(), { scale: composerVec2(1, 2) })).not.toThrow();
    });

    it('has a Scale on its sample nodes that reads plainly at 1, as a graph saved before it reads', () => {
        const map = nodeDef('mapSample');
        const uv = composerUv();
        // A sample node builds one value.
        const read = (def: ReturnType<typeof nodeDef>, params: Record<string, string | number>) => def.build({ uv }, params) as TComposerNode;
        expect(map.params.find((p) => p.name === 'scale')?.default).toBe(1);
        expect(lit(read(map, { name: 'detail', scale: 1 })).fragment).toContain('sampleMap_detail(');
        expect(lit(read(map, { name: 'detail' })).fragment).toContain('sampleMap_detail(');
        expect(lit(read(map, { name: 'detail', scale: 8 })).fragment).toContain('sampleMapScaled_detail(');
        expect(lit(read(nodeDef('textureSample'), { scale: 0 })).fragment).toContain('sampleTextureScaled(');
    });
});

/**
 * A graphics card that remembers what it was asked to make and draw.
 */
const recordingDevice = () => {
    const textures: GPUTextureDescriptor[] = [];
    const passes: GPURenderPassDescriptor[] = [];
    let submits = 0;
    const device = {
        createTexture: (desc: GPUTextureDescriptor) => {
            textures.push(desc);
            return { mipLevelCount: desc.mipLevelCount ?? 1, createView: (view: unknown) => view ?? {} };
        },
        queue: { writeTexture: () => {}, submit: () => { submits++; } },
        createShaderModule: () => ({}),
        createRenderPipeline: () => ({ getBindGroupLayout: () => ({}) }),
        createSampler: () => ({}),
        createBindGroup: () => ({}),
        createCommandEncoder: () => ({
            beginRenderPass: (desc: GPURenderPassDescriptor) => {
                passes.push(desc);
                return { setPipeline: () => {}, setBindGroup: () => {}, draw: () => {}, end: () => {} };
            },
            finish: () => ({}),
        }),
    } as unknown as GPUDevice;
    return { device, textures, passes, submits: () => submits };
};

describe('mipmaps on WebGPU', () => {
    it('makes the whole chain, drawable, and draws every copy after the first from the one before', () => {
        const { device, textures, passes, submits } = recordingDevice();
        createWebGPUDataTexture(device, new Uint8Array(16 * 4 * 4), 16, 4, true);

        expect(textures[0]!.mipLevelCount).toBe(5);
        expect((textures[0]!.usage as number) & GPUTextureUsage.RENDER_ATTACHMENT).toBeTruthy();
        expect(passes.map((p) => ((p.colorAttachments as GPURenderPassColorAttachment[])[0]!.view as GPUTextureViewDescriptor).baseMipLevel)).toEqual([1, 2, 3, 4]);
        expect(submits()).toBe(1);
    });

    it('makes one level and draws nothing without them', () => {
        const { device, textures, passes } = recordingDevice();
        createWebGPUDataTexture(device, new Uint8Array(16 * 4 * 4), 16, 4);

        expect(textures[0]!.mipLevelCount).toBe(1);
        expect((textures[0]!.usage as number) & GPUTextureUsage.RENDER_ATTACHMENT).toBeFalsy();
        expect(passes).toHaveLength(0);
    });

    it('works the chain out again on every update, however small', () => {
        const { device, passes } = recordingDevice();
        const texture = createWebGPUDataTexture(device, new Uint8Array(8 * 8 * 4), 8, 8, true);
        passes.length = 0;

        updateWebGPUDataTexture(device, texture, new Uint8Array(8 * 8 * 4), 8, 8, { x: 1, y: 1, width: 1, height: 1 });

        expect(passes).toHaveLength(3);
    });

    it('has nothing to work out for a texture of one level', () => {
        const { device, passes } = recordingDevice();
        generateWebGPUMipmaps(device, { mipLevelCount: 1 } as GPUTexture);
        expect(passes).toHaveLength(0);
    });
});

/**
 * A WebGL2 context that remembers its texture parameters and every chain worked out.
 */
const recordingGl = () => {
    const parameters: Array<[number, number]> = [];
    let generated = 0;
    const gl = new Proxy({
        TEXTURE_MAX_LEVEL: 0x813d,
        texParameteri: (_target: number, name: number, value: number) => { parameters.push([name, value]); },
        generateMipmap: () => { generated++; },
    } as Record<string, unknown>, {
        get: (target, key: string) => (key in target ? target[key] : () => ({})),
    }) as unknown as WebGL2RenderingContext;
    return { gl, parameters, generated: () => generated };
};

describe('mipmaps on WebGL2', () => {
    it('works the chain out on upload, on every update and on a restore', () => {
        const { gl, generated } = recordingGl();
        const data = new Uint8Array(4 * 4 * 4);
        const texture = createWebGL2DataTexture(gl, data, 4, 4, true) as TWebGL2Texture;
        expect(generated()).toBe(1);

        updateWebGL2DataTexture(gl, false, texture, data, 4, 4, { x: 0, y: 0, width: 1, height: 1 });
        expect(generated()).toBe(2);

        restoreTexture(gl, texture);
        expect(generated()).toBe(3);
    });

    it('ends a texture without them at its first level, so a model\'s samplers find it complete', () => {
        const { gl, parameters, generated } = recordingGl();
        const texture = createWebGL2DataTexture(gl, new Uint8Array(4 * 4 * 4), 4, 4) as TWebGL2Texture;

        expect(parameters).toContainEqual([0x813d, 0]);
        expect(generated()).toBe(0);
        updateWebGL2DataTexture(gl, false, texture, new Uint8Array(4 * 4 * 4), 4, 4);
        expect(generated()).toBe(0);
    });
});

describe('asking for mipmaps', () => {
    afterEach(() => {
        mock.restore();
    });

    it('passes a painted picture\'s wish to the renderer, and makes it again when asked the other way', () => {
        const { store, renderer } = createTestGame();
        const asked: Array<boolean | undefined> = [];
        const original = renderer.createDataTexture;
        renderer.createDataTexture = (data, width, height, mipmaps) => {
            asked.push(mipmaps);
            return original(data, width, height, mipmaps);
        };
        const made: TTexture[] = [];
        startTestScene(store, 'S', () => {
            made.push(createPixelTexture(createPixels(8, 8), { key: 'floor', mipmaps: true }));
            made.push(createPixelTexture(createPixels(8, 8), { key: 'floor', mipmaps: true }));
            made.push(createPixelTexture(createPixels(8, 8), { key: 'floor' }));
            return createScene();
        });

        // The same size and the same wish: the same texture, updated. The other wish: a new one.
        expect(asked).toEqual([true, false]);
        expect(made[1]).toBe(made[0]);
        expect(made[2]).not.toBe(made[0]);
        expect(isMipmapped(made[0]!)).toBe(true);
        expect(isMipmapped(made[2]!)).toBe(false);
    });

    it('passes a loaded picture\'s wish to the renderer, and says so when a key is asked for the other way', async () => {
        const { store, renderer } = createTestGame();
        spyOn(globalThis, 'fetch').mockImplementation((async () => new Response(new Blob(['png']))) as unknown as typeof fetch);
        Object.assign(globalThis, { createImageBitmap: async () => ({ width: 8, height: 8, close: () => {} }) });
        const asked: Array<boolean | undefined> = [];
        renderer.createTexture = (_image, mipmaps) => {
            asked.push(mipmaps);
            return { resourceType: 'texture' };
        };
        const warn = spyOn(console, 'warn').mockImplementation(() => {});
        let texture!: TTexture;
        startTestScene(store, 'S', () => {
            texture = useLoadTexture({ src: '/floor.png', mipmaps: true });
            useLoadTexture({ src: '/floor.png' });
            return createScene();
        });
        await whenLoaded(texture);

        expect(asked).toEqual([true]);
        expect(warn).toHaveBeenCalledTimes(1);
        expect(String(warn.mock.calls[0]![0])).toContain('already loaded with mipmaps');
    });
});

describe('a scene document', () => {
    afterEach(() => {
        mock.restore();
    });

    it('writes down a texture loaded with mipmaps, reads it back, and loads it the same way', () => {
        spyOn(globalThis, 'fetch').mockImplementation((async () => new Response(new Blob(['png']))) as unknown as typeof fetch);
        Object.assign(globalThis, { createImageBitmap: async () => ({ width: 8, height: 8, close: () => {} }) });
        const written = (mipmaps: boolean) => {
            const { store } = createTestGame();
            const root = startTestScene(store, 'Level', () => {
                createMesh({ geometry: useCubeGeometry(), texture: useLoadTexture({ src: '/road.png', mipmaps }) });
                return createScene();
            });
            return serializeScene(root);
        };
        const textureOf = (doc: ReturnType<typeof written>) => doc.assets.find((a) => a.type === 'texture');

        expect(textureOf(written(false))).not.toHaveProperty('mipmaps');
        const on = written(true);
        expect(textureOf(on)).toMatchObject({ type: 'texture', mipmaps: true });
        expect(parseSceneDoc(on, '/scenes/level.scene')).toEqual(on);

        // Loaded from the document, before any script, it is loaded with them.
        const { store } = createTestGame();
        let loaded: TTexture | undefined;
        startTestScene(store, 'Again', () => {
            loadAssets(on.assets, '/scenes/level.scene');
            loaded = store.get('assets').textures.get(textureOf(on)!.key);
            return createScene();
        });
        expect(isMipmapped(loaded!)).toBe(true);
    });
});
