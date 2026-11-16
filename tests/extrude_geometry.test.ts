import { describe, expect, it, spyOn } from 'bun:test';
import { GEOMETRY_STRIDE } from '../src/geometry/types/t_geometry';
import { mergeGeometries } from '../src/geometry/merge_geometries';
import { createScene } from '../src/scene/create_scene';
import { createMesh } from '../src/gameobjects/mesh/create_mesh';
import { useExtrudeGeometry } from '../src/hooks/geometry/use_extrude_geometry';
import { useSpawn } from '../src/hooks/spawn/use_spawn';
import { useTransform } from '../src/hooks/transform/use_transform';
import { parseSceneDoc, sceneFromDoc, serializeScene } from '../src/scene/document';
import { createTestGame, startTestScene } from './helpers/test_game';
import type { TExtrudeGeometryOptions } from '../src/hooks/geometry/use_extrude_geometry';
import type { TGeometry } from '../src/geometry';
import type { TMesh } from '../src/gameobjects/mesh';

/**
 * A flat outline pushed out into a solid: closed all round, as big as its outline by its depth,
 * seen from outside, its holes cut right through and its edges cut by a bevel.
 */

type P = { x: number; y: number };

const DIAMOND: P[] = [{ x: 0, y: 0.5 }, { x: 0.3, y: 0 }, { x: 0, y: -0.5 }, { x: -0.3, y: 0 }];
const square = (half: number, cx = 0, cy = 0): P[] => [
    { x: cx - half, y: cy - half }, { x: cx + half, y: cy - half }, { x: cx + half, y: cy + half }, { x: cx - half, y: cy + half },
];
const circle = (r: number, n: number): P[] => Array.from({ length: n }, (_, i) => ({ x: Math.cos((i * Math.PI * 2) / n) * r, y: Math.sin((i * Math.PI * 2) / n) * r }));

const made = (options: TExtrudeGeometryOptions) => {
    const game = createTestGame();
    let geometry: TGeometry | null = null;
    startTestScene(game.store, 'Level', () => {
        geometry = useExtrudeGeometry(options);
        return createScene();
    });
    const g = geometry!;
    const vertices = game.renderer.buffers.find((buffer) => buffer.handle === g.vertexBuffer)!.data as Float32Array;
    const indices = game.renderer.buffers.find((buffer) => buffer.handle === g.indexBuffer)!.data as Uint16Array;
    return { geometry: g, vertices, indices };
};

const corner = (vertices: Float32Array, i: number) => Array.from(vertices.subarray(i * GEOMETRY_STRIDE, i * GEOMETRY_STRIDE + 8));

/**
 * Whether the solid is closed, every side of every triangle met by another going the other way, and
 * how much it holds: positive when every triangle is seen from outside.
 */
const solidOf = ({ vertices, indices }: { vertices: Float32Array; indices: Uint16Array | Uint32Array }) => {
    const key = (i: number) => [0, 1, 2].map((k) => vertices[i * GEOMETRY_STRIDE + k]!.toFixed(6)).join(',');
    const sides = new Map<string, number>();
    let volume = 0;
    for (let t = 0; t < indices.length; t += 3) {
        const [a, b, c] = [indices[t]!, indices[t + 1]!, indices[t + 2]!];
        const p = [a, b, c].map((i) => corner(vertices, i));
        volume += (p[0]![0]! * (p[1]![1]! * p[2]![2]! - p[1]![2]! * p[2]![1]!)
            - p[0]![1]! * (p[1]![0]! * p[2]![2]! - p[1]![2]! * p[2]![0]!)
            + p[0]![2]! * (p[1]![0]! * p[2]![1]! - p[1]![1]! * p[2]![0]!)) / 6;
        for (const [from, to] of [[a, b], [b, c], [c, a]] as const) {
            const there = `${key(from)}>${key(to)}`;
            sides.set(there, (sides.get(there) ?? 0) + 1);
        }
    }
    let open = 0;
    for (const [side, count] of sides) {
        const [from, to] = side.split('>');
        if ((sides.get(`${to}>${from}`) ?? 0) !== count) open++;
    }
    return { closed: open === 0, volume };
};

