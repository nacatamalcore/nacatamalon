import { describe, expect, it } from 'bun:test';
import { createScene } from '../src/scene/create_scene';
import { createMesh } from '../src/gameobjects/mesh/create_mesh';
import { createMaterial } from '../src/gameobjects/material/create_material';
import { useCubeGeometry } from '../src/hooks/geometry/use_cube_geometry';
import { useLoadTexture } from '../src/hooks/loaders/use_load_texture';
import { parseSceneDoc, sceneFromDoc, serializeScene } from '../src/scene/document';
import { registerScene } from '../src/scene/register_scene';
import { startScene } from '../src/scene/start_scene';
import { buildMeshMaterialShader } from '../src/render/webgpu/material/mesh_material_shader';
import { buildMeshMaterialShaderGlsl } from '../src/render/webgl2/material/mesh_material_shader';
import { mapNamesOf } from '../src/render/shared/material_maps';
import { cutReflection } from '../src/materials/new_material';
import { toonLighting } from '../src/shader_composer/surface/looks';
import { createPixels, fillRect, getPixel, normalsFromHeight } from '../src/pixels';
import { createTestGame, startTestScene } from './helpers/test_game';
import { asGltf, serveGltf, TEST_QUAD } from './helpers/test_gltf';
import { createModel } from '../src/gameobjects/model/create_model';
import { useLoadModel } from '../src/hooks/loaders/use_load_model';
import { whenLoaded } from '../src/loaders';
import type { TTexture } from '../src/loaders';
import type { TMesh } from '../src/gameobjects/mesh';
import type { TMeshMaterial } from '../src/materials';

/**
 * Normal maps: a picture whose colours are the way a surface faces at each pixel, bending its light
 * so a flat wall reads as carved. What it looks like is checked in a browser; what is pinned here is
 * the material taking it, the shader's ending bending its facing by it on both cards, a document
 * keeping it, and the map made from a picture of heights.
 */

const texture = (key: string): TTexture => ({ type: 'texture', key, src: '', width: 1, height: 1, status: 'ready', gpu: null });
const mesh3d = (options: Record<string, unknown>): TMeshMaterial => createMaterial({ shader: 'mesh3d', ...options }) as TMeshMaterial;

describe('a material with a normal map', () => {
    it('keeps it, carries its picture as the map normalMap and its strength as a uniform, and is lit at every pixel', () => {
        const stone = texture('stone');
        const material = mesh3d({ normalMap: { texture: stone, strength: 0.5 } });
        expect(material.normalMap).toEqual({ texture: stone, strength: 0.5 });
        expect(material.maps?.normalMap?.texture).toBe(stone);
        expect(material.uniforms).toMatchObject({ normalStrength: 0.5 });
        expect(material.perPixel).toBe(true);
        // Its hook names the map, which is what gives it a slot.
        expect(mapNamesOf(material.fragment, material.vertex)).toEqual(['normalMap']);
        expect(mapNamesOf(material.fragmentGlsl)).toEqual(['normalMap']);
        // At the corners only when it says so.
        expect(mesh3d({ normalMap: stone, perPixel: false }).perPixel).toBe(false);
        expect(mesh3d({ normalMap: stone }).normalMap?.strength).toBe(1);
    });

    it('goes with looks, a reflection and a hook of its own', () => {
        const stone = texture('stone');
        const toon = mesh3d({ normalMap: stone, lighting: toonLighting() });
        expect(mapNamesOf(toon.fragment)).toContain('normalMap');
        const shiny = mesh3d({ normalMap: stone, reflection: texture('studio') });
        expect(mapNamesOf(shiny.fragment).sort()).toEqual(['normalMap', 'reflection']);
        const own = mesh3d({ normalMap: stone, fragment: 'fn effect(surface: vec4<f32>, ctx: FragContext) -> vec4<f32> { return surface; }' });
        expect(own.fragment).toContain('fn effect(surface');
        expect(mapNamesOf(own.fragment)).toEqual(['normalMap']);
    });

    it('keeps its slot when a reflection that turns out to be cut out is made again', () => {
        const material = mesh3d({ normalMap: texture('stone'), reflection: texture('studio') });
        cutReflection(material);
        expect(mapNamesOf(material.fragment).sort()).toEqual(['normalMap', 'reflection']);
        expect(mapNamesOf(material.fragmentGlsl).sort()).toEqual(['normalMap', 'reflection']);
    });

    it('refuses what it cannot take, naming why', () => {
        const stone = texture('stone');
        expect(() => mesh3d({ normalMap: {} })).toThrow('normalMap has no picture');
        expect(() => mesh3d({ normalMap: { texture: stone, strength: -1 } })).toThrow('normalMap.strength');
        expect(() => mesh3d({ normalMap: stone, maps: { normalMap: texture('other') } })).toThrow("the map 'normalMap'");
    });

    it('reaches the material from createMesh', () => {
        const { store } = createTestGame();
        const stone = texture('stone');
        let wall!: TMesh;
        startTestScene(store, 'Hall', () => {
            wall = createMesh({ geometry: useCubeGeometry(), normalMap: stone });
            return createScene();
        });
        expect(wall.material.normalMap).toEqual({ texture: stone, strength: 1 });
    });
});

