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
import { toonLighting } from '../src/shader_composer/surface/looks';
import { createTestGame, startTestScene } from './helpers/test_game';
import type { TTexture } from '../src/loaders';
import type { TMesh } from '../src/gameobjects/mesh';
import type { TMeshMaterial } from '../src/materials';

/**
 * `reflection`: a round picture of the surroundings laid over a model's surface, more of it at the
 * edge than in front, the chrome of the era's consoles and the glossy plastic of its computer
 * graphics.
 *
 * It is a recipe, as the looks are: the material makes a colour hook from it, carries its picture as
 * the map `reflection` and its two numbers as uniforms, and a document writes the recipe and not
 * what it made. What it looks like is checked in a browser.
 */

const texture = (key: string): TTexture => ({ type: 'texture', key, src: '', width: 1, height: 1, status: 'ready', gpu: null });

const mesh3d = (options: Record<string, unknown>): TMeshMaterial =>
    createMaterial({ shader: 'mesh3d', ...options }) as TMeshMaterial;

describe('the option', () => {
    it('keeps the recipe, carries the picture as a map held at its edges, and the numbers as uniforms', () => {
        const studio = texture('studio');
        const material = mesh3d({ reflection: studio });

        expect(material.reflection).toEqual({ texture: studio, front: 0.04, edge: 1, metal: 0 });
        expect(material.maps?.reflection).toEqual({ texture: studio, wrap: 'clamp' });
        expect(material.uniforms).toMatchObject({ reflectionFront: 0.04, reflectionEdge: 1, reflectionMetal: 0 });
        expect(material.fragment).not.toBeNull();
        expect(material.fragmentGlsl).not.toBeNull();

        const chrome = mesh3d({ reflection: { texture: studio, front: 0.9, edge: 0.95 } });
        expect(chrome.reflection).toEqual({ texture: studio, front: 0.9, edge: 0.95, metal: 0 });
        expect(chrome.uniforms).toMatchObject({ reflectionFront: 0.9, reflectionEdge: 0.95 });
    });

    it('goes with a lighting look and the maps of its own, and leaves a material without it as it was', () => {
        const studio = texture('studio');
        const toon = mesh3d({ reflection: studio, lighting: toonLighting(), maps: { dirt: texture('dirt') } });
        expect(toon.lighting).toBeDefined();
        expect(Object.keys(toon.maps ?? {}).sort()).toEqual(['dirt', 'reflection']);
        expect(toon.uniforms).toMatchObject({ toonBands: 2, reflectionFront: 0.04 });

        const plain = mesh3d({ tint: '#ff0000' });
        expect(plain.reflection).toBeUndefined();
        expect(plain.maps).toBeUndefined();
        expect(plain.fragment).toBeNull();
    });

    it('refuses what contradicts it, naming why', () => {
        const studio = texture('studio');
        expect(() => mesh3d({ reflection: studio, fragment: 'fn effect(s: vec4<f32>, ctx: FragContext) -> vec4<f32> { return s; }' })).toThrow('reflection makes part of the colour');
        expect(() => mesh3d({ reflection: { texture: studio, front: 2 } })).toThrow('reflection.front');
        expect(() => mesh3d({ reflection: { texture: studio, edge: -1 } })).toThrow('reflection.edge');
        expect(() => mesh3d({ reflection: { texture: studio, metal: 1.5 } })).toThrow('reflection.metal');
        expect(() => mesh3d({ reflection: {} })).toThrow('reflection has no picture');
        expect(() => mesh3d({ reflection: studio, maps: { reflection: texture('other') } })).toThrow("the map 'reflection'");
        const four = { a: texture('a'), b: texture('b'), c: texture('c'), d: texture('d') };
        expect(() => mesh3d({ reflection: studio, maps: four })).toThrow('all of them are taken');
    });

    it('reaches the material from createMesh', () => {
        const { store } = createTestGame();
        const studio = texture('studio');
        let shiny!: TMesh;
        startTestScene(store, 'Level', () => {
            shiny = createMesh({ geometry: useCubeGeometry(), reflection: studio });
            return createScene();
        });
        expect(shiny.material.reflection).toEqual({ texture: studio, front: 0.04, edge: 1, metal: 0 });
    });
});

describe('the colour hook it makes', () => {
    it('reads its map at the place the surroundings land, from the picture itself, on both cards', () => {
        const material = mesh3d({ reflection: texture('studio') });
        expect(mapNamesOf(material.fragment, material.vertex)).toEqual(['reflection']);
        const wgsl = buildMeshMaterialShader(material.fragment, null, material.uniformSig!, ['reflection']);
        expect(wgsl).toContain('envUv(ctx)');
        expect(wgsl).toContain('sampleMapScaled_reflection(');
        const glsl = buildMeshMaterialShaderGlsl(material.fragmentGlsl, null, material.uniformSig!, ['reflection']).fragment;
        expect(glsl).toContain('envUv(ctx)');
        expect(glsl).toContain('sampleMapScaled_reflection(');
    });
});

