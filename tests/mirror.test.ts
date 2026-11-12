import { describe, expect, it } from 'bun:test';
import { createScene } from '../src/scene/create_scene';
import { createMesh } from '../src/gameobjects/mesh/create_mesh';
import { createMaterial } from '../src/gameobjects/material/create_material';
import { usePlaneGeometry } from '../src/hooks/geometry/use_plane_geometry';
import { useCamera3d } from '../src/hooks/camera/use_camera_3d';
import { useEnvironment, useMirror } from '../src/hooks/mirror';
import { createDrawable, registerDrawableKind } from '../src/extend/gpu';
import type { TCustomDrawable } from '../src/extend/gpu';
import { chrome } from '../src/materials';
import { buildMeshMaterialShader, buildMeshMaterialShadowShader } from '../src/render/webgpu/material/mesh_material_shader';
import { buildMeshMaterialShaderGlsl } from '../src/render/webgl2/material/mesh_material_shader';
import { fillCameraSpace, newCameraSpace } from '../src/render/shared/compute_mvp_3d';
import { serializeScene } from '../src/scene/document';
import { advanceFrame } from '../src/game/loop/tick';
import { fillFrameContext } from '../src/game/loop/fill_frame_context';
import { createTestGame, startTestScene } from './helpers/test_game';
import type { TDrawCamera3d } from '../src/render/interface';
import type { TMesh } from '../src/gameobjects/mesh';
import type { TMeshMaterial } from '../src/materials';
import type { TTexture } from '../src/loaders';

/**
 * Mirrors: the world drawn again from a camera reflected across a flat surface, read back by the
 * surface at each pixel's place on the screen. What it looks like is checked in a browser; what is
 * pinned here is the arithmetic of the reflected camera and the plumbing from `useMirror` to the
 * surface.
 */

const camera = (mirror: TDrawCamera3d['mirror'] = null): TDrawCamera3d => ({
    projection: 'perspective',
    transform: { x: 0, y: 2, z: 6, rotation: 0, rotationX: -0.3, rotationY: 0, scaleX: 1, scaleY: 1, scaleZ: 1 },
    fov: 60, near: 0.1, far: 100, zoom: 1, mirror,
});

const clipOf = (space: ReturnType<typeof newCameraSpace>, p: [number, number, number]): number[] => {
    const m = space.viewProjection;
    const out = [0, 0, 0, 0];
    for (let r = 0; r < 4; r++) {
        out[r] = m[r]! * p[0] + m[4 + r]! * p[1] + m[8 + r]! * p[2] + m[12 + r]!;
    }
    return out;
};

const FLOOR = { x: 0, y: 1, z: 0, d: 0 };

describe('a camera that sees the world in a mirror', () => {
    it('draws a point where the plain camera draws its reflection, turned left to right', () => {
        const plain = fillCameraSpace(newCameraSpace(), camera(), 320, 240);
        const mirrored = fillCameraSpace(newCameraSpace(), camera(FLOOR), 320, 240);
        const p: [number, number, number] = [0.7, 1.5, -1];
        const seen = clipOf(mirrored, p);
        const below = clipOf(plain, [0.7, -1.5, -1]);
        // Same place on the screen as the reflected point, x turned over.
        expect(seen[0]! / seen[3]!).toBeCloseTo(-below[0]! / below[3]!, 5);
        expect(seen[1]! / seen[3]!).toBeCloseTo(below[1]! / below[3]!, 5);
    });

    it('cuts away what is behind the mirror, and keeps what is in front', () => {
        const mirrored = fillCameraSpace(newCameraSpace(), camera(FLOOR), 320, 240);
        // Depth from 0 to 1: below 0 is not drawn.
        const above = clipOf(mirrored, [0, 0.5, -2]);
        const under = clipOf(mirrored, [0, -0.5, -2]);
        expect(above[2]! / above[3]!).toBeGreaterThan(0);
        expect(under[2]! / under[3]!).toBeLessThan(0);
    });

    it('sees from the eye reflected across the plane, where a shine is seen from', () => {
        const mirrored = fillCameraSpace(newCameraSpace(), camera(FLOOR), 320, 240);
        expect([mirrored.x, mirrored.y, mirrored.z]).toEqual([0, -2, 6]);
    });
});

