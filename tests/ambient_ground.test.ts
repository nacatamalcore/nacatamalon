import { describe, expect, it } from 'bun:test';
import { createScene } from '../src/scene/create_scene';
import { collectLighting } from '../src/game/loop/helper/collect_lights';
import { useAmbientLight, useDirectionalLight } from '../src/hooks/light';
import { fillLightUniforms, LIGHT_UNIFORM_FLOATS } from '../src/render/shared';
import { GROUND_FLOATS } from '../src/render/shared/fill_light_uniforms';
import { MESH_SHADER, MESH_SHADER_TYPES, meshShaderFor } from '../src/render/webgpu/mesh/mesh_shader';
import { SKINNED_SHADER } from '../src/render/webgpu/mesh/skinned_shader';
import { MESH_UNIFORMS_GLSL, MESH_VERTEX_GLSL, meshFragmentGlsl } from '../src/render/webgl2/mesh/mesh_shader';
import { buildMeshMaterialShader } from '../src/render/webgpu/material/mesh_material_shader';
import { buildMeshMaterialShaderGlsl } from '../src/render/webgl2/material/mesh_material_shader';
import { parseSceneDoc, sceneFromDoc, serializeScene } from '../src/scene/document';
import { registerScene } from '../src/scene/register_scene';
import { startScene } from '../src/scene/start_scene';
import { createTestGame, startTestScene } from './helpers/test_game';
import type { TAmbientLight } from '../src/light';
import type { TDrawCamera3d } from '../src/render/interface';

/**
 * `ground` on `useAmbientLight`: the light from all around in two colours, a sky above and a floor
 * below, shared out by which way a surface faces. Without it the ambient is one colour, exactly as
 * before, and that is pinned here as much as the new colour is.
 */

const GROUND_AT = LIGHT_UNIFORM_FLOATS - GROUND_FLOATS;
const ambient = { r: 0.2, g: 0.3, b: 0.4, a: 1 };

const groundOf = (ground: { r: number; g: number; b: number; a: number } | null, camera: TDrawCamera3d | null = null): number[] => {
    const out = new Float32Array(LIGHT_UNIFORM_FLOATS);
    fillLightUniforms(out, [], ambient, null, null, camera, ground);
    return Array.from(out.subarray(GROUND_AT, GROUND_AT + 4)).map((n) => Math.round(n * 1000) / 1000 + 0);
};

const lit = (body: () => void) => {
    const { store } = createTestGame();
    const scene = startTestScene(store, 'Level', () => {
        body();
        return createScene();
    });
    return collectLighting(scene);
};

describe('the lights block', () => {
    it('carries the ground at its end, with a one that says it is there, and zeros without one', () => {
        expect(groundOf({ r: 0.5, g: 0.25, b: 0.125, a: 1 })).toEqual([0.5, 0.25, 0.125, 1]);
        expect(groundOf(null)).toEqual([0, 0, 0, 0]);
    });

    it('adds two when the world\'s y goes down, ground or none, so up stays up for the reflection too', () => {
        const flat: TDrawCamera3d = {
            projection: 'orthographic',
            transform: { x: 0, y: 0, z: 0, rotation: 0, rotationX: 0, rotationY: 0, scaleX: 1, scaleY: 1, scaleZ: 1 },
            fov: 60, near: 0.1, far: 1000, zoom: 1, flat: { x: 0, y: 0 },
        } as TDrawCamera3d;
        expect(groundOf({ r: 1, g: 1, b: 1, a: 1 }, flat)[3]).toBe(3);
        expect(groundOf(null, flat)).toEqual([0, 0, 0, 2]);
    });

    it('is read by the shaders as two flags: the odd one for the ground, above one and a half for the 2D camera', () => {
        expect(MESH_SHADER_TYPES).toContain('lights.ground.w % 2.0 < 0.5');
        expect(MESH_SHADER_TYPES).toContain('select(up, 1.0 - up, lights.ground.w > 1.5)');
        const wgsl = buildMeshMaterialShader(null, null, {}, [], false, 'back', false);
        expect(wgsl).toContain('dot(r, up) * select(1.0, -1.0, lights.ground.w > 1.5)');
        const glsl = buildMeshMaterialShaderGlsl(null, null, {}, [], false, 'back', false).fragment;
        expect(MESH_UNIFORMS_GLSL).toContain('mod(lights.ground.w, 2.0) < 0.5');
        expect(glsl).toContain('dot(r, up) * (lights.ground.w > 1.5 ? -1.0 : 1.0)');
    });
});

