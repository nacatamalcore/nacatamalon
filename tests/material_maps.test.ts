import { describe, expect, it } from 'bun:test';
import { createScene } from '../src/scene/create_scene';
import { createMesh } from '../src/gameobjects/mesh';
import { createMaterial } from '../src/gameobjects/material/create_material';
import { createSpriteTexture } from '../src/gameobjects/sprite_texture';
import { createPixelTexture } from '../src/gameobjects/pixel_texture';
import { createPixels } from '../src/pixels';
import { useCubeGeometry } from '../src/hooks';
import { useCamera3d } from '../src/hooks/camera/use_camera_3d';
import { useLoadTexture } from '../src/hooks/loaders/use_load_texture';
import { fillFrameContext } from '../src/game/loop/fill_frame_context';
import { parseSceneDoc, sceneFromDoc, serializeScene } from '../src/scene/document';
import { registerScene } from '../src/scene/register_scene';
import { startScene } from '../src/scene/start_scene';
import { newMaterial } from '../src/materials/new_material';
import { mapNamesOf, MAX_MATERIAL_MAPS } from '../src/render/shared/material_maps';
import { buildMeshMaterialShader } from '../src/render/webgpu/material/mesh_material_shader';
import { buildMeshMaterialShaderGlsl } from '../src/render/webgl2/material/mesh_material_shader';
import { createMeshMaterials } from '../src/render/webgl2/material/mesh_materials';
import { MESH_MAP_UNITS, MESH_SHADOW_UNIT, MESH_TEXTURE_UNIT } from '../src/render/webgl2/bindings';
import { compileShader } from '../src/shader_composer/compile_shader';
import { composerEnvUv, composerMapSample, composerShine, composerUv } from '../src/shader_composer/inputs';
import { composerSwizzle } from '../src/shader_composer/constructors';
import { createTestGame, startTestScene } from './helpers/test_game';
import type { TFrameContext, TRenderPass } from '../src/render';
import type { TDrawShader } from '../src/render/interface/draw/t_draw_material';
import type { TMeshMaterial } from '../src/materials';
import type { TTexture } from '../src/loaders';

/**
 * Extra pictures on a model's material, read by its shader by name.
 */

const texture = (key: string): TTexture => ({ type: 'texture', key, src: '', width: 1, height: 1, status: 'ready', gpu: null });

const READS_TWO = `fn effect(surface: vec4<f32>, ctx: FragContext) -> vec4<f32> {
    let n = sampleMap_noise(ctx.uv).r;
    let chrome = sampleMap_env(envUv(ctx)).rgb;
    return vec4<f32>(surface.rgb * n + chrome * sampleMap_noise(ctx.uv * 2.0).g, surface.a);
}`;

describe('a material with maps', () => {
    it('keeps each map in the long form, with what it was asked for', () => {
        const noise = texture('noise');
        const env = texture('sky');
        const material = newMaterial({ shader: 'mesh3d', maps: { noise, env: { texture: env, wrap: 'clamp', smooth: true } } }, null, null) as TMeshMaterial;

        expect(material.maps).toEqual({ noise: { texture: noise }, env: { texture: env, wrap: 'clamp', smooth: true } });
    });

    it('has no maps at all when it asked for none, so it saves as before', () => {
        expect('maps' in newMaterial({ shader: 'mesh3d' }, null, null)).toBe(false);
    });

    it(`carries at most ${MAX_MATERIAL_MAPS}`, () => {
        const five = Object.fromEntries(['a', 'b', 'c', 'd', 'e'].map((name) => [name, texture(name)]));
        expect(() => newMaterial({ shader: 'mesh3d', maps: five }, null, null)).toThrow(/at most 4 maps/);
    });

    it('refuses a name a shader could not read it by', () => {
        expect(() => newMaterial({ shader: 'mesh3d', maps: { 'my-map': texture('x') } }, null, null)).toThrow(/cannot name a map/);
        expect(() => newMaterial({ shader: 'mesh3d', maps: { Noise: texture('x') } }, null, null)).toThrow(/cannot name a map/);
    });
});