describe('a reflection read at the screen', () => {
    const picture: TTexture = { type: 'texture', key: 'mirror', src: '', width: 4, height: 4, status: 'ready', gpu: null };

    it('reads its picture at the pixel\'s place on the screen, turned, softened by a uniform', () => {
        const floor = createMaterial({ shader: 'mesh3d', reflection: { texture: picture, read: 'screen', blur: 2 } }) as TMeshMaterial;
        expect(floor.reflection).toMatchObject({ read: 'screen', blur: 2 });
        expect(floor.uniforms).toMatchObject({ reflectionBlur: 2 });
        expect(floor.fragment).toContain('ctx.screen');
        expect(floor.fragment).not.toContain('envUv(ctx)');
        expect(floor.fragmentGlsl).toContain('reflectionBlur');
    });

    it('refuses a way of reading or a softness it does not know', () => {
        expect(() => createMaterial({ shader: 'mesh3d', reflection: { texture: picture, read: 'sideways' as never } })).toThrow('reflection.read');
        expect(() => createMaterial({ shader: 'mesh3d', reflection: { texture: picture, read: 'screen', blur: -1 } })).toThrow('reflection.blur');
    });
});

describe('useMirror', () => {
    it('gives the surface a reflection of a picture of the world, read at the screen', () => {
        const { store } = createTestGame();
        let floor!: TMesh;
        startTestScene(store, 'Hall', () => {
            useCamera3d({ projection: 'perspective', transform: { y: 2, z: 6 } });
            floor = createMesh({ geometry: usePlaneGeometry(), reflection: useMirror({ blur: 2, front: 0.4 }) });
            return createScene();
        });
        expect(floor.material.reflection).toMatchObject({ read: 'screen', front: 0.4, blur: 2 });
        expect(floor.material.reflection!.texture.width).toBe(320);
    });

    it('lays its camera on the surface\'s plane once the surface is placed, facing the camera', () => {
        const { store } = createTestGame();
        let picture!: TTexture;
        startTestScene(store, 'Hall', () => {
            useCamera3d({ projection: 'perspective', transform: { y: 2, z: 6 } });
            const mirror = useMirror();
            picture = mirror.texture;
            createMesh({ geometry: usePlaneGeometry(), reflection: mirror, transform: { y: 0.5 } });
            return createScene();
        });
        const ctx = { passes: [{}], time: 0, progress: 0, phase: 0 } as Parameters<typeof fillFrameContext>[1];
        // The first frame places the surface; the late update after the next reads where it ended up.
        advanceFrame(store, ctx, 1000 / 60);
        advanceFrame(store, ctx, 1000 / 60);
        const pass = ctx.passes.find((one) => one.renderTarget === picture.gpu)!;
        const mirror = pass.views3d![0]!.camera!.mirror!;
        expect(mirror.y).toBeCloseTo(1);
        expect(mirror.d).toBeCloseTo(-0.5);
    });

    it('is left out of a scene document, with what it made, and the surface kept', () => {
        const { store } = createTestGame();
        const root = startTestScene(store, 'Hall', () => {
            useCamera3d({ projection: 'perspective', transform: { y: 2, z: 6 } });
            createMesh({ geometry: usePlaneGeometry(), tint: '#202020', reflection: useMirror() });
            return createScene();
        });
        const doc = serializeScene(root);
        const mesh = doc.root.components.find((c) => c.type === 'mesh');
        const material = mesh?.type === 'mesh' ? mesh.material : undefined;
        expect(material).not.toHaveProperty('reflection');
        expect(material).not.toHaveProperty('maps');
        expect(material?.fragment).toBeNull();
        expect(material?.uniforms).toBeNull();
    });
});

