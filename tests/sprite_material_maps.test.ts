import { describe, expect, it } from 'bun:test';
import { createScene } from '../src/scene/create_scene';
import { createSprite } from '../src/gameobjects/sprite/create_sprite';
import { createText } from '../src/gameobjects/text/create_text';
import { createMaterial } from '../src/gameobjects/material/create_material';
import { createSpriteTexture } from '../src/gameobjects/sprite_texture';
import { createPixelTexture } from '../src/gameobjects/pixel_texture';
import { createPixels } from '../src/pixels';
import { useLoadTexture } from '../src/hooks/loaders/use_load_texture';
import { parseSceneDoc, sceneFromDoc, serializeScene } from '../src/scene/document';
import { registerScene } from '../src/scene/register_scene';
import { startScene } from '../src/scene/start_scene';
import { newMaterial } from '../src/materials/new_material';
import { mapNamesOf, MAX_MATERIAL_MAPS } from '../src/render/shared/material_maps';
import { buildSpriteDistanceFieldMaterialShader, buildSpriteMaterialShader } from '../src/render/webgpu/material/sprite_material_shader';
import { buildTilemapMaterialShader } from '../src/render/webgpu/material/tilemap_material_shader';
import { SPRITE_SHADER } from '../src/render/webgpu/sprite/sprite_shader';
import { buildSpriteDistanceFieldMaterialShaderGlsl, buildSpriteMaterialShaderGlsl } from '../src/render/webgl2/material/sprite_material_shader';
import { buildTilemapMaterialShaderGlsl } from '../src/render/webgl2/material/tilemap_material_shader';
import { SPRITE_VERTEX_SHADER } from '../src/render/webgl2/sprite/sprite_shader';
import { TILEMAP_VERTEX_SHADER } from '../src/render/webgl2/tilemap/tilemap_shader';
import { showsPicture } from '../src/game/loop/helper/view_walk';
import { writeSpriteInstances } from '../src/render/webgpu/sprite/write_sprite_instance';
import { writeSpriteInstances as writeSpriteInstancesGl } from '../src/render/webgl2/sprite/write_sprite_instances';
import { compileShader } from '../src/shader_composer/compile_shader';
import { composerLayerUv, composerLocalUv, composerMapSample, composerUv } from '../src/shader_composer/inputs';
import { composerSwizzle } from '../src/shader_composer/constructors';
import { NODE_CATALOG } from '../src/shader_composer/catalog';
import { createTestGame, startTestScene } from './helpers/test_game';
import type { TDrawable } from '../src/gameobjects/types';
import type { TSpriteMaterial } from '../src/materials';
import type { TTexture } from '../src/loaders';

/**
 * Extra pictures on the material over a sprite, a text or a map's layer, read by name, and where
 * across what is drawn each pixel is, to read them at.
 *
 * Whether a sprite really crumbles in the shape of its mask is a question for a card, and the browser
 * checks ask it there. What is pinned here is what the shaders are given and how the record and the
 * document carry the maps.
 */

const texture = (key: string): TTexture => ({ type: 'texture', key, src: '', width: 1, height: 1, status: 'ready', gpu: null });

const CRUMBLE = `fn effect(color: vec4f, uv: vec2f) -> vec4f {
    if (sampleMap_grain(localUv()).r < mu.gone) { return vec4f(0.0); }
    return color * sampleMap_shine(layerUv());
}`;
const CRUMBLE_GLSL = `vec4 effect(vec4 color, vec2 uv) {
    if (sampleMap_grain(localUv()).r < mu.gone) { return vec4(0.0); }
    return color * sampleMap_shine(layerUv());
}`;

