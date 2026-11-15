import { describe, expect, it } from 'bun:test';
import { createScene } from '../src/scene/create_scene';
import {
    useCircleGeometry, useConeGeometry, useCubeGeometry, useCylinderGeometry, useIcoSphereGeometry,
    useLatheGeometry, usePlaneGeometry, useSphereGeometry, useTorusGeometry,
} from '../src/hooks/geometry';
import { useSpawn } from '../src/hooks/spawn/use_spawn';
import { useTransform } from '../src/hooks/transform/use_transform';
import { createMesh } from '../src/gameobjects/mesh/create_mesh';
import { createGeometry, DETAIL_STRIDE, GEOMETRY_STRIDE } from '../src/geometry';
import { parseSceneDoc, sceneFromDoc, serializeScene } from '../src/scene/document';
import { createTestGame, startTestScene } from './helpers/test_game';
import type { TFakeRenderer } from './helpers/test_game';
import type { TGeometry } from '../src/geometry';
import type { TMesh } from '../src/gameobjects/mesh/types/t_mesh';

/** Builds shapes inside a scene and hands back what the renderer was given. */
const built = (body: () => TGeometry[]) => {
    const { store, renderer } = createTestGame();
    let made: TGeometry[] = [];
    startTestScene(store, 'Level', () => {
        made = body();
        return createScene();
    });
    return { store, renderer, made };
};

/** Each corner as the card has it: place, facing and picture place. */
const cornersOf = (renderer: TFakeRenderer, geometry: TGeometry) => {
    const data = renderer.buffers.find((b) => b.handle === geometry.vertexBuffer)!.data as Float32Array;
    const out: Array<{ p: number[]; n: number[]; uv: number[] }> = [];
    for (let i = 0; i < geometry.vertexCount * GEOMETRY_STRIDE; i += GEOMETRY_STRIDE) {
        out.push({ p: [data[i], data[i + 1], data[i + 2]], n: [data[i + 3], data[i + 4], data[i + 5]], uv: [data[i + 6], data[i + 7]] });
    }
    return out;
};

const indicesOf = (renderer: TFakeRenderer, geometry: TGeometry): ArrayLike<number> =>
    renderer.buffers.find((b) => b.handle === geometry.indexBuffer)!.data as ArrayLike<number>;

const near = (a: number, b: number): boolean => Math.abs(a - b) < 1e-5;