describe('the maps a shader reads', () => {
    it('are found in its code, in the order it first reads them, each once', () => {
        expect(mapNamesOf(READS_TWO)).toEqual(['noise', 'env']);
        expect(mapNamesOf(null, 'vec4 effect(vec4 s, FragContext c) { return sampleMap_ripple(c.uv); }')).toEqual(['ripple']);
        expect(mapNamesOf('fn effect() { /* sampleMap without a call */ }')).toEqual([]);
    });

    it('get a reader each, by the same name in both languages, over four declared slots', () => {
        const wgsl = buildMeshMaterialShader(READS_TWO, null, {}, ['noise', 'env']);
        const glsl = buildMeshMaterialShaderGlsl(READS_TWO.replace(/fn |<f32>|let /g, ''), null, {}, ['noise', 'env']).fragment;

        expect(wgsl.match(/var mapTexture\d: texture_2d<f32>;/g)).toHaveLength(MAX_MATERIAL_MAPS);
        expect(glsl.match(/uniform sampler2D meshMap\d;/g)).toHaveLength(MAX_MATERIAL_MAPS);
        // Slot by order of first reading: noise is 0, env is 1.
        expect(wgsl).toContain('fn sampleMap_noise(uv: vec2<f32>) -> vec4<f32> {\n    return textureSampleLevel(mapTexture0, mapSampler0, uv, 0.0);');
        expect(wgsl).toContain('fn sampleMap_env(uv: vec2<f32>) -> vec4<f32> {\n    return textureSampleLevel(mapTexture1, mapSampler1, uv, 0.0);');
        expect(glsl).toContain('vec4 sampleMap_noise(vec2 uv) {\n    return textureLod(meshMap0, uv, 0.0);');
        expect(glsl).toContain('vec4 sampleMap_env(vec2 uv) {\n    return textureLod(meshMap1, uv, 0.0);');
        expect(wgsl).toContain('fn envUv(ctx: FragContext) -> vec2<f32>');
        expect(glsl).toContain('vec2 envUv(FragContext ctx)');
    });
});

describe('on WebGL2', () => {
    it('puts every map sampler on a unit of its own, apart from the picture and the shadow', () => {
        const units = new Map<string, number>();
        const gl = new Proxy({
            getUniformLocation: (_program: unknown, name: string) => name,
            uniform1i: (name: string, unit: number) => { units.set(name, unit); },
        } as Record<string, unknown>, {
            get: (target, key: string) => (key in target ? target[key] : () => ({})),
        }) as unknown as WebGL2RenderingContext;
        const material = {
            id: 'm', name: 'm', fragment: null, vertex: null, vertexGlsl: null, uniforms: {}, uniformSig: {},
            fragmentGlsl: 'vec4 effect(vec4 surface, FragContext ctx) { return sampleMap_noise(ctx.uv); }',
        } as unknown as TDrawShader;

        const compiled = createMeshMaterials(gl).get(material);

        expect(compiled.mapNames).toEqual(['noise']);
        const mapUnits = [0, 1, 2, 3].map((i) => units.get(`meshMap${i}`));
        expect(mapUnits).toEqual([...MESH_MAP_UNITS]);
        for (const unit of mapUnits) {
            expect(unit).not.toBe(MESH_TEXTURE_UNIT);
            expect(unit).not.toBe(MESH_SHADOW_UNIT);
        }
        expect(new Set(mapUnits).size).toBe(4);
    });
});

