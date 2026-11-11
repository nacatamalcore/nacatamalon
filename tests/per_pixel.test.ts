import { describe, expect, it } from 'bun:test';
import { createScene } from '../src/scene/create_scene';
import { createMesh } from '../src/gameobjects/mesh/create_mesh';
import { useCubeGeometry } from '../src/hooks/geometry/use_cube_geometry';
import { parseSceneDoc, serializeScene } from '../src/scene/document';
import { fillMeshUniforms, MESH_UNIFORM_FLOATS } from '../src/render/shared';
import { fillCameraSpace, newCameraSpace } from '../src/render/shared/compute_mvp_3d';
import { buildMeshMaterialShader } from '../src/render/webgpu/material/mesh_material_shader';
import { buildMeshMaterialShaderGlsl } from '../src/render/webgl2/material/mesh_material_shader';
import { createTestGame, startTestScene } from './helpers/test_game';
import type { TDrawMesh } from '../src/render/interface';
import type { TMesh } from '../src/gameobjects/mesh';
import type { TCullMode } from '../src/materials';

/**
 * `perPixel`: a model's light worked out at every pixel rather than at its corners, for a shine
 * that is a round spot wherever it falls, the look of the computer graphics of the era.
 *
 * The light is worked out on the graphics card, so what is pinned here is everything that has to be
 * right for it to happen: the flag reaching the shader beside the occlusion's coordinate without
 * disturbing it, the option surviving the trip from `createMesh` and through a saved scene, and the
 * ending of a material choosing between the corners' light and its own in both backends. That it
 * looks right is checked in a browser.
 */

const at = { x: 1, y: 2, z: 3, rotation: 0.3, rotationX: 0.2, rotationY: 0.1, scaleX: 1, scaleY: 2, scaleZ: 1 };

const drawMesh = (perPixel?: boolean, secondUv = false): TDrawMesh => ({
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
        specular: { r: 1, g: 1, b: 1, a: 1 },
        shininess: 64,
        alpha: 1,
        ...(secondUv ? { occlusion: { texture: null as never, strength: 1, uv: 'uv2' as const } } : {}),
        ...(perPixel !== undefined ? { perPixel } : {}),
    },
});

const filled = (perPixel?: boolean, secondUv = false): Float32Array => {
    const out = new Float32Array(MESH_UNIFORM_FLOATS);
    fillMeshUniforms(out, 0, drawMesh(perPixel, secondUv), fillCameraSpace(newCameraSpace(), null, 320, 240));
    return out;
};

describe('the flag the shader reads', () => {
    it('rides two more in the number beside the occlusion\'s coordinate: 0, 1, 2 or 3', () => {
        expect(filled()[39]).toBe(0);
        expect(filled(false)[39]).toBe(0);
        expect(filled(true)[39]).toBe(2);
        expect(filled(undefined, true)[39]).toBe(1);
        expect(filled(true, true)[39]).toBe(3);
    });

    it('leaves every other number of the block exactly as it was', () => {
        const plain = Array.from(filled());
        const lit = Array.from(filled(true));
        lit[39] = plain[39]!;
        expect(lit).toEqual(plain);
    });
});

describe('the option', () => {
    it('reaches the material from createMesh, and stays off unless asked', () => {
        const { store } = createTestGame();
        let plain!: TMesh;
        let glossy!: TMesh;
        startTestScene(store, 'Level', () => {
            plain = createMesh({ geometry: useCubeGeometry() });
            glossy = createMesh({ geometry: useCubeGeometry(), perPixel: true });
            return createScene();
        });

        expect(plain.material.perPixel).toBeUndefined();
        expect(glossy.material.perPixel).toBe(true);
        // No shader of its own is made for it: the engine's hooks stand in when it is drawn.
        expect(glossy.material.fragment).toBeNull();
        expect(glossy.material.vertex).toBeNull();
    });

    it('is written down when said, a false included (a no to the scene\'s style), never when not, and read back the same', () => {
        const written = (perPixel?: boolean) => {
            const { store } = createTestGame();
            const root = startTestScene(store, 'Level', () => {
                createMesh({ geometry: useCubeGeometry(), ...(perPixel !== undefined ? { perPixel } : {}) });
                return createScene();
            });
            return serializeScene(root);
        };
        const materialOf = (doc: ReturnType<typeof written>) => {
            const mesh = doc.root.components.find((c) => c.type === 'mesh');
            return mesh?.type === 'mesh' ? mesh.material : undefined;
        };

        expect(materialOf(written())).not.toHaveProperty('perPixel');
        const off = written(false);
        expect(materialOf(off)?.perPixel).toBe(false);
        expect(parseSceneDoc(off, '/scenes/level.scene')).toEqual(off);
        const on = written(true);
        expect(materialOf(on)?.perPixel).toBe(true);
        expect(parseSceneDoc(on, '/scenes/level.scene')).toEqual(on);
    });
});

describe('the ending of a material', () => {
    const culls: TCullMode[] = ['back', 'front', 'none'];

    it('chooses between the corners\' light and its own by the flag, on both cards and every side', () => {
        for (const cull of culls) {
            const wgsl = buildMeshMaterialShader(null, null, {}, [], false, cull, false);
            expect(wgsl).toContain('if (uniforms.normalMatrix[1].w > 1.5) {');
            expect(wgsl).toContain('here = litBy(in.worldPos.xyz, normalize(');
            expect(wgsl).toContain('ctx.shine = litWithShadow(here.shine, here.casterShine, coord);');

            const glsl = buildMeshMaterialShaderGlsl(null, null, {}, [], false, cull, false).fragment;
            expect(glsl).toContain('if (uniforms.normalMatrix[1].w > 1.5) {');
            expect(glsl).toContain('litBy(vWorldPos, normalize(');
            expect(glsl).toContain('ctx.shine = litWithShadow(hereShine, hereCasterShine, coord);');
        }
    });

    it('reads the occlusion\'s coordinate from the odd half of the number, so the light does not move it', () => {
        const wgsl = buildMeshMaterialShader(null, null, {}, [], false, 'back', false);
        expect(wgsl).toContain('uniforms.normalMatrix[1].w % 2.0 > 0.5');
        expect(wgsl).not.toContain('uniforms.normalMatrix[1].w > 0.5');
        const glsl = buildMeshMaterialShaderGlsl(null, null, {}, [], false, 'back', false).fragment;
        expect(glsl).toContain('mod(uniforms.normalMatrix[1].w, 2.0) > 0.5');
        expect(glsl).not.toContain('uniforms.normalMatrix[1].w > 0.5');
    });

    it('declares the lights once in the GLSL fragment, and where a point falls in the shadow map once', () => {
        // GLSL refuses a function declared twice; the fragment's head already has shadowCoordOf.
        for (const cull of culls) {
            const glsl = buildMeshMaterialShaderGlsl(null, null, {}, [], false, cull, false).fragment;
            const count = (what: string) => glsl.split(what).length - 1;
            expect(count('vec4 shadowCoordOf(vec3 worldPos)')).toBe(1);
            expect(count('void sampleLight(int index')).toBe(1);
            expect(count('int meshLight(int k)')).toBe(1);
            expect(count('void litBy(vec3 worldPos')).toBe(1);
        }
    });
});