describe('a shape hook\'s picture places worked out by name', () => {
    it('lays the picture by the shape\'s own units with uvScale: a wall twice as long has twice the bricks', () => {
        const { renderer, made } = built(() => [
            useCubeGeometry({ width: 4, height: 2, depth: 1, uvs: 'box', uvScale: 1 }),
            useCubeGeometry({ width: 8, height: 2, depth: 1, uvs: 'box', uvScale: 1 }),
        ]);
        const front = (g: TGeometry) => cornersOf(renderer, g).filter((c) => near(c.n[2], 1));
        const span = (g: TGeometry) => Math.max(...front(g).map((c) => c.uv[0])) - Math.min(...front(g).map((c) => c.uv[0]));
        expect(span(made[0])).toBeCloseTo(4, 5);
        expect(span(made[1])).toBeCloseTo(8, 5);
    });

    it('keeps each corner\'s facing, so a hard edge stays hard and a round side round', () => {
        const { renderer, made } = built(() => [
            useCubeGeometry({ uvs: 'box', uvScale: 2 }),
            useCylinderGeometry({ uvs: 'cylinder', uvScale: 1 }),
        ]);
        const [cube, cylinder] = made;
        const facings = new Set(cornersOf(renderer, cube).map((c) => c.n.map(Math.round).join(',')));
        expect(facings.size).toBe(6);
        // The side of the tube faces away from its axis at every corner, not up or down.
        for (const corner of cornersOf(renderer, cylinder).filter((c) => Math.abs(c.n[1]) < 0.01)) {
            expect(corner.n[0] * corner.p[0] + corner.n[2] * corner.p[2]).toBeGreaterThan(0);
        }
    });

    it('splits the corners two faces want at two places, and keeps every triangle facing out', () => {
        const { renderer, made } = built(() => [useSphereGeometry({ uvs: 'box' }), useTorusGeometry({ uvs: 'sphere', uvScale: 1 })]);
        for (const geometry of made) {
            const corners = cornersOf(renderer, geometry);
            const indices = indicesOf(renderer, geometry);
            for (let t = 0; t < indices.length; t += 3) {
                const [a, b, c] = [corners[indices[t]], corners[indices[t + 1]], corners[indices[t + 2]]];
                const e1 = [b.p[0] - a.p[0], b.p[1] - a.p[1], b.p[2] - a.p[2]];
                const e2 = [c.p[0] - a.p[0], c.p[1] - a.p[1], c.p[2] - a.p[2]];
                const cross = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]];
                const facing = a.n[0] + b.n[0] + c.n[0], fy = a.n[1] + b.n[1] + c.n[1], fz = a.n[2] + b.n[2] + c.n[2];
                if (Math.hypot(...cross) > 1e-9) {
                    expect(cross[0] * facing + cross[1] * fy + cross[2] * fz).toBeGreaterThan(0);
                }
            }
        }
    });

    it('splits a corner where the picture folds, so a normal map reads the right way on both sides', () => {
        const { renderer, made } = built(() => [useSphereGeometry({ uvs: 'planar' }), useTorusGeometry({ uvs: 'cylinder' }), useCubeGeometry({ uvs: 'planar' })]);
        for (const geometry of made) {
            const corners = cornersOf(renderer, geometry);
            const indices = indicesOf(renderer, geometry);
            const detail = renderer.buffers.find((b) => b.handle === geometry.detailBuffer)!.data as Float32Array;
            const hands = new Map<number, Set<number>>();
            for (let t = 0; t < indices.length; t += 3) {
                const [a, b, c] = [indices[t], indices[t + 1], indices[t + 2]];
                const area = (corners[b].uv[0] - corners[a].uv[0]) * (corners[c].uv[1] - corners[a].uv[1])
                    - (corners[c].uv[0] - corners[a].uv[0]) * (corners[b].uv[1] - corners[a].uv[1]);
                if (Math.abs(area) < 1e-9) continue;
                for (const corner of [a, b, c]) {
                    const set = hands.get(corner) ?? new Set<number>();
                    set.add(Math.sign(area));
                    hands.set(corner, set);
                }
                // The way across the surface turns the same way at its three corners.
                const w = [a, b, c].map((corner) => Math.sign(detail[corner * DETAIL_STRIDE + 3]));
                expect(new Set(w).size).toBe(1);
            }
            for (const set of hands.values()) {
                expect(set.size).toBe(1);
            }
        }
    });

    it('is a shape of its own: not mixed up with the same one wearing its own picture places', () => {
        const { made } = built(() => [
            useCubeGeometry(), useCubeGeometry({ uvs: 'box' }), useCubeGeometry({ uvs: 'box', uvScale: 2 }), useCubeGeometry({ uvs: 'box', uvScale: 2 }),
        ]);
        expect(new Set(made).size).toBe(3);
        expect(made[2]).toBe(made[3]);
        expect(made[0].source).toEqual({ kind: 'cube', width: 1, height: 1, depth: 1 });
        expect(made[2].source).toEqual({ kind: 'cube', width: 1, height: 1, depth: 1, uvs: 'box', uvScale: 2 });
    });

    it('takes uvs and uvScale on every shape hook', () => {
        const { made } = built(() => [
            usePlaneGeometry({ uvs: 'planar', uvScale: 0.5 }),
            useCircleGeometry({ uvs: 'planar' }),
            useSphereGeometry({ uvs: 'sphere', uvScale: 1 }),
            useIcoSphereGeometry({ uvs: 'sphere' }),
            useCylinderGeometry({ uvs: 'cylinder' }),
            useConeGeometry({ uvs: 'cylinder', uvScale: 1 }),
            useTorusGeometry({ uvs: 'box' }),
            useLatheGeometry({ profile: [{ x: 1, y: 0 }, { x: 1, y: 2 }], uvs: 'cylinder', uvScale: 1 }),
        ]);
        for (const geometry of made) {
            expect(geometry.source).toMatchObject({ uvs: expect.any(String) });
            expect(geometry.indexCount).toBeGreaterThan(0);
        }
    });

    it('says what is wrong, also when the shape was already built', () => {
        const ask = (body: () => void) => () => {
            const { store } = createTestGame();
            startTestScene(store, 'Level', () => { body(); return createScene(); });
        };
        expect(ask(() => useCubeGeometry({ uvScale: 2 }))).toThrow(/'uvScale' lays a picture worked out by name/);
        expect(ask(() => useCubeGeometry({ uvs: 'radial' as never }))).toThrow(/'uvs' is 'radial'/);
        expect(ask(() => useCubeGeometry({ uvs: 'box', uvScale: 0 }))).toThrow(/'uvScale' is 0/);
        expect(ask(() => { useCubeGeometry({ uvs: 'box', key: 'wall' }); useCubeGeometry({ uvs: 'box', uvScale: -1, key: 'wall' }); })).toThrow(/'uvScale' is -1/);
        expect(ask(() => createGeometry({ positions: [0, 0, 0, 1, 0, 0, 0, 1, 0], uvScale: 1 }))).toThrow(/'uvScale' lays a picture worked out by name/);
    });

    it('is written in a scene document and made again from it; one this version does not know is left out', () => {
        const { store } = createTestGame();
        const root = startTestScene(store, 'Level', () => {
            useSpawn(function Wall() {
                useTransform({});
                createMesh({ geometry: useCubeGeometry({ width: 6, uvs: 'box', uvScale: 0.5 }) });
            })();
            return createScene();
        });
        const doc = serializeScene(root);
        expect(doc.assets.find((asset) => asset.type === 'geometry')).toMatchObject({ source: { kind: 'cube', width: 6, uvs: 'box', uvScale: 0.5 } });
        expect(parseSceneDoc(doc, '/scenes/level.scene')).toEqual(doc);

        const again = createTestGame();
        const rebuilt = startTestScene(again.store, 'Level', sceneFromDoc(doc));
        const mesh = rebuilt.children[0]!.drawables.find((drawable) => drawable.type === 'mesh') as TMesh;
        expect(mesh.geometry!.source).toMatchObject({ uvs: 'box', uvScale: 0.5 });

        const odd = parseSceneDoc({
            format: 'nacatamalon-scene', version: 1, name: 'Level',
            assets: [
                { type: 'geometry', key: 'a', source: { kind: 'cube', uvs: 'spiral', uvScale: 2 } },
                { type: 'geometry', key: 'b', source: { kind: 'plane', uvs: 'planar', uvScale: -3 } },
            ],
            root: { id: 'root', name: 'Level', transform: null, components: [], children: [] },
        }, '/scenes/level.scene');
        expect(odd.assets.map((asset) => asset.type === 'geometry' ? asset.source : null)).toEqual([{ kind: 'cube' }, { kind: 'plane', uvs: 'planar' }]);
    });
});