describe('a picture being drawn into', () => {
    it('is not shown by a model that wears it as a map, in its own pass', () => {
        const { store } = createTestGame();
        let monitor!: ReturnType<typeof createMesh>;
        let feed!: TTexture;
        startTestScene(store, 'S', () => {
            useCamera3d({ projection: 'perspective', z: 5 });
            feed = createSpriteTexture({ width: 8, height: 8, sees: 'scene' });
            monitor = createMesh({
                geometry: useCubeGeometry(),
                material: createMaterial({ shader: 'mesh3d', maps: { feed } }),
            });
            return createScene();
        });

        const ctx: TFrameContext = { passes: [{}], time: 0, progress: 0, phase: 0 };
        fillFrameContext(store, ctx, 1 / 60);
        const pass = ctx.passes.find((candidate: TRenderPass) => candidate.renderTarget === feed.gpu)!;

        expect(pass.drawables).not.toContain(monitor);
    });
});

describe('a scene document', () => {
    it('writes the maps by key, lists loaded pictures, and builds them back', () => {
        const { store } = createTestGame();
        startTestScene(store, 'S', () => {
            createMesh({
                geometry: useCubeGeometry(),
                material: createMaterial({
                    shader: 'mesh3d',
                    maps: {
                        env: { texture: useLoadTexture({ src: '/sky.png', key: 'sky' }), wrap: 'clamp' },
                        noise: createPixelTexture(createPixels(4, 4), { key: 'painted-noise' }),
                    },
                }),
            });
            return createScene();
        });

        const doc = JSON.parse(JSON.stringify(serializeScene(store.get('world').scenes[0]!)));
        const mesh = doc.root.components.find((c: { type: string }) => c.type === 'mesh');

        expect(mesh.material.maps).toEqual({ env: { texture: 'sky', wrap: 'clamp' }, noise: { texture: 'painted-noise' } });
        // The painted one has no file, so only the loaded one is listed to be fetched.
        expect(doc.assets.filter((a: { type: string }) => a.type === 'texture').map((a: { key: string }) => a.key)).toEqual(['sky']);

        // Read back into a game that already has both pictures under those keys.
        registerScene(store, 'Again', sceneFromDoc(parseSceneDoc(doc, '/again.scene'), '/again.scene'));
        const again = startScene(store, 'Again');
        const built = (again.drawables.find((d) => d.type === 'mesh') as ReturnType<typeof createMesh>).material;

        expect(Object.keys(built.maps!)).toEqual(['env', 'noise']);
        expect(built.maps!.env!.wrap).toBe('clamp');
        expect(built.maps!.noise!.texture).toBe(store.get('assets').textures.get('painted-noise')!);
    });
});

describe('the shader composer', () => {
    it('reads a map by name in a model\'s colour graph', () => {
        const compiled = compileShader({ shader: 'mesh3d', color: composerMapSample('noise', composerUv()) });
        expect(compiled.fragment).toContain('sampleMap_noise(');
        expect(compiled.fragmentGlsl).toContain('sampleMap_noise(');
        expect(mapNamesOf(compiled.fragment)).toEqual(['noise']);
    });

    it('reads where a reflection lands, and the lamps\' highlight, in a model\'s colour graph', () => {
        const compiled = compileShader({ shader: 'mesh3d', color: composerShine() });
        expect(compiled.fragment).toContain('ctx.shine');
        expect(compiled.fragmentGlsl).toContain('ctx.shine');

        const chrome = compileShader({ shader: 'mesh3d', color: composerMapSample('env', composerEnvUv()) });
        expect(chrome.fragment).toContain('sampleMap_env(envUv(ctx))');
        expect(chrome.fragmentGlsl).toContain('sampleMap_env(envUv(ctx))');
        expect(() => compileShader({ shader: 'sprite2d', color: composerSwizzle(composerEnvUv(), 'xyx') })).toThrow(/envUv is not available/);
    });

    it('refuses one in a vertex graph or a sprite\'s, and a bad name', () => {
        expect(() => compileShader({ shader: 'mesh3d', position: composerSwizzle(composerMapSample('noise', composerUv()), 'xyz') }))
            .toThrow(/not available in a vertex graph/);
        expect(() => compileShader({ shader: 'sprite2d', color: composerMapSample('noise', composerUv()) })).toThrow(/model's colour graph/);
        expect(() => composerMapSample('Bad Name', composerUv())).toThrow(/cannot name a map/);
    });
});
