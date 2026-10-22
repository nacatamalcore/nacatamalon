import { describe, expect, it } from 'bun:test';
import { createScene } from '../src/scene/create_scene';
import { createMesh } from '../src/gameobjects/mesh/create_mesh';
import { useCubeGeometry } from '../src/hooks/geometry/use_cube_geometry';
import { useCamera3d } from '../src/hooks/camera/use_camera_3d';
import { useCamera2d } from '../src/hooks/camera/use_camera_2d';
import { parseSceneDoc, sceneFromDoc, serializeScene, SCENE_FORMAT } from '../src/scene/document';
import { fillFrameContext } from '../src/game/loop/fill_frame_context';
import { fillLightUniforms, LIGHT_UNIFORM_FLOATS } from '../src/render/shared';
import { fillCameraSpace, newCameraSpace } from '../src/render/shared/compute_mvp_3d';
import { fillMeshUniforms, MESH_UNIFORM_FLOATS } from '../src/render/shared/fill_mesh_uniforms';
import { applyView2d } from '../src/render/shared/apply_view_2d';
import { getColor } from '../src/color';
import { createTestGame, startTestScene } from './helpers/test_game';
import type { TFrameContext } from '../src/render/interface';
import type { TDrawCamera3d } from '../src/render/interface/draw/t_draw_camera_3d';
import type { TDrawMesh } from '../src/render/interface/draw/t_draw_mesh';
import type { TDrawLight } from '../src/render/interface/draw/t_draw_light';

/**
 * A 3D camera that follows the 2D one (`follow2d`): the models placed in the 2D world, `y` down, and
 * drawn where a sprite at the same place is, through the 2D camera's pan, turn and zoom; upright,
 * their faces still facing the way they were built, and lit from where they were.
 */

const W = 384;
const H = 216;

/** Where a point of the world lands on the screen, in pixels from its top-left corner, through a camera. */
const onScreen = (camera: TDrawCamera3d, point: { x: number; y: number; z: number }) => {
    const space = fillCameraSpace(newCameraSpace(), camera, W, H);
    const m = space.viewProjection;
    const cx = m[0]! * point.x + m[4]! * point.y + m[8]! * point.z + m[12]!;
    const cy = m[1]! * point.x + m[5]! * point.y + m[9]! * point.z + m[13]!;
    const cz = m[2]! * point.x + m[6]! * point.y + m[10]! * point.z + m[14]!;
    const cw = m[3]! * point.x + m[7]! * point.y + m[11]! * point.z + m[15]!;
    return { x: ((cx / cw) + 1) / 2 * W, y: (1 - (cy / cw)) / 2 * H, depth: cz / cw };
};

const camera = (flat: { x: number; y: number; rotation: number; zoom: number }): TDrawCamera3d => ({
    projection: 'orthographic',
    transform: { x: 9999, y: 9999, z: 500, rotation: 0, rotationX: 0, rotationY: 0, scaleX: 1, scaleY: 1, scaleZ: 1 },
    fov: 60, near: 0.1, far: 1000, zoom: 7,
    flat,
});