describe('a shape hook\'s own picture places', () => {
    it('read each face of a box upright as it is seen from outside, the same as uvs: \'box\'', () => {
        const { renderer, made } = built(() => [useCubeGeometry({ width: 2, height: 4, depth: 6 }), useCubeGeometry({ width: 2, height: 4, depth: 6, uvs: 'box' })]);
        const key = (c: { p: number[]; n: number[] }) => [...c.p, ...c.n].map((x) => Math.round(x * 1000)).join(',');
        const own = new Map(cornersOf(renderer, made[0]).map((c) => [key(c), c.uv]));
        const boxed = cornersOf(renderer, made[1]);
        expect(boxed).toHaveLength(24);
        for (const corner of boxed) {
            expect(own.get(key(corner))).toEqual([expect.closeTo(corner.uv[0], 5), expect.closeTo(corner.uv[1], 5)]);
        }
    });

    it('lay a picture flat over a disc, as over a floor; a base reads it the right way round from below', () => {
        const { renderer, made } = built(() => [useCircleGeometry({ radius: 2, segments: 8 }), useCylinderGeometry({ radius: 2, segments: 8 })]);
        for (const corner of cornersOf(renderer, made[0])) {
            expect(corner.uv[0]).toBeCloseTo((corner.p[0] / 2 + 1) / 2, 5);
            expect(corner.uv[1]).toBeCloseTo((corner.p[2] / 2 + 1) / 2, 5);
        }
        const base = cornersOf(renderer, made[1]).filter((c) => near(c.n[1], -1));
        expect(base.length).toBeGreaterThan(0);
        for (const corner of base) {
            expect(corner.uv[0]).toBeCloseTo((corner.p[0] / 2 + 1) / 2, 5);
            expect(corner.uv[1]).toBeCloseTo((1 - corner.p[2] / 2) / 2, 5);
        }
    });

    it('go round both balls the same way: from +x, to the right as seen from outside, down from the top', () => {
        const { renderer, made } = built(() => [useSphereGeometry({ segments: 8, rings: 4 }), useIcoSphereGeometry({ subdivisions: 2 })]);
        for (const geometry of made) {
            for (const corner of cornersOf(renderer, geometry)) {
                const [x, y, z] = corner.p;
                // Past 1 across the seam, which reads on round: the same place of the picture.
                const u = corner.uv[0] % 1;
                if (Math.hypot(x, z) < 0.05 || near(u, 0) || near(u, 1)) {
                    continue;
                }
                const turn = Math.atan2(-z, x) / (Math.PI * 2);
                expect(u).toBeCloseTo(turn < 0 ? turn + 1 : turn, 1);
                expect(corner.uv[1]).toBeCloseTo(0.5 - Math.asin(y / 0.5) / Math.PI, 1);
            }
        }
    });

    it('go round the evenly divided ball with no triangle across the seam and no picture pinched at a pole', () => {
        const { renderer, made } = built(() => [useIcoSphereGeometry({ subdivisions: 2 })]);
        const corners = cornersOf(renderer, made[0]);
        const indices = indicesOf(renderer, made[0]);
        for (let t = 0; t < indices.length; t += 3) {
            const us = [corners[indices[t]].uv[0], corners[indices[t + 1]].uv[0], corners[indices[t + 2]].uv[0]];
            expect(Math.max(...us) - Math.min(...us)).toBeLessThan(0.5);
        }
        // A pole is shared by five triangles, each reading it where its other two corners are.
        const poles = corners.filter((c) => Math.hypot(c.p[0], c.p[2]) < 1e-6);
        expect(new Set(poles.map((c) => c.uv[0].toFixed(3))).size).toBeGreaterThan(1);
    });
});