describe('a model with a normal map', () => {
    it('gives it to every piece, lit at every pixel, as createMesh does', async () => {
        const { json, bin } = asGltf({
            nodes: [{ name: 'Body', primitives: [{ ...TEST_QUAD, material: 0 }] }, { name: 'Lid', primitives: [{ ...TEST_QUAD, material: 0 }] }],
            materials: [{ baseColorFactor: [1, 1, 1, 1] }],
        });
        const served = serveGltf({ '/models/box.gltf': json, '/models/model.bin': bin });
        try {
            const { store } = createTestGame();
            const stone = texture('stone');
            let model!: ReturnType<typeof createModel>;
            startTestScene(store, 'Hall', () => {
                model = createModel({ model: useLoadModel({ src: '/models/box.gltf' }), normalMap: { texture: stone, strength: 0.5 } });
                return createScene();
            });
            await whenLoaded(model.model);
            for (let i = 0; i < 10; i++) await new Promise((resolve) => setTimeout(resolve, 0));
            expect(model.parts.length).toBe(2);
            for (const part of model.parts) {
                expect(part.material.normalMap).toEqual({ texture: stone, strength: 0.5 });
                expect(part.material.perPixel).toBe(true);
                expect(mapNamesOf(part.material.fragment)).toEqual(['normalMap']);
            }
        } finally {
            served.restore();
        }
    });
});

describe('the ending of a material\'s shader', () => {
    it('bends its facing by the map before it is lit, on both cards, when it has the map and its strength', () => {
        const sig = { normalStrength: 'f32' as const };
        const wgsl = buildMeshMaterialShader(null, null, sig, ['normalMap']);
        expect(wgsl).toContain('fn bentBy(normal: vec3<f32>, tangent: vec4<f32>, texel: vec3<f32>, strength: f32) -> vec3<f32>');
        expect(wgsl).toContain('let facing = bentBy(normalize(in.normal.xyz), in.tangent, sampleMap_normalMap(uv).xyz, mu.normalStrength);');
        expect(wgsl).toContain('here = litBy(in.worldPos.xyz, facing, viewDirOf(in.worldPos.xyz));');
        expect(wgsl).toContain('ctx.normal = facing;');
        const glsl = buildMeshMaterialShaderGlsl(null, null, sig, ['normalMap']).fragment;
        expect(glsl).toContain('vec3 bentBy(vec3 normal, vec4 tangent, vec3 texel, float strength)');
        expect(glsl).toContain('vec3 facing = bentBy(normalize(vNormal.xyz), vTangent, sampleMap_normalMap(uv).xyz, mu.normalStrength);');
        expect(glsl).toContain('litBy(vWorldPos, facing, viewDirOf(vWorldPos)');
    });

    it('is as it was without one, and with a map of that name but no strength', () => {
        for (const [names, sig] of [[[], {}], [['normalMap'], {}]] as const) {
            const wgsl = buildMeshMaterialShader(null, null, sig, names);
            expect(wgsl).not.toContain('bentBy');
            expect(wgsl).toContain('here = litBy(in.worldPos.xyz, normalize(in.normal.xyz), viewDirOf(in.worldPos.xyz));');
            expect(buildMeshMaterialShaderGlsl(null, null, sig, names).fragment).not.toContain('bentBy');
        }
    });
});

