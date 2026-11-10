import { describe, expect, it } from 'bun:test';
import { mapNamesOf } from '../src/render/shared/material_maps';
import { buildMeshMaterialShader, buildMeshMaterialShadowShader } from '../src/render/webgpu/material/mesh_material_shader';
import { buildMeshMaterialShaderGlsl, buildMeshMaterialShadowShaderGlsl } from '../src/render/webgl2/material/mesh_material_shader';
import { createMeshMaterials as createWebgl2MeshMaterials } from '../src/render/webgl2/material/mesh_materials';
import { createMeshMaterials as createWebgpuMeshMaterials } from '../src/render/webgpu/material/mesh_materials';
import { MESH_MAP_UNITS } from '../src/render/webgl2/bindings';
import { compileShader } from '../src/shader_composer/compile_shader';
import { composerMapSample, composerTextureSample, composerUv, composerVertexPosition } from '../src/shader_composer/inputs';
import { composerSwizzle, composerVec3 } from '../src/shader_composer/constructors';
import { composerAdd, composerMul } from '../src/shader_composer/math';
import type { TDrawShader } from '../src/render/interface/draw/t_draw_material';

/**
 * A material's maps read by its corner hook: a picture that moves the corners (a height map,
 * footprints pressed into snow), on both cards, in the model and in its shadow.
 */

// The card's numbers for which stage sees what, which a test runner does not have.
(globalThis as Record<string, unknown>).GPUShaderStage ??= { VERTEX: 1, FRAGMENT: 2, COMPUTE: 4 };
(globalThis as Record<string, unknown>).GPUBufferUsage ??= { UNIFORM: 64, COPY_DST: 8 };

const PRESS = `fn vertex(pos: vec3<f32>, ctx: VertContext) -> vec3<f32> {
    let h = sampleMap_height(pos.xz + 0.5).r;
    return pos - vec3<f32>(0.0, h * mu.depth, 0.0);
}`;
const PRESS_GLSL = `vec3 vertex(vec3 pos, VertContext ctx) {
    float h = sampleMap_height(pos.xz + 0.5).r;
    return pos - vec3(0.0, h * mu.depth, 0.0);
}`;
const TINT = `fn effect(surface: vec4<f32>, ctx: FragContext) -> vec4<f32> {
    return surface * sampleMap_tint(ctx.uv);
}`;
const TINT_GLSL = `vec4 effect(vec4 surface, FragContext ctx) {
    return surface * sampleMap_tint(ctx.uv);
}`;
const SIG = { depth: 'f32' } as const;

/**
 * A WebGL2 context that compiles anything and remembers which unit each sampler was put on.
 */
const fakeGl = () => {
    const units = new Map<string, number>();
    const gl = new Proxy({
        getUniformLocation: (_program: unknown, name: string) => name,
        uniform1i: (name: string, unit: number) => { units.set(name, unit); },
        INVALID_INDEX: -1,
    } as Record<string, unknown>, {
        get: (target, key: string) => (key in target ? target[key] : () => ({})),
    }) as unknown as WebGL2RenderingContext;
    return { gl, units };
};

const drawShader = (parts: Partial<TDrawShader>): TDrawShader => ({
    id: 'snow', name: 'snow', fragment: null, vertex: null, fragmentGlsl: null, vertexGlsl: null, uniforms: { depth: 0.2 }, uniformSig: SIG,
    ...parts,
} as unknown as TDrawShader);

describe('the maps a material reads', () => {
    it('include those only its corner hook reads, after the colour hook\'s, each once', () => {
        expect(mapNamesOf(TINT, PRESS)).toEqual(['tint', 'height']);
        expect(mapNamesOf(null, PRESS)).toEqual(['height']);
        // Read by both: the colour hook's place is kept, so its slot does not move.
        expect(mapNamesOf(TINT, `${PRESS}\nfn extra() { sampleMap_tint(vec2<f32>(0.0)); }`)).toEqual(['tint', 'height']);
    });
});

