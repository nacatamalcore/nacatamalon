import { describe, expect, it, spyOn } from 'bun:test';
import { mergeGeometries } from '../src/geometry/merge_geometries';
import { buildLathe } from '../src/geometry/shapes/lathe';
import { createScene } from '../src/scene/create_scene';
import { createMesh } from '../src/gameobjects/mesh/create_mesh';
import { useLatheGeometry } from '../src/hooks/geometry/use_lathe_geometry';
import { useSpawn } from '../src/hooks/spawn/use_spawn';
import { useTransform } from '../src/hooks/transform/use_transform';
import { parseSceneDoc, sceneFromDoc, serializeScene } from '../src/scene/document';
import { corner, seenFromOutside, solidOf } from './helpers/solid';
import { createTestGame, startTestScene } from './helpers/test_game';
import type { TLatheGeometryOptions } from '../src/hooks/geometry/use_lathe_geometry';
import type { TGeometry } from '../src/geometry';
import type { TMesh } from '../src/gameobjects/mesh';

/**
 * A lathe turned part of the way round from where it is asked, and its profile meeting in a hard
 * edge where it turns sharply.
 */

const shapeOf = (game: ReturnType<typeof createTestGame>, g: TGeometry) => {
    const vertices = game.renderer.buffers.find((buffer) => buffer.handle === g.vertexBuffer)!.data as Float32Array;
    const indices = game.renderer.buffers.find((buffer) => buffer.handle === g.indexBuffer)!.data as Uint16Array;
    const corners = Array.from({ length: g.vertexCount }, (_, c) => corner(vertices, c));
    return { geometry: g, vertices, indices, corners };
};

const made = (options: TLatheGeometryOptions) => {
    const game = createTestGame();
    let geometry: TGeometry | null = null;
    startTestScene(game.store, 'Level', () => {
        geometry = useLatheGeometry(options);
        return createScene();
    });
    return shapeOf(game, geometry!);
};

const r6 = (n: number) => Math.round(n * 1e6) / 1e6 + 0;

/** A can: closed at the bottom and the top, its rims turned at right angles. */
const CAN = [{ x: 0, y: 0 }, { x: 0.5, y: 0 }, { x: 0.5, y: 1 }, { x: 0, y: 1 }];
/** A vase, turning gently all the way up. */
const VASE = [{ x: 0.3, y: 0 }, { x: 0.45, y: 0.3 }, { x: 0.5, y: 0.6 }, { x: 0.42, y: 0.9 }, { x: 0.3, y: 1.2 }];

