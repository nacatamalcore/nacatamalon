import { describe, expect, it } from 'bun:test';
import * as mat from '../src/math/mat4';
import { fillMeshUniforms, MESH_UNIFORM_FLOATS, LIGHT_UNIFORM_FLOATS } from '../src/render/shared';
import { computeModelMatrix, computeProjection, computeView, fillCameraSpace, newCameraSpace } from '../src/render/shared/compute_mvp_3d';
import { MESH_SHADER } from '../src/render/webgpu/mesh/mesh_shader';
import { MESH_VERTEX_GLSL, MESH_FRAGMENT_GLSL } from '../src/render/webgl2/mesh/mesh_shader';
import { MESH_STRIDE, LIGHT_STRIDE } from '../src/render/webgpu/mesh/create_mesh_pipeline';
import { toGlClip } from '../src/render/webgl2/mesh/depth_range';
import type { TDrawCamera3d, TDrawMesh } from '../src/render/interface';

/**
 * The block of numbers a model is drawn from, and the two shaders that read it.
 *
 * Unlike the sprites, both backends fill this with the **same** function, so there is no pair of
 * copies to compare. What can still drift is the two shaders: one of them gaining a field, or the
 * same fields in another order, and either would be read as whatever happened to be at that offset.
 * So the members are compared as text, which is the only place the two say it separately.
 */

const at = (fields: Record<string, number> = {}) => ({
    x: 0, y: 0, z: 0, rotation: 0, rotationX: 0, rotationY: 0, scaleX: 1, scaleY: 1, scaleZ: 1, ...fields,
});

/**
 * How a scene is looked at, worked out once and shared by every model in it.
 */
const seenFrom = (camera: TDrawCamera3d | null, width = 400, height = 300) =>
    fillCameraSpace(newCameraSpace(), camera, width, height);

const mesh = (fields: Partial<TDrawMesh> = {}): TDrawMesh => ({
    type: 'mesh',
    geometry: null,
    transform: at(),
    skeleton: null,
    material: {
        id: 'm', name: null,
        fragment: null, fragmentGlsl: null, vertex: null, vertexGlsl: null,
        uniforms: null, uniformSig: null,
        texture: null,
        tint: { r: 0.1, g: 0.2, b: 0.3, a: 0.8 },
        emissive: { r: 0.4, g: 0.5, b: 0.6, a: 1 },
        specular: { r: 0.7, g: 0.8, b: 0.9, a: 1 },
        shininess: 24,
        alpha: 0.5,
    },
    ...fields,
});

const camera = (fields: Partial<TDrawCamera3d> = {}): TDrawCamera3d => ({
    projection: 'perspective', transform: at({ x: 1, y: 2, z: 3 }), fov: 60, near: 0.1, far: 100, zoom: 1, ...fields,
});

/**
 * The member names a block declares, in order, from either language.
 */
const membersOf = (source: string, block: string): string[] => {
    const body = source.split(block)[1].split('}')[0];
    return [...body.matchAll(/(?:^|\n)\s*(?:(\w+)\s+(\w+)|(\w+)\s*:\s*[\w<>,\s]+)\s*[;,]/g)]
        .map((m) => m[2] ?? m[3])
        .filter((name): name is string => name !== undefined);
};