describe('a corner hook that reads a map, in WGSL', () => {
    it('has its reader in the one module both stages share', () => {
        const wgsl = buildMeshMaterialShader(null, PRESS, SIG, ['height']);
        expect(wgsl).toContain('fn sampleMap_height(uv: vec2<f32>) -> vec4<f32> {\n    return textureSampleLevel(mapTexture0, mapSampler0, uv, 0.0);');
        // Declared before the hook that calls it.
        expect(wgsl.indexOf('fn sampleMap_height')).toBeLessThan(wgsl.indexOf('fn vertex('));
    });

    it('has it in its shadow too, cut or not', () => {
        expect(buildMeshMaterialShadowShader(PRESS, SIG, ['height'], false)).toContain('fn sampleMap_height(');
        expect(buildMeshMaterialShadowShader(PRESS, SIG, ['height'], true, { fragment: null })).toContain('fn sampleMap_height(');
    });

    it('binds the maps where the corner stage sees them, in the model and the model that bends', () => {
        const made: GPUBindGroupLayoutDescriptor[] = [];
        const device = {
            createBindGroupLayout: (descriptor: GPUBindGroupLayoutDescriptor) => { made.push(descriptor); return {}; },
            createPipelineLayout: () => ({}),
        } as unknown as GPUDevice;
        createWebgpuMeshMaterials(device, 'rgba8unorm', 1, { lights: {}, texture: {}, uniforms: {}, joints: {} } as never, {} as GPUTexture, new Map());

        const both = GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT;
        expect(made.map((layout) => layout.label)).toEqual(['mesh material layout', 'skinned mesh material layout']);
        for (const layout of made) {
            const maps = [...layout.entries].filter((entry) => entry.sampler !== undefined || entry.texture !== undefined);
            expect(maps).toHaveLength(8);
            for (const entry of maps) {
                expect(entry.visibility).toBe(both);
            }
        }
    });

    it('gives a map only the corner hook reads a slot of its own', () => {
        const modules: string[] = [];
        const device = {
            createBindGroupLayout: () => ({}),
            createPipelineLayout: () => ({}),
            createShaderModule: ({ code }: { code: string }) => {
                modules.push(code);
                return { getCompilationInfo: () => Promise.resolve({ messages: [] }) };
            },
            createRenderPipelineAsync: () => new Promise(() => {}),
            pushErrorScope: () => {},
            popErrorScope: () => Promise.resolve(null),
        } as unknown as GPUDevice;
        const materials = createWebgpuMeshMaterials(device, 'rgba8unorm', 1, { lights: {}, texture: {}, uniforms: {}, joints: {} } as never, {} as GPUTexture, new Map());

        const entry = materials.get(drawShader({ vertex: PRESS, fragment: TINT }));
        expect(entry.mapNames).toEqual(['tint', 'height']);
        expect(modules[0]).toContain('fn sampleMap_height(uv: vec2<f32>) -> vec4<f32> {\n    return textureSampleLevel(mapTexture1, mapSampler1, uv, 0.0);');

        materials.shadow(drawShader({ vertex: PRESS, fragment: TINT }));
        // The shadow reads the same map from the same slot as the model.
        expect(modules[1]).toContain('fn sampleMap_height(uv: vec2<f32>) -> vec4<f32> {\n    return textureSampleLevel(mapTexture1, mapSampler1, uv, 0.0);');
    });
});