describe('metal', () => {
    it('is a number of the material, turned while it runs, that tints what is reflected by the surface', () => {
        const gold = mesh3d({ tint: '#e8b84a', reflection: { texture: texture('studio'), front: 0.85, metal: 1 } });
        expect(gold.reflection?.metal).toBe(1);
        expect(gold.uniforms).toMatchObject({ reflectionMetal: 1 });
        for (const code of [gold.fragment!, gold.fragmentGlsl!]) {
            expect(code).toContain('reflectionMetal');
        }
    });

    it('is written in the document only when it is not 0, and read back', () => {
        const { store } = createTestGame();
        startTestScene(store, 'S', () => {
            const studio = useLoadTexture({ src: '/studio.png', key: 'studio' });
            createMesh({ geometry: useCubeGeometry(), reflection: studio });
            createMesh({ geometry: useCubeGeometry(), reflection: { texture: studio, metal: 0.5 } });
            return createScene();
        });
        const doc = JSON.parse(JSON.stringify(serializeScene(store.get('world').scenes[0]!)));
        const meshes = doc.root.components.filter((c: { type: string }) => c.type === 'mesh');
        expect(meshes[0].material.reflection).toEqual({ texture: 'studio' });
        expect(meshes[1].material.reflection).toEqual({ texture: 'studio', metal: 0.5 });
        expect(parseSceneDoc(doc, '/s.scene')).toEqual(doc);
    });
});

describe('what it reflects of a see-through surface', () => {
    it('makes it less see-through where it reflects, so a glass shows its edges', () => {
        const glass = mesh3d({ alpha: 0.2, transparent: true, reflection: texture('studio') });
        const plain = mesh3d({ alpha: 0.2, transparent: true, lighting: toonLighting() });
        // The alpha is mixed towards one by the reflection's amount, less what of it is a metal's;
        // without a reflection it is the surface's.
        expect(glass.fragment).toContain('mix((surface).a, 1.0, (mix(mu.reflectionFront, mu.reflectionEdge,');
        expect(glass.fragment).toContain('* (1.0 - mu.reflectionMetal))');
        expect(glass.fragmentGlsl).toContain('reflectionEdge');
        expect(plain.fragment).not.toContain('mix((surface).a, 1.0');
    });

    it('leaves a metal as see-through as it is, since what it reflects is its own colour', () => {
        // A matcap is all reflection and all metal: what covers the alpha is the amount times
        // (1 - metal), nothing, so its alpha fades it.
        const ghost = mesh3d({ alpha: 0.5, transparent: true, reflection: { texture: texture('clay'), front: 1, edge: 1, metal: 1 } });
        expect(ghost.uniforms).toMatchObject({ reflectionFront: 1, reflectionEdge: 1, reflectionMetal: 1 });
        for (const code of [ghost.fragment!, ghost.fragmentGlsl!]) {
            expect(code).toMatch(/1\.0 - mu\.reflectionMetal|1\.0 - reflectionMetal/);
        }
    });

    it('leaves one cut out by its alpha with its holes, so its outline is not filled in', () => {
        const leaf = mesh3d({ alphaCutoff: 0.5, reflection: texture('studio') });
        expect(leaf.fragment).not.toContain('mix((surface).a, 1.0');
        expect(leaf.fragment).toContain('(surface).a');
    });
});

describe('a scene document', () => {
    it('writes the recipe as the numbers are now, not the map or the uniforms it made, and builds it back', () => {
        const { store } = createTestGame();
        startTestScene(store, 'S', () => {
            const studio = useLoadTexture({ src: '/studio.png', key: 'studio' });
            createMesh({ geometry: useCubeGeometry(), reflection: studio });
            const chrome = createMesh({ geometry: useCubeGeometry(), reflection: { texture: studio, front: 0.9 } });
            // Turned while the game ran: the document keeps what it is now.
            chrome.material.uniforms!.reflectionEdge = 0.8;
            return createScene();
        });

        const doc = JSON.parse(JSON.stringify(serializeScene(store.get('world').scenes[0]!)));
        const meshes = doc.root.components.filter((c: { type: string }) => c.type === 'mesh');

        expect(meshes[0].material.reflection).toEqual({ texture: 'studio' });
        expect(meshes[1].material.reflection).toEqual({ texture: 'studio', front: 0.9, edge: 0.8 });
        for (const mesh of meshes) {
            expect(mesh.material).not.toHaveProperty('maps');
            expect(mesh.material.uniforms).toBeNull();
            expect(mesh.material.fragment).toBeNull();
        }
        expect(doc.assets.filter((a: { type: string }) => a.type === 'texture').map((a: { key: string }) => a.key)).toEqual(['studio']);
        expect(parseSceneDoc(doc, '/s.scene')).toEqual(doc);

        registerScene(store, 'Again', sceneFromDoc(parseSceneDoc(doc, '/again.scene'), '/again.scene'));
        const built = startScene(store, 'Again').drawables.filter((d) => d.type === 'mesh') as TMesh[];
        const studio = store.get('assets').textures.get('studio')!;

        expect(built[0]!.material.reflection).toEqual({ texture: studio, front: 0.04, edge: 1, metal: 0 });
        expect(built[1]!.material.reflection).toEqual({ texture: studio, front: 0.9, edge: 0.8, metal: 0 });
        expect(built[1]!.material.uniforms).toMatchObject({ reflectionFront: 0.9, reflectionEdge: 0.8 });
    });

    it('writes nothing about it for a mesh with none, so a document saves as before', () => {
        const { store } = createTestGame();
        startTestScene(store, 'S', () => {
            createMesh({ geometry: useCubeGeometry() });
            return createScene();
        });
        const doc = serializeScene(store.get('world').scenes[0]!);
        const mesh = doc.root.components.find((c) => c.type === 'mesh');
        expect(mesh?.type === 'mesh' ? mesh.material : undefined).not.toHaveProperty('reflection');
    });
});