describe('a sprite material with maps', () => {
    it('keeps each map in the long form, with what it was asked for', () => {
        const grain = texture('grain');
        const shine = texture('shine');
        const material = newMaterial({ maps: { grain, shine: { texture: shine, wrap: 'clamp', smooth: true } } }, null, null) as TSpriteMaterial;

        expect(material.shader).toBe('sprite2d');
        expect(material.maps).toEqual({ grain: { texture: grain }, shine: { texture: shine, wrap: 'clamp', smooth: true } });
    });

    it('has no maps at all when it asked for none, so it saves as before', () => {
        expect('maps' in newMaterial({ shader: 'sprite2d' }, null, null)).toBe(false);
    });

    it(`carries at most ${MAX_MATERIAL_MAPS}, each by a name a shader can read it by`, () => {
        const five = Object.fromEntries(['a', 'b', 'c', 'd', 'e'].map((name) => [name, texture(name)]));
        expect(() => newMaterial({ maps: five }, null, null)).toThrow(/at most 4 maps/);
        expect(() => newMaterial({ maps: { 'my-map': texture('x') } }, null, null)).toThrow(/cannot name a map/);
    });
});

describe('its shader, on WebGPU', () => {
    it('declares four map slots after the knobs, and a reader for each map it reads', () => {
        const names = mapNamesOf(CRUMBLE);
        expect(names).toEqual(['grain', 'shine']);
        for (const [code, group] of [[buildSpriteMaterialShader(CRUMBLE, { gone: 'f32' }, names), 2], [buildTilemapMaterialShader(CRUMBLE, { gone: 'f32' }, names), 3]] as const) {
            expect(code.match(/var mapTexture\d: texture_2d<f32>;/g)).toHaveLength(MAX_MATERIAL_MAPS);
            expect(code).toContain(`@group(${group}) @binding(1) var mapSampler0: sampler;`);
            expect(code).toContain(`@group(${group}) @binding(8) var mapTexture3: texture_2d<f32>;`);
            expect(code).toContain('fn sampleMap_grain(uv: vec2f) -> vec4f {\n    return textureSampleLevel(mapTexture0, mapSampler0, uv, 0.0);');
            expect(code).toContain('fn sampleMap_shine(uv: vec2f) -> vec4f {\n    return textureSampleLevel(mapTexture1, mapSampler1, uv, 0.0);');
            expect(code).toContain('fn localUv() -> vec2f');
            expect(code).toContain('fn layerUv() -> vec2f');
        }
        expect(buildSpriteDistanceFieldMaterialShader(CRUMBLE, { gone: 'f32' }, names)).toContain('fn sampleMap_grain(');
    });

    it('is handed where the pixel is across the sprite, set before the hook runs', () => {
        const code = buildSpriteMaterialShader(CRUMBLE, { gone: 'f32' }, ['grain', 'shine']);
        expect(SPRITE_SHADER).toContain('@location(4) across: vec2f');
        expect(code).toMatch(/spriteAcross = in\.across;\s*return effect\(/);
        expect(buildTilemapMaterialShader(CRUMBLE, { gone: 'f32' }, ['grain', 'shine'])).toMatch(/tileAcross = acrossTile\(in\);\s*layerAcross = in\.acrossLayer;\s*return effect\(/);
    });
});

describe('its shader, on WebGL2', () => {
    it('declares no map sampler at all when it reads none', () => {
        expect(buildSpriteMaterialShaderGlsl('vec4 effect(vec4 color, vec2 uv) { return color; }', {}, []).fragment).not.toContain('flatMap');
    });

    it('declares a map sampler and a reader for each map it reads, by the same names', () => {
        for (const { fragment } of [
            buildSpriteMaterialShaderGlsl(CRUMBLE_GLSL, { gone: 'f32' }, ['grain', 'shine']),
            buildSpriteDistanceFieldMaterialShaderGlsl(CRUMBLE_GLSL, { gone: 'f32' }, ['grain', 'shine']),
            buildTilemapMaterialShaderGlsl(CRUMBLE_GLSL, { gone: 'f32' }, ['grain', 'shine']),
        ]) {
            // A sampler for each map it reads, and none it does not: see flatMapsGlsl.
            expect(fragment.match(/uniform sampler2D flatMap\d;/g)).toHaveLength(2);
            expect(fragment).toContain('vec4 sampleMap_grain(vec2 uv) {\n    return textureLod(flatMap0, uv, 0.0);');
            expect(fragment).toContain('vec2 localUv()');
            expect(fragment).toContain('vec2 layerUv()');
            // Declared before the hook that calls them: GLSL reads in order.
            expect(fragment.indexOf('vec2 localUv()')).toBeLessThan(fragment.indexOf('vec4 effect('));
            expect(fragment.indexOf('vec4 sampleMap_shine(')).toBeLessThan(fragment.indexOf('vec4 effect('));
        }
    });

    it('is handed where the pixel is across the sprite and across the layer by the vertex half', () => {
        expect(SPRITE_VERTEX_SHADER).toContain('out vec2 vAcross;');
        expect(TILEMAP_VERTEX_SHADER).toContain('uniform vec2 layerSize;');
        expect(TILEMAP_VERTEX_SHADER).toContain('out vec2 vAcrossLayer;');
    });
});

describe('how its maps are read', () => {
    it('follows each sprite\'s own smooth, even with no picture, so two that differ are two batches', () => {
        // A card's worth of nothing: the batches are what is being asked about, not the drawing.
        const device = { queue: { writeBuffer: () => {} }, createBuffer: () => ({ destroy: () => {} }) } as unknown as GPUDevice;
        const sprites = {
            capacity: 16, instanceData: new Float32Array(16 * 32), runs: [], runCount: 0, whiteBindGroup: {},
            whiteTexture: { createView: () => ({}) } as unknown as GPUTexture,
            defaultSmooth: false, textureBindGroups: new WeakMap(),
    runsByPass: [], instances: {},
        } as unknown as Parameters<typeof writeSpriteInstances>[1];
        const material = createMaterial({ maps: { grain: texture('grain') } });
        const plain = { type: 'sprite', texture: null, tint: { r: 1, g: 1, b: 1, a: 1 }, transform: { x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1 }, width: 10, height: 10, material };
        writeSpriteInstances(device, sprites, [{ ...plain, smooth: true }, { ...plain, smooth: false }] as never, [-1, -1]);

        expect(sprites.runCount).toBe(2);
        expect(sprites.runs.slice(0, 2).map((run) => run.smooth)).toEqual([true, false]);
    });

    it('does the same on WebGL2, where the batch carries the sampler, in the order they are drawn', () => {
        const gl = { bindBuffer: () => {}, bufferSubData: () => {}, ARRAY_BUFFER: 1 } as unknown as WebGL2RenderingContext;
        const linear = {} as WebGLSampler;
        const nearest = {} as WebGLSampler;
        const sprites = {
            capacity: 16, instanceData: new Float32Array(16 * 32), runs: [], runCount: 0, whiteTexture: {},
            defaultSmooth: false, samplers: { linear, nearest }, instances: {},
        } as unknown as Parameters<typeof writeSpriteInstancesGl>[1];
        const plain = { type: 'sprite', texture: null, tint: { r: 1, g: 1, b: 1, a: 1 }, transform: { x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1 }, width: 10, height: 10 };
        writeSpriteInstancesGl(gl, sprites, [{ ...plain, smooth: true }, { ...plain, smooth: true }, { ...plain }, { ...plain, smooth: true }] as never, [-1, -1, -1, -1]);

        expect(sprites.runs.slice(0, sprites.runCount).map((run) => [run.sampler === linear, run.start, run.count])).toEqual([[true, 0, 2], [false, 2, 1], [true, 3, 1]]);
    });
});

describe('a picture being drawn into', () => {
    it('is shown by a sprite that wears it as a map, so a view of the world leaves that sprite out', () => {
        const { store } = createTestGame();
        let feed!: TTexture;
        let screen!: ReturnType<typeof createSprite>;
        startTestScene(store, 'S', () => {
            feed = createSpriteTexture({ width: 8, height: 8, sees: 'world' });
            screen = createSprite({ material: createMaterial({ maps: { feed } }) });
            return createScene();
        });

        expect(showsPicture(screen as unknown as TDrawable, feed)).toBe(true);
        expect(showsPicture(screen as unknown as TDrawable, texture('other'))).toBe(false);
    });

    it('is shown by a text whose material wears it as a map', () => {
        const { store } = createTestGame();
        let feed!: TTexture;
        let words!: ReturnType<typeof createText>;
        startTestScene(store, 'S', () => {
            feed = createSpriteTexture({ width: 8, height: 8, sees: 'world' });
            words = createText({ text: 'HI', material: createMaterial({ maps: { feed } }) });
            return createScene();
        });

        expect(showsPicture(words as unknown as TDrawable, feed)).toBe(true);
    });
});

describe('a scene document', () => {
    it('writes a sprite material\'s maps by key, lists loaded pictures, and builds them back', () => {
        const { store } = createTestGame();
        startTestScene(store, 'S', () => {
            createSprite({
                material: createMaterial({
                    fragment: CRUMBLE,
                    fragmentGlsl: CRUMBLE_GLSL,
                    uniforms: { gone: 0.25 },
                    maps: {
                        grain: createPixelTexture(createPixels(4, 4), { key: 'painted-grain' }),
                        shine: { texture: useLoadTexture({ src: '/shine.png', key: 'shine' }), wrap: 'clamp' },
                    },
                }),
            });
            return createScene();
        });

        const doc = JSON.parse(JSON.stringify(serializeScene(store.get('world').scenes[0]!)));
        const sprite = doc.root.components.find((c: { type: string }) => c.type === 'sprite');

        expect(sprite.material.maps).toEqual({ grain: { texture: 'painted-grain' }, shine: { texture: 'shine', wrap: 'clamp' } });
        // The painted one has no file, so only the loaded one is listed to be fetched.
        expect(doc.assets.filter((a: { type: string }) => a.type === 'texture').map((a: { key: string }) => a.key)).toEqual(['shine']);

        registerScene(store, 'Again', sceneFromDoc(parseSceneDoc(doc, '/again.scene'), '/again.scene'));
        const again = startScene(store, 'Again');
        const built = (again.drawables.find((d) => d.type === 'sprite') as ReturnType<typeof createSprite>).material as TSpriteMaterial;

        expect(Object.keys(built.maps!)).toEqual(['grain', 'shine']);
        expect(built.maps!.shine!.wrap).toBe('clamp');
        expect(built.maps!.grain!.texture).toBe(store.get('assets').textures.get('painted-grain')!);
    });

    it('reads a model\'s maps where its own document has them, after its surface', () => {
        const doc = parseSceneDoc({
            format: 'nacatamalon-scene', version: 1, name: 'M', assets: [],
            root: { id: 'r', name: 'M', components: [{ type: 'mesh', id: 'm', geometry: 'cube', material: { tint: { r: 1, g: 1, b: 1, a: 1 }, wrap: 'clamp', maps: { noise: { texture: 'n' } } } }], children: [] },
        }, '/m.scene');
        const material = (doc.root.components[0] as { material: Record<string, unknown> }).material;
        const keys = Object.keys(material);
        expect(keys.indexOf('maps')).toBeGreaterThan(keys.indexOf('wrap'));
        expect(material.maps).toEqual({ noise: { texture: 'n' } });
    });
});

describe('the shader composer', () => {
    it('reads a map at where the pixel is across the sprite, and across the layer', () => {
        const compiled = compileShader({ shader: 'sprite2d', color: composerMapSample('grain', composerLocalUv()) });
        expect(compiled.fragment).toContain('sampleMap_grain(localUv())');
        expect(compiled.fragmentGlsl).toContain('sampleMap_grain(localUv())');
        expect(mapNamesOf(compiled.fragment)).toEqual(['grain']);

        const crossing = compileShader({ shader: 'sprite2d', color: composerMapSample('shine', composerLayerUv()) });
        expect(crossing.fragment).toContain('sampleMap_shine(layerUv())');
    });

    it('has them only for sprites and map layers', () => {
        expect(() => compileShader({ shader: 'mesh3d', color: composerMapSample('grain', composerLocalUv()) })).toThrow(/localUv is not available/);
        expect(() => compileShader({ shader: 'sprite2d', color: composerSwizzle(composerMapSample('grain', composerUv()), 'xyzw') })).not.toThrow();
        expect(NODE_CATALOG.localUv?.targets).toEqual(['sprite2d']);
        expect(NODE_CATALOG.layerUv?.targets).toEqual(['sprite2d']);
        expect(NODE_CATALOG.mapSample?.targets).toBeUndefined();
    });
});
