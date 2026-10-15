import { describe, expect, it } from 'bun:test';
import { fillLightUniforms, LIGHT_UNIFORM_FLOATS } from '../src/render/shared';
import { VIEW_FLOATS } from '../src/render/shared/fill_light_uniforms';
import { MESH_SHADER, MESH_SHADER_TYPES } from '../src/render/webgpu/mesh/mesh_shader';
import { SKINNED_SHADER } from '../src/render/webgpu/mesh/skinned_shader';
import { buildMeshMaterialShader } from '../src/render/webgpu/material/mesh_material_shader';
import { MESH_UNIFORMS_GLSL, MESH_VERTEX_GLSL } from '../src/render/webgl2/mesh/mesh_shader';
import { buildMeshMaterialShaderGlsl } from '../src/render/webgl2/material/mesh_material_shader';
import type { TDrawCamera3d } from '../src/render/interface/draw/t_draw_camera_3d';

/**
 * The way from a surface towards the viewer, which the shine and the fresnel read.
 *
 * Measured from the camera's place, an orthographic camera (the default, one that measures in pixels
 * and sits at the corner of the screen) lit one side of every edge more than the other. Its rays are
 * parallel, so the way is the same for every point: the block carries it, and the shaders take it.
 */

const LOOK_AT = LIGHT_UNIFORM_FLOATS - VIEW_FLOATS;
const ambient = { r: 0, g: 0, b: 0, a: 1 };

const camera = (fields: Partial<TDrawCamera3d> = {}): TDrawCamera3d => ({
    projection: 'orthographic',
    transform: { x: 0, y: 0, z: 0, rotation: 0, rotationX: 0, rotationY: 0, scaleX: 1, scaleY: 1, scaleZ: 1 },
    fov: 60, near: 0.1, far: 1000, zoom: 1, ...fields,
});

const lookOf = (cam: TDrawCamera3d | null): number[] => {
    const out = new Float32Array(LIGHT_UNIFORM_FLOATS);
    fillLightUniforms(out, [], ambient, null, null, cam);
    return Array.from(out.subarray(LOOK_AT, LOOK_AT + 4)).map((n) => Math.round(n * 1000) / 1000 + 0);
};

describe('the way the view looks, in the lights block', () => {
    it('points back down +Z for an orthographic camera that never turned, and for no camera', () => {
        expect(lookOf(camera())).toEqual([0, 0, 1, 1]);
        expect(lookOf(null)).toEqual([0, 0, 1, 1]);
    });

    it('does not care where the camera is, only which way it faces', () => {
        const still = camera().transform;
        expect(lookOf(camera({ transform: { ...still, x: 500, y: -300, z: 20000 } }))).toEqual([0, 0, 1, 1]);

        const [x, y, z, ortho] = lookOf(camera({ transform: { ...still, rotationY: Math.PI / 2 } }));
        expect(Math.hypot(x, y, z)).toBeCloseTo(1, 3);
        expect(Math.abs(z)).toBeLessThan(0.001);
        expect(ortho).toBe(1);
    });

    it('is left at zero for a perspective camera, whose way is from each point to its eye', () => {
        expect(lookOf(camera({ projection: 'perspective' }))).toEqual([0, 0, 0, 0]);
    });
});

describe('the shaders take it', () => {
    it('declares it in both backends, at the end of the block one packer fills', () => {
        expect(MESH_SHADER_TYPES).toMatch(/fogRange: vec4<f32>,\s*(\/\/.*\s*)*look: vec4<f32>,\s*};/);
        expect(MESH_UNIFORMS_GLSL).toMatch(/vec4 fogRange;\s*(\/\/.*\s*)*vec4 look;\s*} lights;/);
    });

    it('reads the way through viewDirOf everywhere a surface is lit, and nowhere from the place alone', () => {
        const sources = [
            MESH_SHADER,
            SKINNED_SHADER,
            buildMeshMaterialShader(null, null, {}, []),
            MESH_VERTEX_GLSL,
            buildMeshMaterialShaderGlsl(null, null, {}, []).vertex,
        ];
        for (const source of sources) {
            expect(source).toContain('viewDirOf(worldPos)');
            // The one place left that measures from the camera is the perspective half of viewDirOf.
            expect(source.match(/normalize\(uniforms\.cameraPosition\.xyz - worldPos\)/g)).toHaveLength(1);
        }
    });
});
