import { afterEach, describe, expect, it, spyOn } from 'bun:test';
import { createScene } from '../src/scene/create_scene';
import { createMesh } from '../src/gameobjects/mesh/create_mesh';
import { useCubeGeometry } from '../src/hooks/geometry/use_cube_geometry';
import { useFog } from '../src/hooks/fog/use_fog';
import { useCamera3d } from '../src/hooks/camera/use_camera_3d';
import { parseSceneDoc, serializeScene } from '../src/scene/document';
import { fillFrameContext } from '../src/game/loop/fill_frame_context';
import { fillLightUniforms, LIGHT_UNIFORM_FLOATS } from '../src/render/shared';
import { MESH_SHADER } from '../src/render/webgpu/mesh/mesh_shader';
import { SKINNED_SHADER } from '../src/render/webgpu/mesh/skinned_shader';
import { MESH_VERTEX_GLSL, MESH_FRAGMENT_GLSL } from '../src/render/webgl2/mesh/mesh_shader';
import { SKINNED_VERTEX_GLSL } from '../src/render/webgl2/mesh/skinned_shader';
import { createTestGame, startTestScene } from './helpers/test_game';
import { readFileSync } from 'node:fs';
import type { TFrameContext } from '../src/render/interface';
import type { TFog } from '../src/fog';

/**
 * `useFog`: a scene's models fading into a colour with distance from the camera.
 *
 * The fading happens on the graphics card. What is pinned here is everything that has to be right
 * for it to happen: the fog living on the scene, reaching the frame's view of that scene, being
 * written into the lights block only when it is on, surviving a saved scene, and every shader of
 * both backends applying it. That it looks right is checked in a browser.
 */

afterEach(() => {
    (console.warn as { mockRestore?: () => void }).mockRestore?.();
});

/**
 * Where the fog's eight numbers start in the lights block: past the ambient, the lights and the shadow.
 */
const FOG_AT = LIGHT_UNIFORM_FLOATS - 8;

describe('useFog', () => {
    it('refuses to be called outside a scene body', () => {
        expect(() => useFog()).toThrow('[NacatamalOn] useFog');
    });

    it('lives on the scene, with a default for everything it was not told', () => {
        const { store } = createTestGame();
        let fog!: TFog;
        const root = startTestScene(store, 'Level', () => {
            fog = useFog({ near: 5 });
            return createScene();
        });

        expect(root.fog).toBe(fog);
        expect(fog).toMatchObject({ type: 'fog', color: { r: 0, g: 0, b: 0, a: 1 }, near: 5, far: 100, enabled: true });
    });

    it('is one per scene: a second is ignored, with a warning, and the first comes back', () => {
        const warn = spyOn(console, 'warn').mockImplementation(() => {});
        const { store } = createTestGame();
        let first!: TFog;
        let second!: TFog;
        startTestScene(store, 'Level', () => {
            first = useFog({ near: 1 });
            second = useFog({ near: 2 });
            return createScene();
        });

        expect(second).toBe(first);
        expect(first.near).toBe(1);
        expect(warn).toHaveBeenCalledTimes(1);
    });

    it('reaches the frame\'s view of the scene, the very record, so a change shows the next frame', () => {
        const { store } = createTestGame();
        let fog!: TFog;
        startTestScene(store, 'Level', () => {
            useCamera3d({ projection: 'perspective', z: 5 });
            fog = useFog({ near: 3, far: 9 });
            createMesh({ geometry: useCubeGeometry() });
            return createScene();
        });
        const ctx: TFrameContext = { passes: [{}], time: 0, progress: 0, phase: 0 };
        fillFrameContext(store, ctx);

        expect(ctx.passes[0].views3d?.[0]?.fog).toBe(fog);
    });
});