describe('a corner hook that reads a map, in GLSL', () => {
    it('has the samplers and readers in the corner half, without envUv, which needs a FragContext', () => {
        const { vertex, fragment } = buildMeshMaterialShaderGlsl(TINT_GLSL, PRESS_GLSL, SIG, ['tint', 'height']);
        expect(vertex.match(/uniform sampler2D meshMap\d;/g)).toHaveLength(4);
        expect(vertex).toContain('vec4 sampleMap_height(vec2 uv) {\n    return textureLod(meshMap1, uv, 0.0);');
        expect(vertex.indexOf('vec4 sampleMap_height')).toBeLessThan(vertex.indexOf('vec3 vertex('));
        expect(vertex).not.toContain('envUv');
        // The colour half keeps its readers and envUv, by the same names on the same samplers.
        expect(fragment).toContain('vec4 sampleMap_height(vec2 uv) {\n    return textureLod(meshMap1, uv, 0.0);');
        expect(fragment).toContain('vec2 envUv(FragContext ctx)');
    });

    it('declares none in the corner half of a material that moves nothing, or whose corner hook reads no map', () => {
        const wave = 'vec3 vertex(vec3 pos, VertContext ctx) { return pos + vec3(0.0, sin(pos.x), 0.0); }';
        expect(buildMeshMaterialShaderGlsl(TINT_GLSL, null, SIG, ['tint']).vertex).not.toContain('meshMap');
        expect(buildMeshMaterialShaderGlsl(null, wave, SIG, []).vertex).not.toContain('meshMap');
        // A flag that waves by numbers, with a detail map in its colour hook: the map stays in the colour half.
        const flag = buildMeshMaterialShaderGlsl(TINT_GLSL, wave, SIG, ['tint']);
        expect(flag.vertex).not.toContain('meshMap');
        expect(flag.fragment).toContain('vec4 sampleMap_tint(vec2 uv)');
        expect(buildMeshMaterialShadowShaderGlsl(wave, SIG, ['tint'], false).vertex).not.toContain('meshMap');
    });

    it('has them in its shadow too, cut or not', () => {
        const plain = buildMeshMaterialShadowShaderGlsl(PRESS_GLSL, SIG, ['height'], false);
        expect(plain.vertex).toContain('vec4 sampleMap_height(vec2 uv) {\n    return textureLod(meshMap0, uv, 0.0);');
        const cut = buildMeshMaterialShadowShaderGlsl(PRESS_GLSL, SIG, ['tint', 'height'], false, { fragment: TINT_GLSL });
        expect(cut.vertex).toContain('vec4 sampleMap_height(vec2 uv) {\n    return textureLod(meshMap1, uv, 0.0);');
        expect(cut.vertex).not.toContain('envUv');
        expect(cut.fragment).toContain('vec4 sampleMap_tint(vec2 uv) {\n    return textureLod(meshMap0, uv, 0.0);');
    });

    it('gives a map only the corner hook reads a unit, in the model and in a shadow that does not cut', () => {
        const { gl, units } = fakeGl();
        const materials = createWebgl2MeshMaterials(gl);
        const material = drawShader({ vertexGlsl: PRESS_GLSL, vertex: PRESS });

        expect(materials.get(material).mapNames).toEqual(['height']);
        units.clear();
        const shadow = materials.shadow(material, false, false);
        expect(shadow?.mapNames).toEqual(['height']);
        expect(shadow?.bindsMaps).toBe(true);
        expect([0, 1, 2, 3].map((i) => units.get(`meshMap${i}`))).toEqual([...MESH_MAP_UNITS]);
    });

    it('binds no maps for the shadow of a corner hook that moves by numbers alone, unless it is cut', () => {
        const { gl } = fakeGl();
        const materials = createWebgl2MeshMaterials(gl);
        const flag = drawShader({
            vertexGlsl: 'vec3 vertex(vec3 pos, VertContext ctx) { return pos + vec3(0.0, sin(pos.x), 0.0); }',
            fragmentGlsl: TINT_GLSL,
        });

        expect(materials.shadow(flag, false, false)?.bindsMaps).toBe(false);
        expect(materials.shadow(flag, false, true)?.bindsMaps).toBe(true);
    });
});

describe('the shader composer', () => {
    it('reads a map in a model\'s vertex graph, in both languages', () => {
        const place = composerAdd(composerMul(composerSwizzle(composerVertexPosition(), 'xz'), 1), 0.5);
        const press = composerMul(composerSwizzle(composerMapSample('height', place), 'x'), -0.2);
        const compiled = compileShader({ shader: 'mesh3d', position: composerAdd(composerVertexPosition(), composerVec3(0, press, 0)) });

        expect(compiled.vertex).toContain('sampleMap_height(');
        expect(compiled.vertexGlsl).toContain('sampleMap_height(');
        expect(mapNamesOf(compiled.fragment, compiled.vertex)).toEqual(['height']);
        expect(mapNamesOf(compiled.fragmentGlsl, compiled.vertexGlsl)).toEqual(['height']);
    });

    it('still refuses the picture itself there, and says to give it as a map', () => {
        expect(() => compileShader({ shader: 'mesh3d', position: composerSwizzle(composerTextureSample(composerUv()), 'xyz') }))
            .toThrow(/textureSample is not available in a vertex graph\. Give the material the picture as a map too/);
    });
});
