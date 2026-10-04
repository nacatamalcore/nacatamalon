import { describe, expect, it } from 'bun:test';
import { createScene } from '../src/scene/create_scene';
import { useCamera3d } from '../src/hooks/camera/use_camera_3d';
import { computeProjection, computeView, computeModelMatrix } from '../src/render/shared/compute_mvp_3d';
import { createTestGame, startTestScene } from './helpers/test_game';
import type { TDrawCamera3d } from '../src/render/interface/draw/t_draw_camera_3d';
import type { Mat4 } from '../src/math/mat4';

/**
 * Where a point ends up on screen, which is the only thing a camera is for.
 *
 * The orthographic checks are the ones that matter: that mode exists so a model measures in the
 * same pixels a sprite does, and nothing about it is obvious enough to trust by reading.
 */

const at = (x = 0, y = 0, z = 0, rotationY = 0) => ({
    x, y, z, rotation: 0, rotationX: 0, rotationY, scaleX: 1, scaleY: 1, scaleZ: 1,
});

const camera = (fields: Partial<TDrawCamera3d> = {}): TDrawCamera3d => ({
    projection: 'orthographic', transform: at(), fov: 60, near: 0.1, far: 1000, zoom: 1, ...fields,
});

/**
 * Multiplies a matrix by a point and divides through, which is what the graphics card does.
 */
const project = (m: Mat4, x: number, y: number, z: number) => {
    const w = m[3] * x + m[7] * y + m[11] * z + m[15];
    return {
        x: (m[0] * x + m[4] * y + m[8] * z + m[12]) / w,
        y: (m[1] * x + m[5] * y + m[9] * z + m[13]) / w,
    };
};

/**
 * Where a world point lands on a 400x300 screen, in pixels from the top-left.
 */
const onScreen = (cam: TDrawCamera3d, x: number, y: number, z = 0) => {
    const view = computeView(cam);
    const projection = computeProjection(cam, 400, 300);
    const ndc = project(multiply(projection, view), x, y, z);
    return { x: (ndc.x * 0.5 + 0.5) * 400, y: (1 - (ndc.y * 0.5 + 0.5)) * 300 };
};

/**
 * Column-major multiply, the same one the renderer uses.
 */
const multiply = (a: Mat4, b: Mat4): Mat4 => {
    const out = new Float32Array(16);
    for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) {
        out[c * 4 + r] = a[r] * b[c * 4] + a[4 + r] * b[c * 4 + 1] + a[8 + r] * b[c * 4 + 2] + a[12 + r] * b[c * 4 + 3];
    }
    return out;
};

describe('an orthographic camera measures in pixels', () => {
    it('puts a point at its own pixel', () => {
        // The 2D reads y downwards from the top-left; a model reads it upwards. The bridge is one
        // subtraction, so world y = 300 - screen y.
        const seen = onScreen(camera(), 100, 300 - 80);
        expect(seen.x).toBeCloseTo(100, 3);
        expect(seen.y).toBeCloseTo(80, 3);
    });

    it('one unit is one pixel', () => {
        const a = onScreen(camera(), 100, 200);
        const b = onScreen(camera(), 140, 200);
        expect(b.x - a.x).toBeCloseTo(40, 3);
    });

    it('moves with the camera the way the 2D does', () => {
        // Moving the camera down by 60 has to move what is drawn up by 60, not down: the whole
        // point of the frustum's shift is that both halves agree about which way y goes.
        const still = onScreen(camera(), 100, 200);
        const moved = onScreen(camera({ transform: at(0, 60) }), 100, 200);
        expect(moved.x).toBeCloseTo(still.x, 3);
        expect(moved.y - still.y).toBeCloseTo(-60, 3);
    });

    it('zooms about the top-left corner, as the 2D does', () => {
        const zoomed = onScreen(camera({ zoom: 2 }), 100, 300);
        // Twice as big, measured from the corner: what was 100 across is now 50 from it.
        expect(zoomed.x).toBeCloseTo(50, 3);
        expect(zoomed.y).toBeCloseTo(0, 3);
    });

    it('draws something with no camera at all', () => {
        const projection = computeProjection(null, 400, 300);
        expect(projection.some((v) => Number.isNaN(v))).toBe(false);
        const ndc = project(projection, 200, 150, 0);
        expect(ndc.x).toBeCloseTo(0, 3);
    });
});

describe('a perspective camera', () => {
    it('makes what is further away smaller', () => {
        const cam = camera({ projection: 'perspective', transform: at(0, 0, 10) });
        const near = onScreen(cam, 1, 0, 0);
        const far = onScreen(cam, 1, 0, -20);
        // Both to the right of the middle, but the far one less so.
        expect(near.x).toBeGreaterThan(200);
        expect(far.x).toBeGreaterThan(200);
        expect(far.x - 200).toBeLessThan(near.x - 200);
    });
});

describe('the placement of a camera and of a model', () => {
    it('are the same recipe, one inverted', () => {
        const placement = at(3, 4, 5, 0.7);
        const model = computeModelMatrix(placement);
        const view = computeView(camera({ transform: placement }));
        // A model at the camera's own placement, seen by it, sits at the origin.
        const both = multiply(view, model);
        expect(both[12]).toBeCloseTo(0, 5);
        expect(both[13]).toBeCloseTo(0, 5);
        expect(both[14]).toBeCloseTo(0, 5);
    });
});

describe('useCamera3d', () => {
    it('refuses to be called outside a scene body', () => {
        expect(() => useCamera3d()).toThrow('[NacatamalOn] useCamera3d');
    });

    it('puts one on the scene and keeps the first', () => {
        const { store } = createTestGame();
        const warn = console.warn;
        console.warn = () => {};
        let first!: ReturnType<typeof useCamera3d>;
        let second!: ReturnType<typeof useCamera3d>;
        const scene = startTestScene(store, 'Level', () => {
            first = useCamera3d({ z: 5 });
            second = useCamera3d({ z: 900 });
            return createScene();
        });
        console.warn = warn;

        expect(scene.camera3d).toBe(first);
        expect(second).toBe(first);
        expect(first.transform.z).toBe(5);
        expect(first.projection).toBe('orthographic');
    });
});