/** For each triangle, whether its corners' facings agree with the way its corners go round. */
const seenFromOutside = ({ vertices, indices }: { vertices: Float32Array; indices: Uint16Array | Uint32Array }): boolean => {
    for (let t = 0; t < indices.length; t += 3) {
        const p = [indices[t]!, indices[t + 1]!, indices[t + 2]!].map((i) => corner(vertices, i));
        const e1 = [0, 1, 2].map((k) => p[1]![k]! - p[0]![k]!);
        const e2 = [0, 1, 2].map((k) => p[2]![k]! - p[0]![k]!);
        const n = [e1[1]! * e2[2]! - e1[2]! * e2[1]!, e1[2]! * e2[0]! - e1[0]! * e2[2]!, e1[0]! * e2[1]! - e1[1]! * e2[0]!];
        if (Math.hypot(n[0]!, n[1]!, n[2]!) < 1e-12) continue;
        for (const q of p) {
            if (n[0]! * q[3]! + n[1]! * q[4]! + n[2]! * q[5]! <= 0) return false;
        }
    }
    return true;
};

describe('useExtrudeGeometry', () => {
    it('pushes an outline out into a closed solid, centred on its depth, as big as its outline by its depth', () => {
        const shape = made({ outline: DIAMOND, depth: 0.1 });
        const { min, max } = shape.geometry.bounds!;
        expect([min.x, min.y, min.z, max.x, max.y, max.z].map((n) => Math.round(n * 1e6) / 1e6)).toEqual([-0.3, -0.5, -0.05, 0.3, 0.5, 0.05]);
        const { closed, volume } = solidOf(shape);
        expect(closed).toBe(true);
        expect(volume).toBeCloseTo(0.3 * 0.1, 6);
        expect(seenFromOutside(shape)).toBe(true);
        expect(shape.geometry.source).toEqual({ kind: 'extrude', outline: DIAMOND, depth: 0.1 });
    });

    it('takes the outline either way round, and the same outline twice is the same shape', () => {
        const backwards = made({ outline: [...DIAMOND].reverse(), depth: 2 });
        expect(solidOf(backwards).volume).toBeCloseTo(0.3 * 2, 6);
        expect(seenFromOutside(backwards)).toBe(true);

        const { store } = createTestGame();
        startTestScene(store, 'Level', () => {
            const one = useExtrudeGeometry({ outline: DIAMOND });
            expect(useExtrudeGeometry({ outline: DIAMOND.map((p) => ({ ...p })) })).toBe(one);
            expect(useExtrudeGeometry({ outline: DIAMOND, depth: 2 })).not.toBe(one);
            expect(useExtrudeGeometry({ outline: DIAMOND, bevel: { size: 0.05 } })).not.toBe(one);
            expect(useExtrudeGeometry({ outline: square(1), holes: [square(0.5)] })).not.toBe(useExtrudeGeometry({ outline: square(1) }));
            return createScene();
        });
    });

    it('cuts its holes right through, with a side round each', () => {
        const frame = made({ outline: square(1), holes: [square(0.4, -0.45, 0), square(0.3, 0.5, 0.4)], depth: 0.5 });
        const { closed, volume } = solidOf(frame);
        expect(closed).toBe(true);
        expect(volume).toBeCloseTo((4 - 0.64 - 0.36) * 0.5, 6);
        expect(seenFromOutside(frame)).toBe(true);
        // Given the wrong way round, a hole is turned round too.
        const ring = made({ outline: circle(1, 24), holes: [circle(0.6, 18)], depth: 0.3 });
        expect(solidOf(ring).closed).toBe(true);
        expect(seenFromOutside(ring)).toBe(true);
    });

    it('cuts its edges with a bevel, still filling the outline by its depth, its faces smaller', () => {
        for (const segments of [1, 2, 5]) {
            const shape = made({ outline: square(1), holes: [square(0.4)], depth: 0.4, bevel: { size: 0.1, segments } });
            expect(shape.geometry.bounds!.max.x).toBeCloseTo(1, 6);
            expect(shape.geometry.bounds!.max.z).toBeCloseTo(0.2, 6);
            const { closed, volume } = solidOf(shape);
            expect(closed).toBe(true);
            expect(seenFromOutside(shape)).toBe(true);
            // Less than the outline by its depth, more than the faces by it.
            expect(volume).toBeLessThan((4 - 0.64) * 0.4);
            expect(volume).toBeGreaterThan((3.24 - 0.81) * 0.4);
            // The front face is the outline brought in by the bevel.
            let faceX = 0;
            for (let c = 0; c < shape.geometry.vertexCount; c++) {
                const [x, , z, , , nz] = corner(shape.vertices, c);
                if (Math.abs(z! - 0.2) < 1e-6 && nz === 1) faceX = Math.max(faceX, x!);
            }
            expect(faceX).toBeCloseTo(0.9, 6);
        }
        // A straight cut faces halfway between the face and the side.
        const cut = made({ outline: square(1), depth: 1, bevel: { size: 0.1, segments: 1 } });
        const leaning = Array.from({ length: cut.geometry.vertexCount }, (_, c) => corner(cut.vertices, c)).filter(([, , , nx, , nz]) => nx! > 0 && nz! > 0);
        expect(leaning.length).toBeGreaterThan(0);
        for (const [, , , nx, , nz] of leaning) {
            expect(nx).toBeCloseTo(Math.SQRT1_2, 6);
            expect(nz).toBeCloseTo(Math.SQRT1_2, 6);
        }
    });

    it('stays closed with a point on a straight side, holes joined along a line, and a corner turned all the way back', () => {
        const ell = made({ outline: [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 2, y: 0 }, { x: 2, y: 1 }, { x: 1, y: 1 }, { x: 1, y: 2 }, { x: 0, y: 2 }] });
        expect(solidOf(ell).closed).toBe(true);
        expect(solidOf(ell).volume).toBeCloseTo(3, 5);
        const lined = made({
            outline: [{ x: 0, y: 0 }, { x: 6, y: 0 }, { x: 6, y: 4 }, { x: 0, y: 4 }],
            holes: [[{ x: 2, y: 1 }, { x: 3, y: 2 }, { x: 2, y: 2 }], [{ x: 4, y: 2 }, { x: 5, y: 2 }, { x: 5, y: 3 }, { x: 4, y: 3 }]],
        });
        expect(solidOf(lined).closed).toBe(true);
        expect(solidOf(lined).volume).toBeCloseTo(24 - 0.5 - 1, 5);
        expect(seenFromOutside(lined)).toBe(true);
        const thin = made({ outline: [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 0, y: 1e-9 }] });
        expect(Array.from(thin.vertices.subarray(0, thin.geometry.vertexCount * GEOMETRY_STRIDE)).every(Number.isFinite)).toBe(true);
    });

    it('meets in a hard edge where the outline turns sharply, and rounds smoothly where it turns a little', () => {
        // Sides of the solid, by where their corners are: how many ways a place on the side faces.
        const facingsAt = (shape: ReturnType<typeof made>) => {
            const ways = new Map<string, Set<string>>();
            for (let c = 0; c < shape.geometry.vertexCount; c++) {
                const [x, y, z, nx, ny, nz] = corner(shape.vertices, c);
                if (Math.abs(nz!) > 1e-6) continue;
                const at = `${x!.toFixed(5)},${y!.toFixed(5)},${z!.toFixed(5)}`;
                ways.set(at, (ways.get(at) ?? new Set()).add(`${nx!.toFixed(4)},${ny!.toFixed(4)}`));
            }
            return [...ways.values()].map((set) => set.size);
        };
        expect(facingsAt(made({ outline: DIAMOND })).every((n) => n === 2)).toBe(true);
        expect(facingsAt(made({ outline: circle(1, 32) })).every((n) => n === 1)).toBe(true);
        expect(facingsAt(made({ outline: circle(1, 32), creaseAngle: 0 })).every((n) => n === 2)).toBe(true);
        expect(facingsAt(made({ outline: DIAMOND, creaseAngle: Math.PI })).every((n) => n === 1)).toBe(true);
    });

    it('lays its picture once over each face, upright, and once round its sides', () => {
        const shape = made({ outline: square(1), depth: 1 });
        const all = Array.from({ length: shape.geometry.vertexCount }, (_, c) => corner(shape.vertices, c));
        const front = all.filter(([, , , , , nz]) => nz === 1);
        const back = all.filter(([, , , , , nz]) => nz === -1);
        const at = (list: number[][], x: number, y: number) => list.find(([px, py]) => px === x && py === y)!.slice(6).map((n) => Math.round(n * 1e6) / 1e6);
        expect(at(front, -1, 1)).toEqual([0, 0]);
        expect(at(front, 1, -1)).toEqual([1, 1]);
        // From behind, its left is +x.
        expect(at(back, 1, 1)).toEqual([0, 0]);
        const sides = all.filter(([, , , , , nz]) => nz === 0);
        expect(Math.min(...sides.map((c) => c[6]!))).toBe(0);
        expect(Math.max(...sides.map((c) => c[6]!))).toBe(1);
        expect(new Set(sides.map((c) => c[7])).size).toBe(2);
    });

    it('says what is wrong with what it is asked for', () => {
        const ask = (options: TExtrudeGeometryOptions) => () => made(options);
        expect(ask({ outline: DIAMOND, depth: 0 })).toThrow('depth is 0');
        expect(ask({ outline: DIAMOND, depth: 1, bevel: { size: 0.6 } })).toThrow('at most half the depth (0.5)');
        expect(ask({ outline: DIAMOND, bevel: { size: 0.1, segments: 0 } })).toThrow('bevel.segments is 0');
        expect(ask({ outline: square(1), holes: [square(0.9)], bevel: { size: 0.2 } })).toThrow('a bevel of 0.2 is wider than the outline is at its narrowest');
        expect(ask({ outline: DIAMOND, creaseAngle: -1 })).toThrow('creaseAngle is -1');
        expect(ask({ outline: [{ x: 0, y: 0 }, { x: 1, y: 1 }, { x: 1, y: 0 }, { x: 0, y: 1 }] })).toThrow('useExtrudeGeometry: the outline crosses or touches itself');
        expect(ask({} as TExtrudeGeometryOptions)).toThrow('useExtrudeGeometry: the outline takes a list of points');
    });

    it('is merged like any shape hook\'s', () => {
        const { store } = createTestGame();
        let merged: TGeometry | null = null;
        let one: TGeometry | null = null;
        startTestScene(store, 'Level', () => {
            one = useExtrudeGeometry({ outline: DIAMOND, bevel: { size: 0.02 } });
            merged = mergeGeometries([{ geometry: one, x: -1 }, { geometry: one, x: 1, scaleX: -1 }]);
            return createScene();
        });
        expect(merged!.vertexCount).toBe(one!.vertexCount * 2);
    });

    it('is written in a scene document as its recipe and made again from it', () => {
        const recipe = { outline: DIAMOND, holes: [[{ x: 0, y: 0.1 }, { x: 0.05, y: 0 }, { x: 0, y: -0.1 }, { x: -0.05, y: 0 }]], depth: 0.1, bevel: { size: 0.01, segments: 2 }, creaseAngle: 0.4 };
        const { store } = createTestGame();
        const root = startTestScene(store, 'Level', () => {
            useSpawn(function Diamond() {
                useTransform({});
                createMesh({ geometry: useExtrudeGeometry(recipe) });
            })();
            return createScene();
        });
        const doc = serializeScene(root);
        expect(doc.assets.find((asset) => asset.type === 'geometry')).toMatchObject({ source: { kind: 'extrude', ...recipe } });
        expect(parseSceneDoc(doc, '/scenes/level.scene')).toEqual(doc);

        const again = createTestGame();
        const built = startTestScene(again.store, 'Level', sceneFromDoc(doc));
        const mesh = built.children[0]!.drawables.find((drawable) => drawable.type === 'mesh') as TMesh;
        expect(mesh.geometry!.source).toEqual({ kind: 'extrude', ...recipe });
        expect(mesh.geometry!.indexCount).toBeGreaterThan(0);
    });

    it('opens a document whose outline is not one, without that shape', () => {
        const scene = (outline: unknown) => parseSceneDoc({
            format: 'nacatamalon-scene', version: 1, name: 'Level',
            assets: [{ type: 'geometry', key: 'bad', source: { kind: 'extrude', outline } }],
            root: { id: 'root', name: 'Level', transform: null, components: [], children: [] },
        }, '/scenes/level.scene');
        expect(scene([{ x: 0, y: 0 }, { x: 'far', y: 1 }, { x: 1, y: 0 }]).assets).toHaveLength(0);
        expect(scene([{ x: 0, y: 0 }, { x: 1, y: 1 }]).assets).toHaveLength(0);

        // Numbers, but crossing itself: the scene opens, and says why the shape is not there.
        const crossing = scene([{ x: 0, y: 0 }, { x: 1, y: 1 }, { x: 1, y: 0 }, { x: 0, y: 1 }]);
        const warn = spyOn(console, 'warn').mockImplementation(() => {});
        const { store } = createTestGame();
        expect(() => startTestScene(store, 'Level', sceneFromDoc(crossing))).not.toThrow();
        expect(warn.mock.calls.some(([message]) => String(message).includes('the shape "bad" is not made: useExtrudeGeometry: the outline crosses or touches itself'))).toBe(true);
        warn.mockRestore();
    });
});
