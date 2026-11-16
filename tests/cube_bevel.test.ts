import { describe, expect, it, spyOn } from 'bun:test';
import { mergeGeometries } from '../src/geometry/merge_geometries';
import { buildCube } from '../src/geometry/shapes/cube';
import { createScene } from '../src/scene/create_scene';
import { createMesh } from '../src/gameobjects/mesh/create_mesh';
import { useCubeGeometry } from '../src/hooks/geometry/use_cube_geometry';
import { useSpawn } from '../src/hooks/spawn/use_spawn';
import { useTransform } from '../src/hooks/transform/use_transform';
import { parseSceneDoc, sceneFromDoc, serializeScene } from '../src/scene/document';
import { corner, seenFromOutside, solidOf } from './helpers/solid';
import { createTestGame, startTestScene } from './helpers/test_game';
import type { TCubeGeometryOptions } from '../src/hooks/geometry/use_cube_geometry';
import type { TGeometry } from '../src/geometry';
import type { TMesh } from '../src/gameobjects/mesh';

/**
 * A box with its edges cut off: rounded, or cut straight at 45°. Still as big as it is asked, closed
 * all round and seen from outside, its picture laid on each face as far as the middle of its edges.
 */

const made = (options: TCubeGeometryOptions) => {
    const game = createTestGame();
    let geometry: TGeometry | null = null;
    startTestScene(game.store, 'Level', () => {
        geometry = useCubeGeometry(options);
        return createScene();
    });
    const g = geometry!;
    const vertices = game.renderer.buffers.find((buffer) => buffer.handle === g.vertexBuffer)!.data as Float32Array;
    const indices = game.renderer.buffers.find((buffer) => buffer.handle === g.indexBuffer)!.data as Uint16Array;
    const corners = Array.from({ length: g.vertexCount }, (_, c) => corner(vertices, c));
    return { geometry: g, vertices, indices, corners };
};

const rounded6 = (n: number) => Math.round(n * 1e6) / 1e6;

/** How far a point is from the box inside the cut, and which way: where a rounded box's surface is. */
const fromInside = (p: number[], half: [number, number, number], size: number) => {
    const d = [0, 1, 2].map((k) => p[k]! - Math.max(-(half[k]! - size), Math.min(half[k]! - size, p[k]!)));
    return { d, length: Math.hypot(d[0]!, d[1]!, d[2]!) };
};