describe('a 3D camera following the 2D one', () => {
    it('puts a point of the world where the 2D camera puts a sprite there, panned, turned and zoomed', () => {
        for (const flat of [{ x: 0, y: 0, rotation: 0, zoom: 1 }, { x: 1408, y: 1492, rotation: 0, zoom: 1 }, { x: 40, y: -30, rotation: 0.3, zoom: 2.5 }]) {
            for (const point of [{ x: 1600, y: 1600 }, { x: 10, y: 200 }, { x: -50, y: 75 }]) {
                const sprite = applyView2d({ transform: { x: flat.x, y: flat.y, rotation: flat.rotation }, zoom: flat.zoom } as never, point);
                const model = onScreen(camera(flat), { ...point, z: 0 });
                expect(model.x).toBeCloseTo(sprite.x, 3);
                expect(model.y).toBeCloseTo(sprite.y, 3);
                // Inside the depth it sees, around its own z.
                expect(Math.abs(model.depth)).toBeLessThan(1);
            }
        }
    });

    it('stands each model upright in the 2D world, so its faces still face the way they were built', () => {
        const space = fillCameraSpace(newCameraSpace(), camera({ x: 0, y: 0, rotation: 0, zoom: 1 }), W, H);
        const mesh = { transform: { x: 100, y: 50, z: 0, rotation: 0, rotationX: 0, rotationY: 0, scaleX: 2, scaleY: 2, scaleZ: 2 }, material: { tint: getColor('#ffffff'), alpha: 1, emissive: getColor('#000000'), specular: getColor('#000000'), shininess: 0 } } as unknown as TDrawMesh;
        const out = new Float32Array(MESH_UNIFORM_FLOATS);
        fillMeshUniforms(out, 0, mesh, space);
        const mvp = out.subarray(0, 16);
        const model = out.subarray(16, 32);
        // The model's own up goes up the screen: its y is turned over in the world, whose y goes down.
        expect(model[5]).toBeCloseTo(-2, 5);
        // And the whole is not a mirror: a triangle turning one way on the model turns that way on the screen.
        const det2 = (m: Float32Array) => m[0]! * m[5]! - m[1]! * m[4]!;
        expect(Math.sign(det2(mvp))).toBe(1);
        // Where it is, it is as a sprite: (100, 50) on the screen.
        const top = onScreen(camera({ x: 0, y: 0, rotation: 0, zoom: 1 }), { x: 100, y: 50, z: 0 });
        expect(top.x).toBeCloseTo(100, 3);
        expect(top.y).toBeCloseTo(50, 3);
    });

    it('lights a model from where the light was aimed: from above stays from above', () => {
        const sun: TDrawLight = { type: 'directional', color: getColor('#ffffff'), intensity: 1, transform: { x: 0, y: 0, z: 0, rotation: 0, rotationX: -Math.PI / 2, rotationY: 0, scaleX: 1, scaleY: 1, scaleZ: 1, quaternion: null } } as unknown as TDrawLight;
        const plain = new Float32Array(LIGHT_UNIFORM_FLOATS);
        const flat = new Float32Array(LIGHT_UNIFORM_FLOATS);
        fillLightUniforms(plain, [sun], getColor('#000000'));
        fillLightUniforms(flat, [sun], getColor('#000000'), null, null, camera({ x: 0, y: 0, rotation: 0, zoom: 1 }));
        // Towards the light: up in a world whose y goes up, so -y in one whose y goes down.
        expect(plain[5]).toBeCloseTo(1, 5);
        expect(flat[5]).toBeCloseTo(-1, 5);
    });
});

describe('a scene whose 3D camera follows its 2D one', () => {
    it('draws its models through the 2D camera the sprites are drawn through', () => {
        const { store } = createTestGame();
        startTestScene(store, 'Level', () => {
            const flat = useCamera2d();
            flat.transform.x = 1408;
            flat.transform.y = 1492;
            flat.zoom = 2;
            useCamera3d({ projection: 'orthographic', transform: { z: 800 }, follow2d: true });
            createMesh({ geometry: useCubeGeometry() });
            return createScene();
        });
        const ctx: TFrameContext = { passes: [{}], time: 0, progress: 0, phase: 0 };
        fillFrameContext(store, ctx);
        const drawn = ctx.passes[0]!.views3d![0]!.camera!;
        expect(drawn.flat).toEqual({ x: 1408, y: 1492, rotation: 0, zoom: 2 });
        expect(drawn.transform.z).toBe(800);
    });

    it('is drawn as before when it does not follow', () => {
        const { store } = createTestGame();
        let own!: ReturnType<typeof useCamera3d>;
        startTestScene(store, 'Level', () => {
            useCamera2d();
            own = useCamera3d({ projection: 'orthographic', transform: { z: 800 } });
            createMesh({ geometry: useCubeGeometry() });
            return createScene();
        });
        const ctx: TFrameContext = { passes: [{}], time: 0, progress: 0, phase: 0 };
        fillFrameContext(store, ctx);
        expect(ctx.passes[0]!.views3d![0]!.camera).toBe(own);
    });

    it('keeps follow2d in its scene document, and only when it says it', () => {
        const doc = (follow: boolean) => parseSceneDoc({
            format: SCENE_FORMAT, version: 1, name: 'Level', assets: [],
            root: {
                id: 'root', name: 'Level', transform: null, children: [],
                components: [{ type: 'camera-3d', id: 'eye', projection: 'orthographic', transform: { x: 0, y: 0, z: 800 }, fov: 60, near: 0.1, far: 2000, zoom: 1, ...(follow ? { follow2d: true } : {}) }],
            },
        }, 'scenes/level.scene.json');
        for (const follow of [true, false]) {
            const { store } = createTestGame();
            const scene = startTestScene(store, 'Level', () => {
                sceneFromDoc(doc(follow), 'scenes/level.scene.json')();
                return createScene();
            });
            expect(scene.camera3d?.follow2d === true).toBe(follow);
            const written = serializeScene(scene).root.components.find((c) => c.type === 'camera-3d') as Record<string, unknown>;
            expect('follow2d' in written).toBe(follow);
        }
    });
});