describe('one model, sixty-four numbers', () => {
    it('is exactly one slot of the shared buffer', () => {
        // Not a number picked: the card only points at offsets that are multiples of 256 bytes, and
        // sixty-four numbers is exactly that. Nothing is wasted and nothing has to be padded.
        expect(MESH_UNIFORM_FLOATS * 4).toBe(MESH_STRIDE);
        // The lights are bigger than one slot, so theirs rounds up to three.
        expect(LIGHT_UNIFORM_FLOATS * 4).toBeLessThanOrEqual(LIGHT_STRIDE);
        expect(LIGHT_STRIDE % 256).toBe(0);
    });

    it('writes each field where the shader looks for it', () => {
        const out = new Float32Array(MESH_UNIFORM_FLOATS);
        fillMeshUniforms(out, 0, mesh(), seenFrom(camera(), 400, 300));

        // Three matrices first, then four groups of four.
        const near = (from: number, to: number, expected: number[]) =>
            Array.from(out.subarray(from, to)).forEach((value, i) => expect(value).toBeCloseTo(expected[i], 6));

        // How solid it is is folded into the colour's own, so the shader reads one number.
        near(48, 52, [0.1, 0.2, 0.3, 0.5 * 0.8]);
        near(52, 56, [0.4, 0.5, 0.6, 0]);
        // Where it is looked at from, which the shine needs.
        near(56, 60, [1, 2, 3, 0]);
        near(60, 64, [0.7, 0.8, 0.9, 24]);
    });

    it('uses where the box put it, when a box did', () => {
        const world = new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 7, 8, 9, 1]);
        const out = new Float32Array(MESH_UNIFORM_FLOATS);
        fillMeshUniforms(out, 0, mesh({ worldMatrix: world }), seenFrom(null, 400, 300));

        // The world matrix, not the model's own: the shading asks where a corner really is.
        expect(Array.from(out.subarray(16 + 12, 16 + 15))).toEqual([7, 8, 9]);
    });

    it('keeps directions out of the projection, and out of the scale', () => {
        const out = new Float32Array(MESH_UNIFORM_FLOATS);
        fillMeshUniforms(out, 0, mesh({ transform: at({ x: 50, scaleX: 3 }) }), seenFrom(camera(), 400, 300));

        // No move in it, because a direction has no place, and no scale, because a stretched
        // direction reads as a surface facing somewhere it does not.
        expect(Array.from(out.subarray(32 + 12, 32 + 15))).toEqual([0, 0, 0]);
        expect(out[32]).toBeCloseTo(1, 6);
    });

    it('turns the directions with whatever turned the model', () => {
        // A quarter turn about Y: what faced along +Z now faces along +X.
        const quarter = new Float32Array([0, 0, -1, 0, 0, 1, 0, 0, 1, 0, 0, 0, 5, 6, 7, 1]);
        const out = new Float32Array(MESH_UNIFORM_FLOATS);
        fillMeshUniforms(out, 0, mesh({ worldMatrix: quarter }), seenFrom(null, 400, 300));

        // Taken from where the model ended up, not from the angles it was written with: a model
        // inside something that turned would otherwise be lit as though it had never moved.
        expect(Array.from(out.subarray(32, 44))).toEqual([0, 0, -1, 0, 0, 1, 0, 0, 1, 0, 0, 0]);
    });
});

describe('the two shaders', () => {
    it('declare the same block, in the same order', () => {
        const wgsl = membersOf(MESH_SHADER, 'struct Uniforms {');
        const glsl = membersOf(MESH_VERTEX_GLSL, 'uniform Uniforms {');

        expect(glsl).toEqual(wgsl);
        expect(wgsl).toEqual(['mvp', 'model', 'normalMatrix', 'tint', 'emissive', 'cameraPosition', 'specular']);
    });

    it('declare the same light, in the same order', () => {
        expect(membersOf(MESH_VERTEX_GLSL, 'struct LightItem {')).toEqual(membersOf(MESH_SHADER, 'struct LightItem {'));
        expect(membersOf(MESH_SHADER, 'struct LightItem {')).toEqual(['vector', 'color', 'spotDirection', 'spotParams']);
    });

    it('read the same block in both of the GLSL stages', () => {
        // GLSL needs a block declared in every stage that reads it, so the two copies are two
        // chances to disagree. They come from one string, and this is what says so.
        expect(membersOf(MESH_FRAGMENT_GLSL, 'uniform Uniforms {')).toEqual(membersOf(MESH_VERTEX_GLSL, 'uniform Uniforms {'));
    });
});

