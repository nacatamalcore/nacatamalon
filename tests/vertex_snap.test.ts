import { describe, expect, it } from 'bun:test';
import { readFileSync } from 'node:fs';
import { createScene } from '../src/scene/create_scene';
import { createMesh } from '../src/gameobjects/mesh/create_mesh';
import { useCubeGeometry } from '../src/hooks/geometry/use_cube_geometry';
import { parseSceneDoc, serializeScene } from '../src/scene/document';
import { fillMeshUniforms, MESH_UNIFORM_FLOATS } from '../src/render/shared';
import { fillCameraSpace, newCameraSpace } from '../src/render/shared/compute_mvp_3d';
import { MESH_SHADER } from '../src/render/webgpu/mesh/mesh_shader';
import { SKINNED_SHADER } from '../src/render/webgpu/mesh/skinned_shader';
import { MESH_VERTEX_GLSL } from '../src/render/webgl2/mesh/mesh_shader';
import { SKINNED_VERTEX_GLSL } from '../src/render/webgl2/mesh/skinned_shader';
import { createTestGame, startTestScene } from './helpers/test_game';
import type { TDrawMesh } from '../src/render/interface';
import type { TMesh } from '../src/gameobjects/mesh';

/**
 * `vertexSnap`: a model's corners on whole pixels of the game's screen, the PlayStation's shiver.
 *
 * The snapping itself happens on the graphics card, so what is pinned here is everything that has
 * to be right for it to happen: the grid reaching the shader in the two spare numbers, the option
 * surviving the trip from `createMesh` and through a saved scene, and every vertex shader of both
 * backends actually asking for it. That it looks right is checked in a browser.
 */

const at = { x: 0, y: 0, z: 0, rotation: 0, rotationX: 0, rotationY: 0, scaleX: 1, scaleY: 1, scaleZ: 1 };

const drawMesh = (vertexSnap?: boolean | number): TDrawMesh => ({
    type: 'mesh',
    geometry: null,
    transform: at,
    skeleton: null,
    material: {
        id: 'm', name: null,
        fragment: null, fragmentGlsl: null, vertex: null, vertexGlsl: null,
        uniforms: null, uniformSig: null,
        texture: null,
        tint: { r: 1, g: 1, b: 1, a: 1 },
        emissive: { r: 0.4, g: 0.5, b: 0.6, a: 1 },
        specular: { r: 0, g: 0, b: 0, a: 1 },
        shininess: 32,
        alpha: 1,
        ...(vertexSnap !== undefined ? { vertexSnap } : {}),
    },
});

describe('the grid the shader snaps to', () => {
    it('is zero, which is no snapping, for a material that did not ask', () => {
        const out = new Float32Array(MESH_UNIFORM_FLOATS);
        fillMeshUniforms(out, 0, drawMesh(), fillCameraSpace(newCameraSpace(), null, 320, 240));

        expect(out[55]).toBe(0);
        expect(out[59]).toBe(0);
    });

    it('is the game\'s own width and height for one that did', () => {
        const out = new Float32Array(MESH_UNIFORM_FLOATS);
        fillMeshUniforms(out, 0, drawMesh(true), fillCameraSpace(newCameraSpace(), null, 320, 240));

        expect(out[55]).toBe(320);
        expect(out[59]).toBe(240);
        // The numbers around them are untouched: the emissive colour and where the camera is.
        expect(out[52]).toBeCloseTo(0.4, 6);
        expect(out[56]).toBe(0);
    });

    it('is that many rows for a number, with square cells, whatever the game\'s size', () => {
        const out = new Float32Array(MESH_UNIFORM_FLOATS);
        // A wide game: 120 rows, and the columns follow its shape so a cell is as wide as it is tall.
        fillMeshUniforms(out, 0, drawMesh(120), fillCameraSpace(newCameraSpace(), null, 640, 360));

        expect(out[59]).toBe(120);
        expect(out[55]).toBeCloseTo(120 * (640 / 360), 3);
    });

    it('is off for a row count that is not above zero', () => {
        const out = new Float32Array(MESH_UNIFORM_FLOATS);
        fillMeshUniforms(out, 0, drawMesh(0), fillCameraSpace(newCameraSpace(), null, 320, 240));

        expect(out[55]).toBe(0);
        expect(out[59]).toBe(0);
    });
});

describe('the option', () => {
    it('reaches the material from createMesh, and stays off unless asked', () => {
        const { store } = createTestGame();
        let plain!: TMesh;
        let shivering!: TMesh;
        startTestScene(store, 'Level', () => {
            plain = createMesh({ geometry: useCubeGeometry() });
            shivering = createMesh({ geometry: useCubeGeometry(), vertexSnap: true });
            return createScene();
        });

        expect(plain.material.vertexSnap).toBeUndefined();
        expect(shivering.material.vertexSnap).toBe(true);
    });

    it('keeps a row count, and drops one that asks for nothing', () => {
        const { store } = createTestGame();
        let coarse!: TMesh;
        let none!: TMesh;
        startTestScene(store, 'Level', () => {
            coarse = createMesh({ geometry: useCubeGeometry(), vertexSnap: 120 });
            none = createMesh({ geometry: useCubeGeometry(), vertexSnap: -3 });
            return createScene();
        });

        expect(coarse.material.vertexSnap).toBe(120);
        expect(none.material.vertexSnap).toBeUndefined();
    });

    it('is written down only when on, and read back the same', () => {
        const written = (vertexSnap: boolean | number) => {
            const { store } = createTestGame();
            const root = startTestScene(store, 'Level', () => {
                createMesh({ geometry: useCubeGeometry(), vertexSnap });
                return createScene();
            });
            return serializeScene(root);
        };
        const materialOf = (doc: ReturnType<typeof written>) => {
            const mesh = doc.root.components.find((c) => c.type === 'mesh');
            return mesh?.type === 'mesh' ? mesh.material : undefined;
        };

        expect(materialOf(written(false))).not.toHaveProperty('vertexSnap');
        const on = written(true);
        expect(materialOf(on)?.vertexSnap).toBe(true);
        expect(parseSceneDoc(on, '/scenes/level.scene')).toEqual(on);

        const rows = written(120);
        expect(materialOf(rows)?.vertexSnap).toBe(120);
        expect(parseSceneDoc(rows, '/scenes/level.scene')).toEqual(rows);
    });
});

describe('the shaders', () => {
    it('declare the snap in both languages', () => {
        expect(MESH_SHADER).toContain('fn snapToPixels(clip: vec4<f32>) -> vec4<f32>');
        expect(MESH_VERTEX_GLSL).toContain('vec4 snapToPixels(vec4 clip)');
    });

    it('snap every corner a model is drawn with, bent or not, built-in or a material\'s own', () => {
        expect(MESH_SHADER).toContain('out.position = snapToPixels(');
        expect(SKINNED_SHADER).toContain('out.position = snapToPixels(');
        expect(MESH_VERTEX_GLSL).toContain('gl_Position = snapToPixels(');
        expect(SKINNED_VERTEX_GLSL).toContain('gl_Position = snapToPixels(');
        // A material's own shaders are assembled at run time from these files; what matters is that
        // the line that places the corner asks for the snap in both.
        const material = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');
        expect(material('../src/render/webgpu/material/mesh_material_shader.ts')).toContain('out.position = snapToPixels(');
        expect(material('../src/render/webgl2/material/mesh_material_shader.ts')).toContain('gl_Position = snapToPixels(');
    });
});