describe('a shape of many corners', () => {
    it('numbers them the wide way past what a narrow run can hold, so none is dropped', () => {
        const { renderer, made } = built(() => [usePlaneGeometry({ widthSegments: 255, depthSegments: 255 }), usePlaneGeometry({ widthSegments: 10, depthSegments: 10 })]);
        expect(made[0].vertexCount).toBe(65536);
        expect(made[0].indexType).toBe('uint32');
        expect(indicesOf(renderer, made[0])).toBeInstanceOf(Uint32Array);
        expect(made[1].indexType).toBe('uint16');
    });

    it('turns a lathe of more corners than a narrow run holds, numbered the wide way', () => {
        const { made } = built(() => [useLatheGeometry({ profile: [{ x: 1, y: 0 }, { x: 1, y: 1 }, { x: 0.5, y: 2 }], segments: 30000 })]);
        expect(made[0].vertexCount).toBe(30001 * 3);
        expect(made[0].indexType).toBe('uint32');
    });

    it('refuses corner-by-corner picture places on a shape hook, which has no corners to give them for', () => {
        const ask = (body: () => void) => () => {
            const { store } = createTestGame();
            startTestScene(store, 'Level', () => { body(); return createScene(); });
        };
        expect(ask(() => useCubeGeometry({ uvs: [0, 0, 1, 1] as never }))).toThrow(/a shape hook takes the name/);
        expect(ask(() => useCubeGeometry({ uvs: null as never }))).toThrow(/a shape hook takes the name/);
    });
});