describe('the scene', () => {
    it('takes it from the last ambient light, at its strength', () => {
        let light!: TAmbientLight;
        const lighting = lit(() => {
            light = useAmbientLight({ color: '#ffffff', ground: '#804020', intensity: 0.5 });
        });
        expect(light.ground).toEqual({ r: 128 / 255, g: 64 / 255, b: 32 / 255, a: 1 });
        expect(lighting.ground?.r).toBeCloseTo(0.5 * 128 / 255, 5);
        expect(lighting.ground?.g).toBeCloseTo(0.5 * 64 / 255, 5);
        expect(lighting.ground?.b).toBeCloseTo(0.5 * 32 / 255, 5);
    });

    it('has none when the ambient is one colour, or when no ambient was asked for', () => {
        let light!: TAmbientLight;
        expect(lit(() => {
            light = useAmbientLight({ intensity: 0.5 });
        }).ground).toBeNull();
        expect(light).not.toHaveProperty('ground');
        expect(lit(() => {
            useDirectionalLight({});
        }).ground).toBeNull();
        expect(lit(() => {}).ground).toBeNull();
    });
});

describe('the shaders', () => {
    it('leave the ambient one colour when there is no ground, and share it out by facing when there is', () => {
        expect(MESH_SHADER_TYPES).toContain('fn ambientAt(sky: f32) -> vec3<f32> {');
        expect(MESH_SHADER_TYPES).toMatch(/if \(lights\.ground\.w % 2\.0 < 0\.5\) \{\s*return lights\.ambient\.rgb;\s*\}/);
        expect(MESH_UNIFORMS_GLSL).toContain('vec3 ambientAt(float sky) {');
        expect(MESH_UNIFORMS_GLSL).toMatch(/if \(mod\(lights\.ground\.w, 2\.0\) < 0\.5\) \{\s*return lights\.ambient\.rgb;\s*\}/);
    });

    it('work out how much a corner faces the sky beside the fog, on the built-in way of both cards', () => {
        expect(MESH_SHADER).toContain('@location(7) fog: vec2<f32>,');
        expect(MESH_SHADER).toContain('out.fog = vec2<f32>(fogAt(worldPos), skyward(worldNormal));');
        expect(SKINNED_SHADER).toContain('out.fog = vec2<f32>(fogAt(worldPos), skyward(worldNormal));');
        expect(MESH_VERTEX_GLSL).toContain('out vec2 vFog;');
        expect(MESH_VERTEX_GLSL).toContain('vFog = vec2(fogAt(worldPos), skyward(worldNormal));');
        expect(meshShaderFor('none')).toContain('ambientAt(select(1.0 - in.fog.y, in.fog.y, front))');
        expect(meshFragmentGlsl('none')).toContain('ambientAt((gl_FrontFacing ? vFog.y : 1.0 - vFog.y))');
    });

    it('work it out at the pixel on a material\'s way', () => {
        expect(buildMeshMaterialShader(null, null, {}, [])).toContain('ambientAt(skyward(normalize(in.normal.xyz))) * occlusion');
        expect(buildMeshMaterialShaderGlsl(null, null, {}, []).fragment).toContain('ambientAt(skyward(normalize(vNormal.xyz))) * occlusion');
    });
});

describe('a scene document', () => {
    it('writes the ground only when there is one, and builds it back', () => {
        const { store } = createTestGame();
        startTestScene(store, 'S', () => {
            useAmbientLight({ color: '#dce6ff', ground: '#4a3328', intensity: 0.5 });
            return createScene();
        });
        const doc = JSON.parse(JSON.stringify(serializeScene(store.get('world').scenes[0]!)));
        const light = doc.root.components.find((c: { type: string }) => c.type === 'light');
        expect(light.ground).toEqual({ r: 0x4a / 255, g: 0x33 / 255, b: 0x28 / 255, a: 1 });
        expect(parseSceneDoc(doc, '/s.scene')).toEqual(doc);

        registerScene(store, 'Again', sceneFromDoc(parseSceneDoc(doc, '/again.scene'), '/again.scene'));
        const again = startScene(store, 'Again');
        expect(collectLighting(again).ground?.r).toBeCloseTo(0.5 * 0x4a / 255, 5);

        const plain = createTestGame().store;
        startTestScene(plain, 'P', () => {
            useAmbientLight({ intensity: 0.5 });
            return createScene();
        });
        const flat = serializeScene(plain.get('world').scenes[0]!);
        expect(flat.root.components.find((c) => c.type === 'light')).not.toHaveProperty('ground');
    });
});