describe('the lights block', () => {
    const fog = (fields: Partial<TFog> = {}): TFog => ({
        type: 'fog', id: 'f', color: { r: 0.2, g: 0.3, b: 0.4, a: 1 }, near: 4, far: 20, enabled: true, ...fields,
    });
    const ambient = { r: 0, g: 0, b: 0, a: 1 };

    it('carries the colour, that it is on, and the two distances', () => {
        const out = new Float32Array(LIGHT_UNIFORM_FLOATS);
        fillLightUniforms(out, [], ambient, null, fog());

        expect(Array.from(out.subarray(FOG_AT, FOG_AT + 6)).map((n) => Math.round(n * 100) / 100)).toEqual([0.2, 0.3, 0.4, 1, 4, 20]);
    });

    it('is all zeros with no fog, or one switched off, which the shader reads as clear', () => {
        for (const none of [null, fog({ enabled: false })]) {
            const out = new Float32Array(LIGHT_UNIFORM_FLOATS);
            fillLightUniforms(out, [], ambient, null, none);
            expect(Array.from(out.subarray(FOG_AT, FOG_AT + 8))).toEqual([0, 0, 0, 0, 0, 0, 0, 0]);
        }
    });

    it('never ends where it starts, since the shader divides by the distance between them', () => {
        const out = new Float32Array(LIGHT_UNIFORM_FLOATS);
        fillLightUniforms(out, [], ambient, null, fog({ near: 10, far: 10 }));

        expect(out[FOG_AT + 5]).toBeGreaterThan(out[FOG_AT + 4]);
    });
});

describe('a scene written down', () => {
    const written = (fields: { enabled?: boolean } = {}) => {
        const { store } = createTestGame();
        const root = startTestScene(store, 'Level', () => {
            useFog({ color: { r: 0.1, g: 0.1, b: 0.2, a: 1 }, near: 6, far: 40, ...fields });
            return createScene();
        });
        return serializeScene(root);
    };
    const fogOf = (doc: ReturnType<typeof written>) => doc.root.components.find((c) => c.type === 'fog');

    it('keeps the fog on the root, and reads it back the same', () => {
        const doc = written();
        expect(fogOf(doc)).toMatchObject({ type: 'fog', near: 6, far: 40 });
        expect(fogOf(doc)).not.toHaveProperty('enabled');
        expect(parseSceneDoc(doc, '/scenes/level.scene')).toEqual(doc);
    });

    it('writes down a fog that is switched off, since that is not the default', () => {
        const doc = written({ enabled: false });
        expect(fogOf(doc)).toMatchObject({ enabled: false });
        expect(parseSceneDoc(doc, '/scenes/level.scene')).toEqual(doc);
    });
});

describe('the shaders', () => {
    it('work out the fog per corner, in every vertex shader of both backends', () => {
        expect(MESH_SHADER).toContain('out.fog = fogAt(worldPos);');
        expect(SKINNED_SHADER).toContain('out.fog = fogAt(worldPos);');
        expect(MESH_VERTEX_GLSL).toContain('vFog = fogAt(worldPos);');
        expect(SKINNED_VERTEX_GLSL).toContain('vFog = fogAt(worldPos);');
        const source = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');
        expect(source('../src/render/webgpu/material/mesh_material_shader.ts')).toContain('out.fog = fogAt(worldPos);');
        expect(source('../src/render/webgl2/material/mesh_material_shader.ts')).toContain('vFog = fogAt(worldPos);');
    });

    it('lay it over the finished colour in every ending, a material\'s own included', () => {
        expect(MESH_SHADER).toContain('lights.fog.rgb, in.fog)');
        expect(MESH_FRAGMENT_GLSL).toContain('lights.fog.rgb, vFog)');
        const source = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');
        expect(source('../src/render/webgpu/material/mesh_material_shader.ts')).toContain('mix(shaded.rgb, lights.fog.rgb, in.fog)');
        expect(source('../src/render/webgl2/material/mesh_material_shader.ts')).toContain('mix(shaded.rgb, lights.fog.rgb, vFog)');
    });
});