describe('useEnvironment', () => {
    const frame = () => ({ passes: [{}], time: 0, progress: 0, phase: 0 }) as Parameters<typeof fillFrameContext>[1];

    it('draws the six faces of a cube round its model into one picture, three across and two down', () => {
        const { store } = createTestGame();
        let ball!: TMesh;
        let room!: ReturnType<typeof useEnvironment>;
        startTestScene(store, 'Hall', () => {
            useCamera3d({ projection: 'perspective', transform: { y: 2, z: 6 } });
            ball = createMesh({ geometry: usePlaneGeometry(), transform: { x: 3, y: 1 } });
            room = useEnvironment({ around: ball, size: 32, live: true, height: 0.5 });
            createMesh({ geometry: usePlaneGeometry(), transform: { z: -4 } });
            return createScene();
        });
        expect(room.read).toBe('cube');
        expect([room.texture.width, room.texture.height]).toEqual([96, 64]);
        const ctx = frame();
        advanceFrame(store, ctx, 1000 / 60);
        advanceFrame(store, ctx, 1000 / 60);
        // Six faces seen from the model, lifted, each 90 degrees wide, and the picture laying them out.
        const faces = ctx.passes.filter((pass) => pass.views3d?.[0]?.camera?.fov === 90);
        expect(faces).toHaveLength(6);
        for (const face of faces) {
            expect(face.views3d![0]!.camera!.transform).toMatchObject({ x: 3, y: 1.5, z: 0 });
            // The model is left out of its own surroundings; the other plane is in them.
            const drawn = face.drawables!.filter((d) => d.type === 'mesh');
            expect(drawn.some((d) => (d as { transform: { x: number } }).transform.x === 3)).toBe(false);
        }
    });

    it('follows a plugin\'s drawing and leaves it out of its own surroundings, as it does a model', () => {
        registerDrawableKind({ name: 'test-environment-blob', prepare: () => null });
        const { store } = createTestGame();
        let blob!: TCustomDrawable;
        startTestScene(store, 'Hall', () => {
            useCamera3d({ projection: 'perspective', transform: { y: 2, z: 6 } });
            blob = createDrawable('test-environment-blob', { transform: { x: -2, y: 1 } });
            useEnvironment({ around: blob, size: 16, live: true });
            createMesh({ geometry: usePlaneGeometry(), transform: { z: -4 } });
            return createScene();
        });
        const ctx = frame();
        advanceFrame(store, ctx, 1000 / 60);
        advanceFrame(store, ctx, 1000 / 60);
        const faces = ctx.passes.filter((pass) => pass.views3d?.[0]?.camera?.fov === 90);
        expect(faces).toHaveLength(6);
        for (const face of faces) {
            expect(face.views3d![0]!.camera!.transform).toMatchObject({ x: -2, y: 1, z: 0 });
            // The drawing is in the list as the engine's stand-in for it, never as itself: the only one
            // in the scene, so none at all.
            expect(face.drawables!.some((d) => d.type === 'custom')).toBe(false);
            expect(face.drawables!.some((d) => d.type === 'mesh')).toBe(true);
        }
    });

    it('captured once, stops drawing when the scene has loaded, and draws again when asked', () => {
        const { store } = createTestGame();
        let room!: ReturnType<typeof useEnvironment>;
        startTestScene(store, 'Hall', () => {
            useCamera3d({ projection: 'perspective', transform: { y: 2, z: 6 } });
            room = useEnvironment({ size: 16 });
            createMesh({ geometry: usePlaneGeometry(), transform: { z: -4 } });
            return createScene();
        });
        const facesIn = () => {
            const ctx = frame();
            advanceFrame(store, ctx, 1000 / 60);
            return ctx.passes.filter((pass) => pass.views3d?.[0]?.camera?.fov === 90).length;
        };
        const seen = [facesIn(), facesIn(), facesIn(), facesIn(), facesIn(), facesIn(), facesIn()];
        // Drawn while it settles, then kept.
        expect(seen.filter((count) => count === 6).length).toBeGreaterThanOrEqual(3);
        expect(seen[seen.length - 1]).toBe(0);
        room.capture();
        expect(facesIn()).toBe(6);
    });

    it('is read as a cube by the reflection, in the world\'s own axes, and by the recipes', () => {
        const picture: TTexture = { type: 'texture', key: 'room', src: '', width: 6, height: 4, status: 'ready', gpu: null };
        const shiny = createMaterial(chrome({ environment: { texture: picture, read: 'cube' } })) as TMeshMaterial;
        expect(shiny.reflection).toMatchObject({ read: 'cube', front: 0.9 });
        expect(shiny.fragment).toContain('envCubeUv(ctx)');
        expect(shiny.fragmentGlsl).toContain('envCubeUv(ctx)');
        // Both cards know the function, in the drawn material and its shadow.
        expect(buildMeshMaterialShader(null, null, {}, ['reflection'])).toContain('fn envCubeUv(ctx: FragContext) -> vec2<f32>');
        expect(buildMeshMaterialShaderGlsl(null, null, {}, ['reflection']).fragment).toContain('vec2 envCubeUv(FragContext ctx)');
        expect(buildMeshMaterialShadowShader(null, {}, ['reflection'], false, { fragment: null })).toContain('fn envCubeUv(ctx: FragContext)');
    });
});
