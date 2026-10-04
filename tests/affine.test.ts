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
import { MESH_VERTEX_GLSL, MESH_FRAGMENT_GLSL } from '../src/render/webgl2/mesh/mesh_shader';
import { SKINNED_VERTEX_GLSL } from '../src/render/webgl2/mesh/skinned_shader';
import { createTestGame, startTestScene } from './helpers/test_game';
import type { TDrawMesh } from '../src/render/interface';
import type { TMesh } from '../src/gameobjects/mesh';

/**
 * `affine`: a model's picture stretched straight across the screen, the PlayStation's swimming
 * textures.
 *
 * The stretching happens on the graphics card, so what is pinned here is everything that has to be
 * right for it to happen: the flag reaching the shader in the spare number of the turning matrix,
 * the option surviving the trip from `createMesh` and through a saved scene, and every shader of
 * both backends carrying the picture so it can be undone. That it looks right is checked in a
 * browser.
 */

const at = { x: 1, y: 2, z: 3, rotation: 0.3, rotationX: 0.2, rotationY: 0.1, scaleX: 1, scaleY: 2, scaleZ: 1 };

const drawMesh = (affine?: boolean): TDrawMesh => ({
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
        emissive: { r: 0, g: 0, b: 0, a: 1 },
        specular: { r: 0, g: 0, b: 0, a: 1 },
        shininess: 32,
        alpha: 1,
        ...(affine !== undefined ? { affine } : {}),
    },
});

const filled = (affine?: boolean): Float32Array => {
    const out = new Float32Array(MESH_UNIFORM_FLOATS);
    fillMeshUniforms(out, 0, drawMesh(affine), fillCameraSpace(newCameraSpace(), null, 320, 240));
    return out;
};

describe('the flag the shader reads', () => {
    it('is the last number of the turning matrix: one when asked, zero when not', () => {
        expect(filled(true)[47]).toBe(1);
        expect(filled(false)[47]).toBe(0);
        expect(filled()[47]).toBe(0);
    });

    it('leaves the three columns that turn a direction exactly as they were', () => {
        const plain = filled();
        const affine = filled(true);
        expect(Array.from(affine.subarray(32, 44))).toEqual(Array.from(plain.subarray(32, 44)));
        // And nothing else in the block moves either.
        expect(Array.from(affine.subarray(48))).toEqual(Array.from(plain.subarray(48)));
    });
});

describe('the option', () => {
    it('reaches the material from createMesh, and stays off unless asked', () => {
        const { store } = createTestGame();
        let plain!: TMesh;
        let swimming!: TMesh;
        startTestScene(store, 'Level', () => {
            plain = createMesh({ geometry: useCubeGeometry() });
            swimming = createMesh({ geometry: useCubeGeometry(), affine: true });
            return createScene();
        });

        expect(plain.material.affine).toBeUndefined();
        expect(swimming.material.affine).toBe(true);
    });

    it('is written down only when on, and read back the same', () => {
        const written = (affine: boolean) => {
            const { store } = createTestGame();
            const root = startTestScene(store, 'Level', () => {
                createMesh({ geometry: useCubeGeometry(), affine });
                return createScene();
            });
            return serializeScene(root);
        };
        const materialOf = (doc: ReturnType<typeof written>) => {
            const mesh = doc.root.components.find((c) => c.type === 'mesh');
            return mesh?.type === 'mesh' ? mesh.material : undefined;
        };

        expect(materialOf(written(false))).not.toHaveProperty('affine');
        const on = written(true);
        expect(materialOf(on)?.affine).toBe(true);
        expect(parseSceneDoc(on, '/scenes/level.scene')).toEqual(on);
    });
});

describe('the shaders', () => {
    const source = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');

    it('declare the carrying in both languages', () => {
        expect(MESH_SHADER).toContain('fn affineUv(uv: vec2<f32>, clip: vec4<f32>) -> vec3<f32>');
        expect(MESH_VERTEX_GLSL).toContain('vec3 affineUv(vec2 uv, vec4 clip)');
    });

    it('keep the depth even for a corner behind the eye, or the triangle it belongs to breaks', () => {
        // A corner given a one while its neighbours carry w mixes two different things in the
        // division; the card cuts the triangle before dividing, so no guard is needed here.
        const body = (shader: string, from: string) => shader.slice(shader.indexOf(from), shader.indexOf('}', shader.indexOf(from)));
        expect(body(MESH_SHADER, 'fn affineUv')).not.toContain('clip.w >');
        expect(body(MESH_VERTEX_GLSL, 'vec3 affineUv')).not.toContain('clip.w >');
    });

    it('carry the picture from where the corner ended up, in every vertex shader of both backends', () => {
        expect(MESH_SHADER).toContain('out.uv = affineUv(uv, out.position);');
        expect(SKINNED_SHADER).toContain('out.uv = affineUv(uv, out.position);');
        expect(MESH_VERTEX_GLSL).toContain('vUv = affineUv(aUv, gl_Position);');
        expect(SKINNED_VERTEX_GLSL).toContain('vUv = affineUv(aUv, gl_Position);');
        expect(source('../src/render/webgpu/material/mesh_material_shader.ts')).toContain('out.uv = affineUv(uv, out.position);');
        expect(source('../src/render/webgl2/material/mesh_material_shader.ts')).toContain('vUv = affineUv(aUv, gl_Position);');
    });

    it('divide it back at the pixel in every ending, a material\'s own included', () => {
        expect(MESH_SHADER).toContain('in.uv.xy / in.uv.z');
        expect(MESH_FRAGMENT_GLSL).toContain('vUv.xy / vUv.z');
        expect(source('../src/render/webgpu/material/mesh_material_shader.ts')).toContain('let uv = in.uv.xy / in.uv.z;');
        expect(source('../src/render/webgl2/material/mesh_material_shader.ts')).toContain('vec2 uv = vUv.xy / vUv.z;');
    });
});