describe('useLatheGeometry turned part of the way, with hard edges', () => {
    it('meets in a hard edge where the profile turns more than creaseAngle, when one is given', () => {
        const can = made({ profile: CAN, segments: 16, creaseAngle: Math.PI / 6 });
        // The rims hard: every corner faces straight up, straight down or straight out.
        for (const p of can.corners) {
            const [nx, ny, nz] = [p[3]!, p[4]!, p[5]!];
            expect(r6(Math.abs(ny)) === 1 || r6(ny) === 0).toBe(true);
            if (r6(ny) === 0) expect(r6(Math.hypot(nx, nz))).toBe(1);
        }
        const { closed, volume } = solidOf(can);
        expect(closed).toBe(true);
        expect(volume).toBeGreaterThan(0);
        expect(seenFromOutside(can)).toBe(true);
        // The same as the points given twice by hand.
        const twice = buildLathe([CAN[0]!, CAN[1]!, CAN[1]!, CAN[2]!, CAN[2]!, CAN[3]!], 16);
        expect(Array.from(can.vertices)).toEqual(Array.from(twice.vertices));

        // Left out, smooth all along, the shape it always was: a profile is mostly a curve drawn in
        // a few points.
        const soft = made({ profile: CAN, segments: 16 });
        expect(Array.from(soft.vertices)).toEqual(Array.from(buildLathe(CAN, 16).vertices));
        expect(soft.corners.some((p) => Math.abs(p[4]!) > 0.01 && Math.abs(p[4]!) < 0.99)).toBe(true);
        expect(soft.geometry.vertexCount).toBe(17 * CAN.length);

        // A profile that turns gently stays smooth with a crease too, and with a crease of 0 every
        // turn is hard.
        expect(Array.from(made({ profile: VASE, segments: 12, creaseAngle: Math.PI / 6 }).vertices)).toEqual(Array.from(buildLathe(VASE, 12).vertices));
        expect(made({ profile: VASE, segments: 12, creaseAngle: 0 }).geometry.vertexCount).toBe(13 * (VASE.length + 3));
        // Half a turn or more creases nothing, and a right angle is not more than a right angle.
        expect(made({ profile: CAN, segments: 16, creaseAngle: Math.PI * 2 }).geometry.vertexCount).toBe(17 * CAN.length);
        expect(made({ profile: CAN, segments: 16, creaseAngle: Math.PI / 2 }).geometry.vertexCount).toBe(17 * CAN.length);
    });

    it('turns part of the way round from startAngle, the way rotationY turns, its ends open', () => {
        const quarter = made({ profile: VASE, segments: 8, arc: Math.PI / 2 });
        // From +x towards -z.
        for (const p of quarter.corners) {
            expect(p[0]!).toBeGreaterThanOrEqual(-1e-6);
            expect(p[2]!).toBeLessThanOrEqual(1e-6);
        }
        expect(quarter.geometry.vertexCount).toBe(9 * VASE.length);
        // A slice may be one face across; all the way round takes three at least.
        expect(made({ profile: VASE, segments: 1, arc: 0.2 }).geometry.vertexCount).toBe(2 * VASE.length);
        // One face for every third of a turn at least, so a wide slice is never a flat card.
        expect(made({ profile: VASE, segments: 1, arc: Math.PI }).geometry.vertexCount).toBe(3 * VASE.length);
        expect(made({ profile: VASE, segments: 1, arc: Math.PI * 2 - 1e-12 }).geometry.vertexCount).toBe(4 * VASE.length);
        expect(seenFromOutside(made({ profile: VASE, segments: 1, arc: Math.PI * 1.5 }))).toBe(true);
        expect(made({ profile: VASE, segments: 1 }).geometry.vertexCount).toBe(4 * VASE.length);
        expect(solidOf(quarter).closed).toBe(false);
        expect(seenFromOutside(quarter)).toBe(true);
        // Its picture across the slice.
        expect(Math.min(...quarter.corners.map((p) => p[6]!))).toBe(0);
        expect(Math.max(...quarter.corners.map((p) => p[6]!))).toBe(1);
        expect(quarter.corners.filter((p) => p[6] === 0).every((p) => r6(p[2]!) === 0 && p[0]! > 0)).toBe(true);

        // A quarter further on: from -z towards -x.
        const next = made({ profile: VASE, segments: 8, startAngle: Math.PI / 2, arc: Math.PI / 2 });
        for (const p of next.corners) {
            expect(p[0]!).toBeLessThanOrEqual(1e-6);
            expect(p[2]!).toBeLessThanOrEqual(1e-6);
        }
        expect(next.corners.filter((p) => p[6] === 0).every((p) => r6(p[0]!) === 0 && p[2]! < 0)).toBe(true);

        // All the way round by default, as it always was.
        expect(Array.from(made({ profile: VASE, segments: 12, arc: Math.PI * 2 }).vertices)).toEqual(Array.from(buildLathe(VASE, 12).vertices));
    });

    it('makes a wheel of pockets in colours as one shape, each slice meeting the next', () => {
        const game = createTestGame();
        let pocket: TGeometry | null = null;
        let wheel: TGeometry | null = null;
        startTestScene(game.store, 'Level', () => {
            pocket = useLatheGeometry({ profile: [{ x: 1.3, y: 0 }, { x: 1, y: 0 }], arc: (Math.PI * 2) / 37, segments: 1 });
            wheel = mergeGeometries(Array.from({ length: 37 }, (_, i) => ({
                geometry: pocket!,
                rotationY: (i * Math.PI * 2) / 37,
                tint: i === 0 ? '#1f8a3b' : i % 2 === 1 ? '#c0282d' : '#1b1b1b',
            })));
            return createScene();
        });
        const merged = shapeOf(game, wheel!);
        expect(merged.geometry.vertexCount).toBe(pocket!.vertexCount * 37);
        // Every slice's end lies where the next one starts, so the wheel goes round with no gap nor
        // overlap: each place on the rims is shared by two slices, but the very first and last.
        const per = pocket!.vertexCount;
        const where = (p: number[]) => `${r6(p[0]!)},${r6(p[2]!)}`;
        const placesOf = (slice: number) => new Set(merged.corners.slice(slice * per, (slice + 1) * per).map(where));
        for (let i = 0; i < 37; i++) {
            const here = placesOf(i);
            const shared = [...placesOf((i + 1) % 37)].filter((place) => here.has(place));
            expect(shared.length).toBe(2);
        }
        expect(seenFromOutside(merged)).toBe(true);
    });

    it('says what is wrong with what it is asked for', () => {
        const ask = (options: Partial<TLatheGeometryOptions>) => () => made({ profile: VASE, ...options });
        expect(ask({ arc: 0 })).toThrow('arc is 0, and it takes how far round it is turned');
        expect(ask({ arc: 7 })).toThrow('arc is 7');
        expect(ask({ startAngle: Number.NaN })).toThrow('startAngle is NaN');
        expect(ask({ creaseAngle: -1 })).toThrow('creaseAngle is -1');
    });

    it('is its own shape for each turn, and keeps only what it is asked in its recipe', () => {
        const { store } = createTestGame();
        startTestScene(store, 'Level', () => {
            const whole = useLatheGeometry({ profile: VASE });
            expect(whole.source).toEqual({ kind: 'lathe', profile: VASE, segments: 32 });
            const half = useLatheGeometry({ profile: VASE, arc: Math.PI });
            expect(half).not.toBe(whole);
            expect(useLatheGeometry({ profile: VASE, arc: Math.PI })).toBe(half);
            expect(useLatheGeometry({ profile: VASE, arc: Math.PI, startAngle: 1 })).not.toBe(half);
            expect(useLatheGeometry({ profile: VASE, creaseAngle: 0 })).not.toBe(whole);
            expect(useLatheGeometry({ profile: VASE, segments: 32 })).toBe(whole);
            expect(useLatheGeometry({ profile: VASE, arc: Math.PI, startAngle: 1, creaseAngle: 0.2 }).source)
                .toEqual({ kind: 'lathe', profile: VASE, segments: 32, startAngle: 1, arc: Math.PI, creaseAngle: 0.2 });
            return createScene();
        });
    });

    it('is written in a scene document as its recipe and made again from it', () => {
        const recipe = { profile: VASE, segments: 6, startAngle: 0.5, arc: 2, creaseAngle: 0.1 };
        const { store } = createTestGame();
        const root = startTestScene(store, 'Level', () => {
            useSpawn(function Arch() {
                useTransform({});
                createMesh({ geometry: useLatheGeometry(recipe) });
            })();
            return createScene();
        });
        const doc = serializeScene(root);
        expect(doc.assets.find((asset) => asset.type === 'geometry')).toMatchObject({ source: { kind: 'lathe', ...recipe } });
        expect(parseSceneDoc(doc, '/scenes/level.scene')).toEqual(doc);

        const again = createTestGame();
        const built = startTestScene(again.store, 'Level', sceneFromDoc(doc));
        const mesh = built.children[0]!.drawables.find((drawable) => drawable.type === 'mesh') as TMesh;
        expect(mesh.geometry!.source).toEqual({ kind: 'lathe', ...recipe });

        // An arc a lathe cannot turn: the scene opens, without that shape, and says why.
        const bad = parseSceneDoc({
            format: 'nacatamalon-scene', version: 1, name: 'Level',
            assets: [{ type: 'geometry', key: 'arch', source: { kind: 'lathe', profile: VASE, arc: 9 } }],
            root: { id: 'root', name: 'Level', transform: null, components: [], children: [] },
        }, '/scenes/level.scene');
        const warn = spyOn(console, 'warn').mockImplementation(() => {});
        expect(() => startTestScene(createTestGame().store, 'Level', sceneFromDoc(bad))).not.toThrow();
        expect(warn.mock.calls.some(([message]) => String(message).includes('the shape "arch" is not made: useLatheGeometry: arc is 9'))).toBe(true);
        warn.mockRestore();
    });
});