describe('a scene document', () => {
    it('writes the map and its strength as it is now, not the hook or the map or the uniform, and builds it back', () => {
        const { store } = createTestGame();
        startTestScene(store, 'S', () => {
            const stone = useLoadTexture({ src: '/stone.png', key: 'stone' });
            createMesh({ geometry: useCubeGeometry(), normalMap: stone });
            const deep = createMesh({ geometry: useCubeGeometry(), material: createMaterial({ shader: 'mesh3d', normalMap: stone, lighting: toonLighting() }) as TMeshMaterial });
            deep.material.uniforms!.normalStrength = 2;
            return createScene();
        });
        const doc = JSON.parse(JSON.stringify(serializeScene(store.get('world').scenes[0]!)));
        const meshes = doc.root.components.filter((c: { type: string }) => c.type === 'mesh');
        expect(meshes[0].material.normalMap).toEqual({ texture: 'stone' });
        expect(meshes[1].material.normalMap).toEqual({ texture: 'stone', strength: 2 });
        for (const mesh of meshes) {
            expect(mesh.material.fragment).toBeNull();
            expect(mesh.material).not.toHaveProperty('maps');
        }
        expect(meshes[0].material.uniforms).toBeNull();
        expect(parseSceneDoc(doc, '/s.scene')).toEqual(doc);

        registerScene(store, 'Again', sceneFromDoc(parseSceneDoc(doc, '/again.scene'), '/again.scene'));
        const built = startScene(store, 'Again').drawables.filter((d) => d.type === 'mesh') as TMesh[];
        const stone = store.get('assets').textures.get('stone')!;
        expect(built[0]!.material.normalMap).toEqual({ texture: stone, strength: 1 });
        expect(built[1]!.material.normalMap).toEqual({ texture: stone, strength: 2 });
        expect(built[1]!.material.lighting?.look).toBe('toon');
    });

    it('keeps a hook of its own without the line the map adds, once', () => {
        const { store } = createTestGame();
        const hook = 'fn effect(surface: vec4<f32>, ctx: FragContext) -> vec4<f32> { return surface; }';
        startTestScene(store, 'S', () => {
            createMesh({ geometry: useCubeGeometry(), material: createMaterial({ shader: 'mesh3d', normalMap: useLoadTexture({ src: '/stone.png', key: 'stone' }), fragment: hook }) as TMeshMaterial });
            return createScene();
        });
        const doc = serializeScene(store.get('world').scenes[0]!);
        const mesh = doc.root.components.find((c) => c.type === 'mesh');
        expect(mesh?.type === 'mesh' ? mesh.material.fragment : undefined).toBe(hook);
    });
});

describe('normalsFromHeight', () => {
    it('faces straight out where the picture is flat, and leans away from what is higher', () => {
        const flat = normalsFromHeight(createPixels(4, 4, '#808080'));
        const out = getPixel(flat, 1, 1);
        expect([out.r, out.g, out.b].map((n) => Math.round(n * 255))).toEqual([128, 128, 255]);

        // Bright, so higher, on the right half: at the step the surface faces left (red low).
        const step = createPixels(8, 4, '#000000');
        fillRect(step, 4, 0, 4, 4, '#ffffff');
        const leaning = getPixel(normalsFromHeight(step, { depth: 2, wrap: false }), 4, 1);
        expect(leaning.r).toBeLessThan(0.4);
        expect(Math.round(leaning.g * 255)).toBe(128);
    });
});
