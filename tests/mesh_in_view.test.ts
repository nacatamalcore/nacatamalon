import { describe, expect, it } from 'bun:test';
import { cullingMatricesFor, meshInView } from '../src/render/shared/mesh_in_view';
import { fillCameraSpace, newCameraSpace } from '../src/render/shared/compute_mvp_3d';
import { toGlClip } from '../src/render/webgl2/mesh/depth_range';
import type { TDrawCamera3d } from '../src/render/interface/draw/t_draw_camera_3d';
import type { TDrawMesh } from '../src/render/interface/draw/t_draw_mesh';

/**
 * Skipping what a camera cannot see: a model wholly outside it costs nothing, and one that might
 * show is always drawn.
 */

const W = 320;
const H = 240;

/** A camera at `z = 10` looking down -Z, seeing from 0.1 to 50. */
const camera = (fields: Partial<TDrawCamera3d> = {}): TDrawCamera3d => ({
    projection: 'perspective',
    transform: { x: 0, y: 0, z: 10, rotation: 0, rotationX: 0, rotationY: 0, scaleX: 1, scaleY: 1, scaleZ: 1 },
    fov: 60, near: 0.1, far: 50, zoom: 1,
    ...fields,
});

const viewOf = (eye: TDrawCamera3d) => fillCameraSpace(newCameraSpace(), eye, W, H).viewProjection;

/** A one-unit cube standing at `(x, y, z)`. */
const cube = (x: number, y: number, z: number, fields: Record<string, unknown> = {}): TDrawMesh => ({
    type: 'mesh',
    geometry: {
        vertexBuffer: null, indexBuffer: null, indexCount: 0, indexType: 'uint16',
        skinBuffer: null, colorBuffer: null, detailBuffer: null,
        bounds: { min: { x: -0.5, y: -0.5, z: -0.5 }, max: { x: 0.5, y: 0.5, z: 0.5 } },
    },
    transform: { x, y, z, rotation: 0, rotationX: 0, rotationY: 0, scaleX: 1, scaleY: 1, scaleZ: 1 },
    material: { vertex: null, vertexGlsl: null } as unknown as TDrawMesh['material'],
    skeleton: null,
    ...fields,
}) as TDrawMesh;

/** A material that moves its corners in its shader. */
const waving = { vertex: 'fn vertex() {}', vertexGlsl: 'vec3 vertex() {}' } as unknown as TDrawMesh['material'];

/** Bones that each carry the shape somewhere else. */
const bones = (...moves: Array<[number, number, number]>) => {
    const jointMatrices = new Float32Array(moves.length * 16);
    moves.forEach(([x, y, z], j) => {
        jointMatrices.set([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, x, y, z, 1], j * 16);
    });
    return { key: 'rig', jointMatrices };
};

describe('a model the camera cannot see', () => {
    const view = viewOf(camera());

    it('is drawn in front of the camera and skipped behind it', () => {
        expect(meshInView(cube(0, 0, 0), view)).toBe(true);
        expect(meshInView(cube(0, 0, 20), view)).toBe(false);
    });

    it('is skipped past an edge, beyond how far the camera sees, and kept across an edge', () => {
        expect(meshInView(cube(-40, 0, 0), view)).toBe(false);
        expect(meshInView(cube(40, 0, 0), view)).toBe(false);
        expect(meshInView(cube(0, 30, 0), view)).toBe(false);
        expect(meshInView(cube(0, 0, -60), view)).toBe(false);
        // The edge of the view at that depth is about 7.7 across: one half in, one half out.
        expect(meshInView(cube(7.7, 0, 0), view)).toBe(true);
    });

    it('answers the same once WebGL2 folded its depth fix into the matrix', () => {
        const gl = new Float32Array(view);
        toGlClip(gl);
        for (const [x, y, z] of [[0, 0, 0], [0, 0, 20], [40, 0, 0], [0, 0, -60], [7.7, 0, 0]] as const) {
            expect(meshInView(cube(x, y, z), gl)).toBe(meshInView(cube(x, y, z), view));
        }
    });

    it('is drawn when it asks to be, or has no box to measure', () => {
        expect(meshInView(cube(0, 0, 20, { alwaysDrawn: true }), view)).toBe(true);
        const shapeless = cube(0, 0, 20);
        expect(meshInView({ ...shapeless, geometry: { ...shapeless.geometry!, bounds: null } }, view)).toBe(true);
    });

    it('is never skipped while its shader moves its corners and nobody said how far', () => {
        expect(meshInView(cube(40, 0, 0, { material: waving }), view)).toBe(true);
        // Said: judged with its box grown by that much.
        expect(meshInView(cube(40, 0, 0, { material: waving, boundsMargin: 1 }), view)).toBe(false);
        expect(meshInView(cube(40, 0, 0, { material: waving, boundsMargin: 40 }), view)).toBe(true);
        expect(meshInView(cube(40, 0, 0, { material: waving, boundsMargin: Infinity }), view)).toBe(true);
    });

    it('grows by its margin without a shader, so an arm reaching past its box still shows', () => {
        expect(meshInView(cube(9, 0, 0), view)).toBe(false);
        expect(meshInView(cube(9, 0, 0, { boundsMargin: 2 }), view)).toBe(true);
    });

    it('is judged in the pose its bones put it in, not the one it was made in', () => {
        // Made out of sight, carried into it by one of its bones.
        expect(meshInView(cube(40, 0, 0, { skeleton: bones([0, 0, 0], [-40, 0, 0]) }), view)).toBe(true);
        // Made in sight, carried out of it by every bone.
        expect(meshInView(cube(0, 0, 0, { skeleton: bones([40, 0, 0], [45, 0, 0]) }), view)).toBe(false);
    });

    it('is judged by an orthographic camera through its own box', () => {
        const flat = viewOf(camera({ projection: 'orthographic', transform: { ...camera().transform, z: 0 } }));
        expect(meshInView(cube(100, 100, 0, { transform: { ...cube(0, 0, 0).transform, x: 100, y: 100, scaleX: 10, scaleY: 10, scaleZ: 10 } }), flat)).toBe(true);
        expect(meshInView(cube(-100, 100, 0), flat)).toBe(false);
    });
});

describe('a camera told to skip by another one', () => {
    it('judges by that one, and each view by its own otherwise', () => {
        const eye = camera();
        const above = camera({ transform: { ...camera().transform, y: 30, z: 0, rotationX: -Math.PI / 2 }, cullingCamera: eye });
        const own = fillCameraSpace(newCameraSpace(), above, W, H);
        const plain = fillCameraSpace(newCameraSpace(), eye, W, H);
        const judges = cullingMatricesFor([{ camera: above }, { camera: eye }], [own, plain], W, H);

        // Below the camera above, but behind the eye: it sees it, the eye does not.
        const behindTheEye = cube(0, 0, 15);
        expect(meshInView(behindTheEye, own.viewProjection)).toBe(true);
        expect(meshInView(behindTheEye, judges[0]!)).toBe(false);
        expect(judges[1]).toBe(plain.viewProjection);
    });
});