describe('what the hoisting must not have changed', () => {
    /**
     * The camera used to be worked out inside this function, once for every model in the frame.
     * Now it is worked out once a pass and handed in. That is only allowed to be a speed-up if it
     * is the same arithmetic, and "the same" has to be checked rather than reasoned about: a
     * matrix that came out slightly wrong does not throw, it moves things.
     */
    it('puts a corner exactly where the old formula put it', () => {
        const cam = camera();
        const model = mesh({ transform: at({ x: 3, y: -2, z: 5, rotationY: 0.4, rotationX: -0.2, scaleX: 2 }) });

        const out = new Float32Array(MESH_UNIFORM_FLOATS);
        fillMeshUniforms(out, 0, model, seenFrom(cam));

        // Written out the long way, from the three pieces `camera_3d.test.ts` pins by themselves.
        const expected = mat.multiply(
            mat.multiply(computeProjection(cam, 400, 300), computeView(cam)),
            computeModelMatrix(model.transform),
        );

        for (let i = 0; i < 16; i++) {
            expect(out[i]).toBeCloseTo(expected[i], 5);
        }
    });

    it('is the same for the next model as it was for the first, which is what sharing risks', () => {
        // One space, two models: if anything were left behind between the two, the second would
        // come out carrying a piece of the first.
        const space = seenFrom(camera());
        const first = new Float32Array(MESH_UNIFORM_FLOATS);
        const second = new Float32Array(MESH_UNIFORM_FLOATS);
        const alone = new Float32Array(MESH_UNIFORM_FLOATS);

        fillMeshUniforms(first, 0, mesh({ transform: at({ x: 9, rotationY: 1.1 }) }), space);
        fillMeshUniforms(second, 0, mesh({ transform: at({ x: -4, scaleZ: 3 }) }), space);
        fillMeshUniforms(alone, 0, mesh({ transform: at({ x: -4, scaleZ: 3 }) }), seenFrom(camera()));

        expect(Array.from(second)).toEqual(Array.from(alone));
    });

    it('writes at the offset it is given, so a frame needs no slice per model', () => {
        const alone = new Float32Array(MESH_UNIFORM_FLOATS);
        const shared = new Float32Array(MESH_UNIFORM_FLOATS * 3);
        const space = seenFrom(camera());

        fillMeshUniforms(alone, 0, mesh(), space);
        fillMeshUniforms(shared, MESH_UNIFORM_FLOATS * 2, mesh(), space);

        expect(Array.from(shared.subarray(MESH_UNIFORM_FLOATS * 2))).toEqual(Array.from(alone));
        // And nothing was written anywhere else in it.
        expect(Array.from(shared.subarray(0, MESH_UNIFORM_FLOATS * 2)).every((v) => v === 0)).toBe(true);
    });

    it('hands back the same matrices frame after frame, which is the whole point', () => {
        const space = newCameraSpace();
        const before = space.viewProjection;

        fillCameraSpace(space, camera(), 400, 300);
        fillCameraSpace(space, camera({ projection: 'orthographic' }), 800, 600);

        // Filled again in the place it already had. A new one every pass is what this replaced.
        expect(space.viewProjection).toBe(before);
    });
});

describe('the depth range', () => {
    it('is remapped for the card that wants -1 to 1', () => {
        const space = seenFrom(camera({ projection: 'orthographic' }));
        const before = Array.from(space.viewProjection);
        toGlClip(space.viewProjection);
        const after = Array.from(space.viewProjection);

        // Only the third row, which is the one depth comes out of.
        for (const i of [0, 1, 3, 4, 5, 7, 8, 9, 11, 12, 13, 15]) {
            expect(after[i]).toBe(before[i]);
        }
        for (const i of [2, 6, 10, 14]) {
            expect(after[i]).toBeCloseTo(before[i] * 2 - before[i + 1], 5);
        }
    });

    it('gives the same matrix folded into the camera as applied to every model in turn', () => {
        // This is what lets it happen once a pass instead of once a model, and it is not an
        // optimisation dressed up as one: the fix is a multiplication from the left, so
        // `L(PVM)` and `(LP V)M` are the same matrix. If they were not, models would land in
        // slightly the wrong depth and the only symptom would be things drawn in the wrong order.
        const model = mesh({ transform: at({ x: 3, y: -2, z: 5, rotationY: 0.4, scaleX: 2 }) });

        // The old way: fill with the plain camera, then fix the model's own matrix.
        const perModel = new Float32Array(MESH_UNIFORM_FLOATS);
        fillMeshUniforms(perModel, 0, model, seenFrom(camera()));
        toGlClip(perModel);

        // The way it happens now: fix the camera once, then fill.
        const folded = new Float32Array(MESH_UNIFORM_FLOATS);
        const space = seenFrom(camera());
        toGlClip(space.viewProjection);
        fillMeshUniforms(folded, 0, model, space);

        for (let i = 0; i < 16; i++) {
            expect(folded[i]).toBeCloseTo(perModel[i], 4);
        }
    });

    it('leaves the other two matrices alone', () => {
        const out = new Float32Array(MESH_UNIFORM_FLOATS);
        const space = seenFrom(camera());
        toGlClip(space.viewProjection);
        fillMeshUniforms(out, 0, mesh(), space);
        const before = Array.from(out.subarray(16));
        toGlClip(out);

        // The world one and the turning one are read by the shading, which has no notion of a
        // depth range at all.
        expect(Array.from(out.subarray(16))).toEqual(before);
    });
});