describe('useCubeGeometry with a bevel', () => {
    it('rounds its edges and corners, still as big as it is asked, closed and seen from outside', () => {
        const box = made({ width: 2, height: 1, depth: 0.6, bevel: { size: 0.2, segments: 4 } });
        const { min, max } = box.geometry.bounds!;
        expect([min.x, min.y, min.z, max.x, max.y, max.z].map(rounded6)).toEqual([-1, -0.5, -0.3, 1, 0.5, 0.3]);
        const { closed, volume } = solidOf(box);
        expect(closed).toBe(true);
        expect(seenFromOutside(box)).toBe(true);

        // Every corner on the surface `size` out from the box inside the cut, facing straight out
        // from it: the edges a quarter of a circle, the corners an eighth of a ball.
        for (const p of box.corners) {
            const { d, length } = fromInside(p, [1, 0.5, 0.3], 0.2);
            expect(length).toBeCloseTo(0.2, 6);
            for (const k of [0, 1, 2]) expect(p[3 + k]!).toBeCloseTo(d[k]! / length, 6);
        }

        // Less than the round box it stands for, and more than with its edges cut straight.
        const [a, b, c, r] = [1.6, 0.6, 0.2, 0.2];
        const round = a * b * c + 2 * r * (a * b + b * c + c * a) + Math.PI * r * r * (a + b + c) + (4 / 3) * Math.PI * r ** 3;
        const straight = a * b * c + 2 * r * (a * b + b * c + c * a) + 2 * r * r * (a + b + c) + (4 / 3) * r ** 3;
        expect(volume).toBeLessThan(round);
        expect(volume).toBeGreaterThan(straight);
        // And as close to the round one as it is asked to be.
        expect(solidOf(made({ width: 2, height: 1, depth: 0.6, bevel: { size: 0.2, segments: 40 } })).volume).toBeCloseTo(round, 3);
    });

    it('cuts its edges straight at 45° with one segment, every piece flat', () => {
        const box = made({ bevel: { size: 0.1, segments: 1 } });
        const { closed, volume } = solidOf(box);
        expect(closed).toBe(true);
        expect(seenFromOutside(box)).toBe(true);
        const [a, r] = [0.8, 0.1];
        expect(volume).toBeCloseTo(a ** 3 + 2 * r * 3 * a * a + 2 * r * r * 3 * a + (4 / 3) * r ** 3, 6);

        // The faces, the cuts along the edges and the corners' cuts, facing out along one, two or
        // all three ways, and each triangle's corners facing the way it does.
        const facings = new Set(box.corners.map((p) => p.slice(3, 6).map((n) => rounded6(Math.abs(n))).sort().join(',')));
        expect([...facings].sort()).toEqual(['0,0,1', '0,0.707107,0.707107', '0.57735,0.57735,0.57735']);
        for (let t = 0; t < box.indices.length; t += 3) {
            const [p, q, s] = [0, 1, 2].map((k) => box.corners[box.indices[t + k]!]!);
            expect(p!.slice(3, 6)).toEqual(q!.slice(3, 6));
            expect(p!.slice(3, 6)).toEqual(s!.slice(3, 6));
            const e1 = [0, 1, 2].map((k) => q![k]! - p![k]!);
            const e2 = [0, 1, 2].map((k) => s![k]! - p![k]!);
            const n = [e1[1]! * e2[2]! - e1[2]! * e2[1]!, e1[2]! * e2[0]! - e1[0]! * e2[2]!, e1[0]! * e2[1]! - e1[1]! * e2[0]!];
            const length = Math.hypot(n[0]!, n[1]!, n[2]!);
            for (const k of [0, 1, 2]) expect(p![3 + k]!).toBeCloseTo(n[k]! / length, 5);
        }
    });

    it('cuts a rounded edge in an even number of steps, each face taking half', () => {
        const count = (segments: number) => made({ bevel: { size: 0.1, segments } }).geometry.vertexCount;
        expect(count(3)).toBe(count(4));
        expect(count(5)).toBe(count(6));
        expect(count(2)).toBeLessThan(count(3));
        // One step to each face's side of a two-step edge: the edge's middle at 45°.
        const two = made({ bevel: { size: 0.1, segments: 2 } });
        const middles = two.corners.filter(([x, y, z]) => rounded6(y!) === 0.4 && x! > 0 && z! > 0 && rounded6(x!) === rounded6(z!) && x! > 0.45);
        expect(middles.length).toBeGreaterThan(0);
        expect(rounded6(middles[0]![0]!)).toBe(rounded6(0.4 + 0.1 * Math.SQRT1_2));
    });

    it('meets the next face exactly in the middle of every edge', () => {
        const { vertices, indices } = buildCube(1.3, 0.7, 2.1, { size: 0.3, segments: 5 });
        // Not by six decimals but exactly: each place the two faces share is worked out the same.
        const exact = (i: number) => [0, 1, 2].map((k) => vertices[i * 8 + k]).join(',');
        const sides = new Map<string, number>();
        for (let t = 0; t < indices.length; t += 3) {
            const [a, b, c] = [indices[t]!, indices[t + 1]!, indices[t + 2]!];
            for (const [from, to] of [[a, b], [b, c], [c, a]] as const) sides.set(`${exact(from)}>${exact(to)}`, (sides.get(`${exact(from)}>${exact(to)}`) ?? 0) + 1);
        }
        for (const [side, count] of sides) {
            const [from, to] = side.split('>');
            expect(sides.get(`${to}>${from}`) ?? 0).toBe(count);
        }
    });

    it('is a ball, a pill or a round-edged slab when the cut reaches the middle of a side', () => {
        const ball = made({ bevel: { size: 0.5, segments: 8 } });
        expect(solidOf(ball).closed).toBe(true);
        expect(seenFromOutside(ball)).toBe(true);
        for (const p of ball.corners) expect(Math.hypot(p[0]!, p[1]!, p[2]!)).toBeCloseTo(0.5, 6);
        // No triangle of nothing where the flat part has no width left.
        for (let t = 0; t < ball.indices.length; t += 3) {
            const [i, j, k] = [ball.indices[t]!, ball.indices[t + 1]!, ball.indices[t + 2]!];
            expect(new Set([i, j, k].map((c) => ball.corners[c]!.slice(0, 3).map(rounded6).join(','))).size).toBe(3);
        }
        const slab = made({ width: 3, height: 0.2, depth: 2, bevel: { size: 0.1, segments: 1 } });
        expect(solidOf(slab).closed).toBe(true);
        expect(seenFromOutside(slab)).toBe(true);
    });

    it('lays each face\'s picture as far as the middle of its edges, by length', () => {
        const box = made({ bevel: { size: 0.2, segments: 2 } });
        const front = box.corners.filter((p) => rounded6(p[2]!) === 0.5 || (p[5]! > 0.5 && rounded6(p[5]!) !== 0.57735));
        const at = (x: number, y: number) => box.corners.find((p) => rounded6(p[0]!) === x && rounded6(p[1]!) === y && rounded6(p[2]!) === 0.5)!.slice(6).map(rounded6);
        // The front's flat part from 0.3 to -0.3, the cut a chord of 0.2·√(2 - √2) on each side of
        // it up to the edge's middle, the picture across all of it.
        const chord = 0.2 * Math.sqrt(2 - Math.SQRT2);
        const edge = chord / (2 * chord + 0.6);
        expect(at(-0.3, 0.3)).toEqual([edge, edge].map(rounded6));
        expect(at(0.3, -0.3)).toEqual([1 - edge, 1 - edge].map(rounded6));
        const us = front.map((p) => p[6]!);
        expect(Math.min(...us)).toBe(0);
        expect(Math.max(...us)).toBe(1);
        // Without a bevel, the box it always was.
        expect(made({}).corners.length).toBe(24);
    });

    it('says what is wrong with what it is asked for', () => {
        const ask = (options: TCubeGeometryOptions) => () => made(options);
        expect(ask({ width: 2, height: 1, depth: 3, bevel: { size: 0.6 } })).toThrow("bevel.size is 0.6, and it takes how far in the edges are cut, above 0 and at most half the box's smallest side (0.5)");
        expect(ask({ bevel: { size: 0 } })).toThrow('bevel.size is 0');
        expect(ask({ bevel: {} as { size: number } })).toThrow('bevel.size is undefined');
        expect(ask({ bevel: { size: 0.1, segments: 0 } })).toThrow('bevel.segments is 0');
    });

    it('is its own shape, kept as a recipe, merged, and laid by name', () => {
        const { store } = createTestGame();
        startTestScene(store, 'Level', () => {
            const sharp = useCubeGeometry();
            const round = useCubeGeometry({ bevel: { size: 0.1 } });
            expect(round).not.toBe(sharp);
            expect(useCubeGeometry({ bevel: { size: 0.1, segments: 3 } })).toBe(round);
            expect(useCubeGeometry({ bevel: { size: 0.1, segments: 1 } })).not.toBe(round);
            expect(round.source).toEqual({ kind: 'cube', width: 1, height: 1, depth: 1, bevel: { size: 0.1, segments: 3 } });
            expect(sharp.source).toEqual({ kind: 'cube', width: 1, height: 1, depth: 1 });
            const merged = mergeGeometries([{ geometry: round, x: -1 }, { geometry: round, x: 1 }]);
            expect(merged.vertexCount).toBe(round.vertexCount * 2);
            expect(useCubeGeometry({ bevel: { size: 0.1 }, uvs: 'box', uvScale: 1 }).vertexCount).toBe(round.vertexCount);
            return createScene();
        });
    });

    it('is written in a scene document as its recipe and made again from it', () => {
        const recipe = { width: 2, height: 0.4, depth: 1, bevel: { size: 0.1, segments: 2 } };
        const { store } = createTestGame();
        const root = startTestScene(store, 'Level', () => {
            useSpawn(function Button() {
                useTransform({});
                createMesh({ geometry: useCubeGeometry(recipe) });
            })();
            return createScene();
        });
        const doc = serializeScene(root);
        expect(doc.assets.find((asset) => asset.type === 'geometry')).toMatchObject({ source: { kind: 'cube', ...recipe } });
        expect(parseSceneDoc(doc, '/scenes/level.scene')).toEqual(doc);

        const again = createTestGame();
        const built = startTestScene(again.store, 'Level', sceneFromDoc(doc));
        const mesh = built.children[0]!.drawables.find((drawable) => drawable.type === 'mesh') as TMesh;
        expect(mesh.geometry!.source).toEqual({ kind: 'cube', ...recipe });
    });

    it('opens a document whose bevel does not fit its box, without that shape', () => {
        const scene = (bevel: unknown) => parseSceneDoc({
            format: 'nacatamalon-scene', version: 1, name: 'Level',
            assets: [{ type: 'geometry', key: 'box', source: { kind: 'cube', bevel } }],
            root: { id: 'root', name: 'Level', transform: null, components: [], children: [] },
        }, '/scenes/level.scene');
        // One that is not a bevel is left out, and the edges stay sharp.
        expect(scene({ size: 'round' }).assets[0]).toEqual({ type: 'geometry', key: 'box', source: { kind: 'cube' } });
        expect(scene(-1).assets[0]).toEqual({ type: 'geometry', key: 'box', source: { kind: 'cube' } });

        const warn = spyOn(console, 'warn').mockImplementation(() => {});
        const { store } = createTestGame();
        expect(() => startTestScene(store, 'Level', sceneFromDoc(scene({ size: 0.8 })))).not.toThrow();
        expect(warn.mock.calls.some(([message]) => String(message).includes("the shape \"box\" is not made: useCubeGeometry: bevel.size is 0.8"))).toBe(true);
        warn.mockRestore();
    });
});
