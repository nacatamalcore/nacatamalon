import { describe, expect, it, spyOn } from 'bun:test';
import { createScene } from '../src/scene/create_scene';
import { createSprite } from '../src/gameobjects/sprite/create_sprite';
import { createShapes } from '../src/gameobjects/shapes';
import { triangulate, triangulateKept } from '../src/gameobjects/shapes/triangulate';
import { readShape, writeShape } from '../src/gameobjects/shapes/shape_doc';
import { strokePath } from '../src/gameobjects/shapes/stroke';
import { ellipsePoints, rectPoints, sidesFor, sweepOf } from '../src/gameobjects/shapes/curves';
import { useSpawn } from '../src/hooks/spawn/use_spawn';
import { useTransform } from '../src/hooks/transform/use_transform';
import { useMask } from '../src/hooks/mask/use_mask';
import { useFilter } from '../src/hooks/filter/use_filter';
import { glow } from '../src/post';
import { fillFrameContext } from '../src/game/loop/fill_frame_context';
import { pickTargets } from '../src/input/pick_targets';
import { destroy, flushDestroyed } from '../src/destroy';
import { parseSceneDoc, sceneFromDoc, serializeScene } from '../src/scene/document';
import { registerScene } from '../src/scene/register_scene';
import { startScene } from '../src/scene/start_scene';
import { TILE_CORNER_FLOATS } from '../src/render/shared/tile_corner';
import { createTestGame, startTestScene } from './helpers/test_game';
import type { TFrameContext, TRenderPass } from '../src/render';
import type { TDrawTilemapLayer } from '../src/render/interface';
import type { TRuntimeStore } from '../src/store';
import type { TShapeCircle, TShapeRect, TShapes } from '../src/gameobjects/shapes';
import type { TSprite } from '../src/gameobjects/sprite/types/t_sprite';

/**
 * Shapes drawn by the card each frame: rectangles, circles, ellipses and their slices, outlines of
 * any corners and wide lines, filled and outlined, as one map layer whose picture is the palette of
 * their colours. What is checked here is what reaches a backend: the triangles, their colours, and
 * the picture.
 */

type TPoint = { x: number; y: number };
type TTriangle = [number, number, number, number, number, number];

const areaOf = (t: TTriangle): number => Math.abs((t[2] - t[0]) * (t[5] - t[1]) - (t[3] - t[1]) * (t[4] - t[0])) / 2;
const outlineArea = (points: readonly TPoint[]): number => {
    let area = 0;
    for (let i = 0; i < points.length; i++) {
        const a = points[i]!;
        const b = points[(i + 1) % points.length]!;
        area += a.x * b.y - b.x * a.y;
    }
    return Math.abs(area) / 2;
};

const frame = (store: TRuntimeStore): TRenderPass => {
    const ctx: TFrameContext = { passes: [{}], time: 0, progress: 0, phase: 0 };
    fillFrameContext(store, ctx);
    return ctx.passes[ctx.passes.length - 1]!;
};

/** What a frame drew for the first set of shapes: its layer and its triangles, with each corner's texel. */
const drawnOf = (store: TRuntimeStore, renderer: ReturnType<typeof createTestGame>['renderer']) => {
    const pass = frame(store);
    const layer = (pass.drawables ?? []).find((item) => item.type === 'tilemap') as TDrawTilemapLayer | undefined;
    expect(layer).toBeDefined();
    const mesh = layer!.meshes[0]!;
    const entry = renderer.buffers.find((buffer) => buffer.handle === mesh.buffer);
    const data = entry?.data ?? new Float32Array(0);
    expect(mesh.vertexCount * TILE_CORNER_FLOATS).toBeLessThanOrEqual(data.length);
    const triangles: Array<{ points: TTriangle; uv: [number, number] }> = [];
    for (let i = 0; i < mesh.vertexCount; i += 3) {
        const at = (k: number) => (i + k) * TILE_CORNER_FLOATS;
        triangles.push({
            points: [data[at(0)]!, data[at(0) + 1]!, data[at(1)]!, data[at(1) + 1]!, data[at(2)]!, data[at(2) + 1]!],
            uv: [data[at(0) + 2]!, data[at(0) + 3]!],
        });
        // A corner reads its colour's texel and nothing else: its window is that one point.
        for (let k = 0; k < 3; k++) {
            expect(data[at(k) + 4]).toBe(data[at(k) + 2]!);
            expect(data[at(k) + 6]).toBe(data[at(k) + 2]!);
            expect(data[at(k) + 5]).toBe(data[at(k) + 3]!);
            expect(data[at(k) + 7]).toBe(data[at(k) + 3]!);
        }
    }
    return { layer: layer!, triangles, area: triangles.reduce((sum, t) => sum + areaOf(t.points), 0), entry };
};

describe('triangulate', () => {
    it('cuts a convex and a hollowed outline either way round, covering each once', () => {
        const square = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }];
        const c = [
            { x: 0, y: 0 }, { x: 30, y: 0 }, { x: 30, y: 8 }, { x: 8, y: 8 },
            { x: 8, y: 22 }, { x: 30, y: 22 }, { x: 30, y: 30 }, { x: 0, y: 30 },
        ];
        for (const outline of [square, [...square].reverse(), c, [...c].reverse()]) {
            const ears = triangulate(outline)!;
            expect(ears.length).toBe((outline.length - 2) * 3);
            let area = 0;
            for (let i = 0; i < ears.length; i += 3) {
                const [a, b, d] = [outline[ears[i]!]!, outline[ears[i + 1]!]!, outline[ears[i + 2]!]!];
                area += areaOf([a.x, a.y, b.x, b.y, d.x, d.y]);
            }
            expect(area).toBeCloseTo(outlineArea(outline));
        }
    });

    it('passes over a corner repeated or on a straight side, and has nothing to cut in a line', () => {
        const outline = [{ x: 0, y: 0 }, { x: 0, y: 0 }, { x: 5, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }, { x: 0, y: 0 }];
        const ears = triangulate(outline)!;
        let area = 0;
        for (let i = 0; i < ears.length; i += 3) {
            const [a, b, d] = [outline[ears[i]!]!, outline[ears[i + 1]!]!, outline[ears[i + 2]!]!];
            const piece = areaOf([a.x, a.y, b.x, b.y, d.x, d.y]);
            // No triangle of nothing, along the straight side.
            expect(piece).toBeGreaterThan(0);
            area += piece;
        }
        expect(area).toBeCloseTo(100);
        expect(triangulate([{ x: 0, y: 0 }, { x: 5, y: 0 }, { x: 10, y: 0 }])).toEqual([]);
        expect(triangulate([{ x: 0, y: 0 }, { x: 1, y: 1 }])).toEqual([]);
    });

    it('keeps its digits far from the origin', () => {
        const far = [{ x: 1e8, y: 1e8 }, { x: 1e8 + 1, y: 1e8 }, { x: 1e8 + 1, y: 1e8 + 1 }, { x: 1e8, y: 1e8 + 1 }];
        expect(triangulate(far)).toHaveLength(6);
    });

    it('cuts an outline again only when a corner moved', () => {
        const c = [
            { x: 0, y: 0 }, { x: 30, y: 0 }, { x: 30, y: 8 }, { x: 8, y: 8 },
            { x: 8, y: 22 }, { x: 30, y: 22 }, { x: 30, y: 30 }, { x: 0, y: 30 },
        ];
        const first = triangulateKept(c);
        expect(triangulateKept(c)).toBe(first);
        c[1]!.x = 31;
        const moved = triangulateKept(c);
        expect(moved).not.toBe(first);
        expect(moved).toEqual(triangulate(c));
        // Handed to every caller, so none can change it under the others.
        expect(Object.isFrozen(moved)).toBe(true);
    });

    it('gives up on an outline that crosses itself, or one with a corner nowhere', () => {
        // A bow tie.
        expect(triangulate([{ x: 0, y: 0 }, { x: 10, y: 10 }, { x: 10, y: 0 }, { x: 0, y: 10 }])).toBeNull();
        expect(triangulate([{ x: 0, y: 0 }, { x: NaN, y: 0 }, { x: 10, y: 10 }])).toBeNull();
    });
});

describe('strokePath', () => {
    const look = (join: 'miter' | 'round' | 'bevel' = 'miter', cap: 'butt' | 'round' | 'square' = 'butt', left = 1, right = 1) =>
        ({ left, right, join, cap, scale: 1 });
    const collect = (points: TPoint[], closed: boolean, l: ReturnType<typeof look>) => {
        const out: TTriangle[] = [];
        strokePath(points, closed, l, (...t) => out.push(t));
        return out;
    };
    const area = (triangles: TTriangle[]) => triangles.reduce((sum, t) => sum + areaOf(t), 0);

    it('draws a straight line as a band, its ends as asked', () => {
        const line = [{ x: 0, y: 0 }, { x: 10, y: 0 }];
        expect(area(collect(line, false, look()))).toBeCloseTo(20);
        // Square ends stick out half a width at each end.
        expect(area(collect(line, false, look('miter', 'square')))).toBeCloseTo(24);
        // Round ends: a half circle at each, whole as many sides as fit.
        expect(area(collect(line, false, look('miter', 'round')))).toBeGreaterThan(20 + Math.PI * 0.9);
    });

    it('meets at a right angle without drawing the inside twice, the outside as the join says', () => {
        const corner = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }];
        // Two bands of 10 × 2 sharing a 2 × 2 corner: 40 less the inside counted once, and its
        // outside square for a miter, half of it for a bevel.
        const miter = area(collect(corner, false, look('miter')));
        const bevel = area(collect(corner, false, look('bevel')));
        const round = area(collect(corner, false, look('round')));
        expect(miter).toBeCloseTo(40);
        expect(bevel).toBeCloseTo(39.5);
        expect(round).toBeGreaterThan(bevel);
        expect(round).toBeLessThan(miter);
    });

    it('cuts a corner sharper than its limit flat', () => {
        // A turn back of 170 degrees: its point would reach far past four widths.
        const sharp = [{ x: 0, y: 0 }, { x: 20, y: 0 }, { x: 0, y: 3 }];
        const triangles = collect(sharp, false, look('miter'));
        const reach = Math.max(...triangles.flatMap((t) => [t[0], t[2], t[4]]));
        expect(reach).toBeLessThan(20 + 4);
    });

    it('closes an outline with a join where it started, and goes all inside or all outside', () => {
        const square = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }];
        // On the outline, one to each side: 12 × 12 less 8 × 8.
        expect(area(collect(square, true, look()))).toBeCloseTo(144 - 64);
        // All to one side, two wide.
        const one = collect(square, true, look('miter', 'butt', 2, 0));
        const other = collect(square, true, look('miter', 'butt', 0, 2));
        const xs = (t: TTriangle[]) => t.flatMap((x) => [x[0], x[2], x[4]]);
        // This square goes round with a positive area, so its inside is on the left.
        expect(Math.min(...xs(one))).toBeCloseTo(0);
        expect(area(one)).toBeCloseTo(100 - 36);
        expect(Math.min(...xs(other))).toBeCloseTo(-2);
        expect(area(other)).toBeCloseTo(196 - 100);
    });

    it('draws a line closed through two points as its side, with no ends sticking out', () => {
        const two = [{ x: 0, y: 0 }, { x: 10, y: 0 }];
        expect(area(collect(two, true, look('miter', 'round')))).toBeCloseTo(20);
    });

    it('takes two corners a hair apart, where a curve meets a straight side, as one', () => {
        // A rectangle as round as it can be: its arcs meet its sides with rounding left over.
        const round = rectPoints(0, 0, 10, 10, 5, 0, 1);
        const snapped = round.map((p) => ({ x: Math.round(p.x * 1e6) / 1e6, y: Math.round(p.y * 1e6) / 1e6 }));
        const inside = (points: TPoint[]) => area(collect(points, true, look('miter', 'butt', 2, 0)));
        // Drawn once there: the same as with the hair taken out, but for the hair.
        expect(inside(round)).toBeCloseTo(inside(snapped), 4);
    });

    it('makes a dot of a line with no length when its ends stick out, and nothing when they do not', () => {
        expect(collect([{ x: 3, y: 3 }, { x: 3, y: 3 }], false, look('miter', 'butt'))).toEqual([]);
        expect(area(collect([{ x: 3, y: 3 }], false, look('miter', 'square')))).toBeCloseTo(4);
    });
});

describe('the curves', () => {
    it('takes as many sides as keep a curve round at its size, or as asked', () => {
        expect(sidesFor(1, Math.PI * 2)).toBe(8);
        expect(sidesFor(10, Math.PI * 2)).toBe(32);
        expect(sidesFor(1000, Math.PI * 2)).toBe(256);
        expect(sidesFor(10, Math.PI)).toBe(16);
        expect(sidesFor(10, Math.PI * 2, 6)).toBe(6);
    });

    it('reads a slice from start to end, and a whole turn as the whole curve', () => {
        expect(sweepOf(undefined, undefined)).toBeNull();
        expect(sweepOf(0, Math.PI)).toEqual({ from: 0, sweep: Math.PI });
        expect(sweepOf(0, Math.PI * 2)).toBeNull();
        expect(sweepOf(1, -1)).toEqual({ from: 1, sweep: -2 });
        expect(ellipsePoints(0, 0, 10, 5, 0, 0, Math.PI, 4, false)).toHaveLength(5);
        expect(ellipsePoints(0, 0, 10, 5, 0, 0, Math.PI * 2, 4, true)).toHaveLength(4);
    });

    it('rounds a rectangle no more than half its shorter side, and turns it about its middle', () => {
        const sharp = rectPoints(0, 0, 20, 10, undefined, 0, 1);
        expect(sharp).toEqual([{ x: 0, y: 0 }, { x: 20, y: 0 }, { x: 20, y: 10 }, { x: 0, y: 10 }]);
        const round = rectPoints(0, 0, 20, 10, 50, 0, 1);
        expect(Math.min(...round.map((p) => p.y))).toBeCloseTo(0);
        expect(Math.max(...round.map((p) => p.x))).toBeCloseTo(20);
        const turned = rectPoints(0, 0, 20, 10, 0, Math.PI / 2, 1);
        expect(turned[0]!.x).toBeCloseTo(15);
        expect(turned[0]!.y).toBeCloseTo(-5);
        // Measured from its other side, the same rectangle.
        expect(rectPoints(20, 10, -20, -10, 0, 0, 1)).toEqual(sharp);
    });
});

describe('createShapes', () => {
    it('is drawn as one map layer of triangles, its palette as its picture, read by the texel', () => {
        const { store, renderer } = createTestGame();
        startTestScene(store, 'Level', () => {
            createShapes({
                transform: { x: 50, y: 60 },
                tint: '#ff0000',
                zIndex: 3,
                shapes: [
                    { type: 'rect', x: 0, y: 0, width: 20, height: 10, fill: '#00ff00' },
                    { type: 'rect', x: 0, y: 20, width: 20, height: 10, fill: '#0000ff' },
                    { type: 'rect', x: 0, y: 40, width: 20, height: 10, fill: '#00ff00' },
                ],
            });
            return createScene();
        });
        const { layer, triangles, area } = drawnOf(store, renderer);
        expect(triangles).toHaveLength(6);
        expect(area).toBeCloseTo(600);
        expect(layer.transform.x).toBe(50);
        expect(layer.tint).toEqual({ r: 1, g: 0, b: 0, a: 1 });
        expect(layer.smooth).toBe(false);
        expect(layer.bounds).toEqual({ x: 0, y: 0, width: 20, height: 50 });
        // Two colours, one texel each, and the third rectangle reads the first's.
        expect(layer.texture).toMatchObject({ status: 'ready', width: 2, height: 1 });
        expect(triangles[0]!.uv).toEqual([0.25, 0.5]);
        expect(triangles[2]!.uv).toEqual([0.75, 0.5]);
        expect(triangles[4]!.uv).toEqual([0.25, 0.5]);
    });

    it('fills, then outlines, in the order of the list, and leaves out what is hidden or has neither', () => {
        const { store, renderer } = createTestGame();
        startTestScene(store, 'Level', () => {
            createShapes({
                shapes: [
                    { type: 'rect', x: 0, y: 0, width: 10, height: 10, fill: '#ffffff', stroke: { width: 2, color: '#000000', align: 'inside' } },
                    { type: 'rect', x: 0, y: 0, width: 10, height: 10, fill: '#ff0000', visible: false },
                    { type: 'rect', x: 0, y: 0, width: 10, height: 10 },
                    { type: 'rect', x: 0, y: 0, width: 10, height: 10, stroke: { width: 0, color: '#ffffff' } },
                ],
            });
            return createScene();
        });
        const { triangles, area, layer } = drawnOf(store, renderer);
        // The fill first, its two triangles in the first colour; then the frame inside it.
        expect(triangles[0]!.uv).toEqual(triangles[1]!.uv);
        expect(triangles[2]!.uv).not.toEqual(triangles[0]!.uv);
        expect(area).toBeCloseTo(100 + (100 - 36));
        expect(layer.bounds).toEqual({ x: 0, y: 0, width: 10, height: 10 });
    });

    it('draws a circle, a pie and an arc, and an ellipse, about their middles', () => {
        const { store, renderer } = createTestGame();
        let shapes!: TShapes;
        startTestScene(store, 'Level', () => {
            shapes = createShapes({ shapes: [{ type: 'circle', x: 0, y: 0, radius: 10, fill: '#ffffff' }] });
            return createScene();
        });
        // Thirty-two sides at this size: a little less than the circle itself.
        let drawn = drawnOf(store, renderer);
        expect(drawn.triangles).toHaveLength(32);
        expect(drawn.area).toBeGreaterThan(Math.PI * 100 * 0.99);
        expect(drawn.area).toBeLessThan(Math.PI * 100);

        shapes.shapes[0] = { type: 'circle', x: 0, y: 0, radius: 10, start: 0, end: Math.PI / 2, fill: '#ffffff' };
        drawn = drawnOf(store, renderer);
        // A quarter, a little less for its straight sides.
        expect(drawn.area / ((Math.PI * 100) / 4)).toBeGreaterThan(0.99);

        shapes.shapes[0] = { type: 'circle', x: 0, y: 0, radius: 10, start: 0, end: Math.PI, stroke: { width: 2, color: '#ffffff' } };
        drawn = drawnOf(store, renderer);
        // Half a ring from 9 to 11, open at its ends, a little less for its straight sides.
        expect(drawn.area / ((Math.PI * (121 - 81)) / 2)).toBeGreaterThan(0.99);
        expect(drawn.area).toBeLessThan((Math.PI * (121 - 81)) / 2);

        shapes.shapes[0] = { type: 'ellipse', x: 0, y: 0, radiusX: 20, radiusY: 5, rotation: Math.PI / 2, fill: '#ffffff' };
        drawn = drawnOf(store, renderer);
        expect(drawn.area).toBeCloseTo(Math.PI * 100, -1);
        // Turned upright: forty tall, as near as its sides reach.
        expect(drawn.layer.bounds!.height).toBeCloseTo(40, 0);
    });

    it('fills a polygon hollowed in, and one that crosses itself from its middle', () => {
        const { store, renderer } = createTestGame();
        let shapes!: TShapes;
        const c = [
            { x: 0, y: 0 }, { x: 30, y: 0 }, { x: 30, y: 8 }, { x: 8, y: 8 },
            { x: 8, y: 22 }, { x: 30, y: 22 }, { x: 30, y: 30 }, { x: 0, y: 30 },
        ];
        startTestScene(store, 'Level', () => {
            shapes = createShapes({ shapes: [{ type: 'polygon', points: c, fill: '#ffffff' }] });
            return createScene();
        });
        expect(drawnOf(store, renderer).area).toBeCloseTo(900 - 22 * 14);
        shapes.shapes[0] = { type: 'polygon', points: [{ x: 0, y: 0 }, { x: 10, y: 10 }, { x: 10, y: 0 }, { x: 0, y: 10 }], fill: '#ffffff' };
        expect(drawnOf(store, renderer).triangles).toHaveLength(4);
    });

    it('draws what the game changed this frame, in the same memory while it fits', () => {
        const { store, renderer } = createTestGame();
        let shapes!: TShapes;
        const bar: TShapeRect = { type: 'rect', x: 0, y: 0, width: 60, height: 6, fill: '#e15554' };
        startTestScene(store, 'Level', () => {
            shapes = createShapes({ shapes: [bar] });
            return createScene();
        });
        expect(drawnOf(store, renderer).area).toBeCloseTo(360);
        // The one kept in a constant is the one drawn.
        bar.width = 30;
        expect(drawnOf(store, renderer).area).toBeCloseTo(180);
        expect(renderer.buffers.filter((buffer) => buffer.usage === 'vertex' && buffer.alive)).toHaveLength(1);
        shapes.shapes.push({ type: 'line', points: [{ x: 0, y: 20 }, { x: 40, y: 20 }], stroke: { width: 2, color: '#ffffff' } });
        expect(drawnOf(store, renderer).area).toBeCloseTo(180 + 80);
    });

    it('sends the palette up only when a colour changes, and makes it again only when it grows', () => {
        const { store, renderer } = createTestGame();
        let circle!: TShapeCircle;
        startTestScene(store, 'Level', () => {
            circle = { type: 'circle', x: 0, y: 0, radius: 4, fill: '#ffffff' };
            createShapes({ shapes: [circle, { type: 'rect', x: 0, y: 0, width: 2, height: 2, fill: '#000000' }] });
            return createScene();
        });
        const first = drawnOf(store, renderer).layer.texture;
        drawnOf(store, renderer);
        expect(renderer.dataUpdates).toHaveLength(0);
        circle.fill = { r: 1, g: 0, b: 0, a: 0.5 };
        expect(drawnOf(store, renderer).layer.texture).toBe(first);
        expect(renderer.dataUpdates).toHaveLength(1);
        circle.stroke = { width: 1, color: '#00ff00' };
        const grown = drawnOf(store, renderer).layer.texture;
        expect(grown).not.toBe(first);
        // Grown to the next power of two, so a fourth colour fits without making it again.
        expect(grown).toMatchObject({ width: 4, height: 1 });
        expect(renderer.destroyedTextures).toContain(first!.gpu!);
    });

    it('lets go of its corners and its palette when it is destroyed', () => {
        const { store, renderer } = createTestGame();
        let shapes!: TShapes;
        startTestScene(store, 'Level', () => {
            shapes = createShapes({ shapes: [{ type: 'rect', x: 0, y: 0, width: 4, height: 4, fill: '#ffffff' }] });
            return createScene();
        });
        const palette = drawnOf(store, renderer).layer.texture!.gpu!;
        destroy(shapes);
        flushDestroyed(store);
        expect(renderer.buffers.filter((buffer) => buffer.usage === 'vertex' && buffer.alive)).toHaveLength(0);
        expect(renderer.destroyedTextures).toContain(palette);
    });

    it('is drawn in its place among the sprites, by zIndex, and not at all when hidden', () => {
        const { store } = createTestGame();
        let shapes!: TShapes;
        startTestScene(store, 'Level', () => {
            createSprite({ width: 4, height: 4, zIndex: 2 });
            shapes = createShapes({ zIndex: 1, shapes: [{ type: 'rect', x: 0, y: 0, width: 4, height: 4, fill: '#ffffff' }] });
            return createScene();
        });
        expect((frame(store).drawables ?? []).map((item) => item.type)).toEqual(['tilemap', 'sprite']);
        shapes.visible = false;
        expect((frame(store).drawables ?? []).map((item) => item.type)).toEqual(['sprite']);
    });

    it('refuses a colour that is none when it is made, and passes over one given later, said once', () => {
        const { store, renderer } = createTestGame();
        expect(() => startTestScene(store, 'Bad', () => {
            createShapes({ shapes: [{ type: 'rect', x: 0, y: 0, width: 4, height: 4, fill: 'gren' }] });
            return createScene();
        })).toThrow(/the fill of shape 0 is not a colour/);
        let shapes!: TShapes;
        startTestScene(store, 'Level', () => {
            shapes = createShapes({
                shapes: [
                    { type: 'rect', x: 0, y: 0, width: 4, height: 4, fill: '#ffffff' },
                    { type: 'rect', x: 10, y: 0, width: 4, height: 4, fill: '#ffffff' },
                ],
            });
            return createScene();
        });
        const warn = spyOn(console, 'warn').mockImplementation(() => {});
        (shapes.shapes[1] as TShapeRect).fill = 'gren';
        shapes.shapes.push({ type: 'rect', x: 20, y: 0, width: 4, height: 4, stroke: { width: 1 } as never });
        // The rest is drawn, the frame goes on, and each is said once, not every frame: the fill
        // that is no colour and the stroke with none.
        expect(drawnOf(store, renderer).area).toBeCloseTo(16);
        drawnOf(store, renderer);
        expect(warn).toHaveBeenCalledTimes(2);
        expect(String(warn.mock.calls[0]![0])).toContain('[NacatamalOn] createShapes: the fill of shape 1 is not a colour');
        expect(String(warn.mock.calls[1]![0])).toContain('the stroke of shape 2 is not a colour');
        // Another typo is said too, once.
        (shapes.shapes[0] as TShapeRect).fill = 'blu';
        drawnOf(store, renderer);
        drawnOf(store, renderer);
        expect(warn).toHaveBeenCalledTimes(3);
        (shapes.shapes[0] as TShapeRect).fill = '#ffffff';
        warn.mockRestore();
        // Written down without the part that is not drawn.
        expect(writeShape(shapes.shapes[1]!)).toEqual({ type: 'rect', x: 10, y: 0, width: 4, height: 4 });
    });

    it('names what is no colour without writing it out, and says no more than a few', () => {
        const { store, renderer } = createTestGame();
        const looped: Record<string, unknown> = {};
        looped.self = looped;
        expect(() => startTestScene(store, 'Bad', () => {
            createShapes({ shapes: [{ type: 'rect', x: 0, y: 0, width: 4, height: 4, fill: looped as never }] });
            return createScene();
        })).toThrow('[NacatamalOn] createShapes: the fill of shape 0 is not a colour (an object without r, g, b and a)');
        let bar!: TShapeRect;
        startTestScene(store, 'Level', () => {
            bar = { type: 'rect', x: 0, y: 0, width: 4, height: 4, fill: '#ffffff' };
            createShapes({ shapes: [bar] });
            return createScene();
        });
        const warn = spyOn(console, 'warn').mockImplementation(() => {});
        try {
            bar.fill = 10n as never;
            expect(() => drawnOf(store, renderer)).not.toThrow();
            bar.fill = looped as never;
            expect(() => drawnOf(store, renderer)).not.toThrow();
            // Worked out wrong every frame, a new one each time: said a few times, then no more.
            for (let f = 0; f < 30; f++) {
                bar.fill = `rgb(${f}, 0, 0`;
                drawnOf(store, renderer);
            }
            expect(warn.mock.calls.length).toBe(8);
            expect(String(warn.mock.calls[7]![0])).toContain('Any more are not said.');
        } finally {
            warn.mockRestore();
        }
    });

    it('passes over a corner the game left out of a list, and keeps the palette as a shape is hidden', () => {
        const { store, renderer } = createTestGame();
        let shapes!: TShapes;
        startTestScene(store, 'Level', () => {
            shapes = createShapes({
                shapes: [
                    { type: 'polygon', points: [{ x: 0, y: 0 }, undefined as never, { x: 10, y: 0 }, { x: 0, y: 10 }], fill: '#ffffff' },
                    { type: 'rect', x: 0, y: 0, width: 2, height: 2, fill: '#ff0000' },
                ],
            });
            return createScene();
        });
        const first = drawnOf(store, renderer);
        expect(first.area).toBeCloseTo(50 + 4);
        shapes.shapes[1]!.visible = false;
        expect(drawnOf(store, renderer).layer.texture).toBe(first.layer.texture);
    });

    it('refuses a list that is not one, outside a scene and in it', () => {
        expect(() => createShapes({})).toThrow(/createShapes/);
        const { store } = createTestGame();
        expect(() => startTestScene(store, 'Level', () => {
            createShapes({ shapes: 'rect' as never });
            return createScene();
        })).toThrow(/is a list/);
    });
});

describe('shapes with the rest', () => {
    it('make the shape of a mask by what they cover, filled or outlined', () => {
        const { store } = createTestGame();
        let under!: TSprite;
        startTestScene(store, 'Level', () => {
            const shape = useSpawn(() => {
                useTransform({ x: 100, y: 100, rotation: 0, scaleX: 1, scaleY: 1 });
                createShapes({
                    shapes: [
                        { type: 'circle', x: 0, y: 0, radius: 10, fill: '#ffffff' },
                        { type: 'line', points: [{ x: 30, y: -20 }, { x: 30, y: 20 }], stroke: { width: 4, color: '#ffffff' } },
                    ],
                });
            })();
            const box = useSpawn(() => { under = createSprite({ width: 200, height: 200, transform: { x: 100, y: 100, rotation: 0, scaleX: 1, scaleY: 1 } }); })();
            useMask({ by: shape }).add(box);
            return createScene();
        });
        expect(pickTargets(store, 100, 100)).toEqual([under]);
        expect(pickTargets(store, 131, 110)).toEqual([under]);
        expect(pickTargets(store, 115, 100)).toEqual([]);
        expect(pickTargets(store, 140, 100)).toEqual([]);
    });

    it('make the shape of a mask only where they are drawn: not along a corner\'s diagonal, nor anywhere for a corner nowhere', () => {
        const { store } = createTestGame();
        let under!: TSprite;
        startTestScene(store, 'Level', () => {
            const shape = useSpawn(() => {
                useTransform({ x: 100, y: 100, rotation: 0, scaleX: 1, scaleY: 1 });
                createShapes({
                    shapes: [
                        { type: 'rect', x: 0, y: 0, width: 10, height: 10, stroke: { width: 2, color: '#ffffff', align: 'inside' } },
                        { type: 'polygon', points: [{ x: 0, y: 0 }, { x: NaN, y: 5 }, { x: 5, y: 5 }], fill: '#ffffff' },
                    ],
                });
            })();
            const box = useSpawn(() => { under = createSprite({ width: 300, height: 300, transform: { x: 150, y: 150, rotation: 0, scaleX: 1, scaleY: 1 } }); })();
            useMask({ by: shape }).add(box);
            return createScene();
        });
        expect(pickTargets(store, 101, 105)).toEqual([under]);
        expect(pickTargets(store, 105, 105)).toEqual([]);
        expect(pickTargets(store, 150, 150)).toEqual([]);
        expect(pickTargets(store, 250, 250)).toEqual([]);
    });

    it('ask a filter for nothing while they draw nothing', () => {
        const { store } = createTestGame();
        let shapes!: TShapes;
        startTestScene(store, 'Level', () => {
            const hud = useSpawn(() => {
                useTransform({ x: 50, y: 50, rotation: 0, scaleX: 1, scaleY: 1 });
                shapes = createShapes();
            })();
            useFilter({ effects: [glow({ radius: 1 })] }).add(hud);
            return createScene();
        });
        const ctx: TFrameContext = { passes: [{}], time: 0, progress: 0, phase: 0 };
        fillFrameContext(store, ctx);
        expect(ctx.passes.some((pass) => pass.filter !== undefined)).toBe(false);
        shapes.shapes.push({ type: 'rect', x: -5, y: -5, width: 10, height: 10, fill: '#ffffff' });
        const next: TFrameContext = { passes: [{}], time: 0, progress: 0, phase: 0 };
        fillFrameContext(store, next);
        expect(next.passes.find((pass) => pass.filter !== undefined)!.filter!.region).toEqual({ x: 42, y: 42, width: 16, height: 16 });
    });

    it('read a colour a document wrote as getColor reads one, and drop a shape whose colour is none', () => {
        expect(readShape({ type: 'rect', x: 0, y: 0, width: 1, height: 1, fill: '#ff0000' })).toEqual({ type: 'rect', x: 0, y: 0, width: 1, height: 1, fill: { r: 1, g: 0, b: 0, a: 1 } });
        expect(readShape({ type: 'line', points: [{ x: 0, y: 0 }, { x: 1, y: 1 }], stroke: { width: 1, color: 'tomato' } })).not.toBeNull();
        expect(readShape({ type: 'rect', x: 0, y: 0, width: 1, height: 1, fill: 'gren' })).toBeNull();
        expect(readShape({ type: 'rect', x: 0, y: 0, width: 1, height: 1, stroke: { width: 1 } })).toBeNull();
        // A stroke with no width is not drawn, so not written: the fill comes back without it.
        const thin = { type: 'rect' as const, x: 0, y: 0, width: 4, height: 4, fill: '#ff0000', stroke: { width: NaN, color: '#ffffff' } };
        expect(readShape(JSON.parse(JSON.stringify(writeShape(thin))))).toEqual({ type: 'rect', x: 0, y: 0, width: 4, height: 4, fill: { r: 1, g: 0, b: 0, a: 1 } });
        // Written as it was drawn: a polygon of two corners, outlined, comes back.
        const two = { type: 'polygon' as const, points: [{ x: 0, y: 0 }, { x: 5, y: 5 }], stroke: { width: 1, color: { r: 1, g: 1, b: 1, a: 1 } } };
        expect(readShape(writeShape(two))).toEqual(two);
    });

    it('give a filter their own part of the screen, not all of it', () => {
        const { store } = createTestGame();
        startTestScene(store, 'Level', () => {
            const ship = useSpawn(() => {
                useTransform({ x: 50, y: 50, rotation: 0, scaleX: 1, scaleY: 1 });
                createShapes({ shapes: [{ type: 'rect', x: -5, y: -5, width: 10, height: 10, fill: '#ffffff' }] });
            })();
            useFilter({ effects: [glow({ radius: 1 })] }).add(ship);
            return createScene();
        });
        const ctx: TFrameContext = { passes: [{}], time: 0, progress: 0, phase: 0 };
        fillFrameContext(store, ctx);
        const content = ctx.passes.find((pass) => pass.filter !== undefined)!;
        // 45 to 55 with a pixel of room, grown to a step of 16 about its middle: as a sprite's.
        expect(content.filter!.region).toEqual({ x: 42, y: 42, width: 16, height: 16 });
    });

    it('are written in a scene document and read back, colours and all, leaving out what cannot be drawn', () => {
        const { store } = createTestGame();
        const root = startTestScene(store, 'Level', () => {
            useSpawn(() => {
                useTransform({ x: 10, y: 20, rotation: 0, scaleX: 1, scaleY: 1 });
                createShapes({
                    tint: '#ffffff80',
                    zIndex: 4,
                    shapes: [
                        { type: 'rect', x: 0, y: 0, width: 10, height: 5, radius: [1, 2, 3, 4], rotation: 0.5, fill: '#ff0000', stroke: { width: 1, color: 'white', align: 'outside', join: 'round' } },
                        { type: 'circle', x: 1, y: 2, radius: 3, start: 0, end: 1, segments: 12, fill: { r: 0, g: 0, b: 1, a: 1 } },
                        { type: 'ellipse', x: 0, y: 0, radiusX: 4, radiusY: 2, rotation: 1, stroke: { width: 2, color: '#00ff00' } },
                        { type: 'polygon', points: [{ x: 0, y: 0 }, { x: 4, y: 0 }, { x: 0, y: 4 }], fill: '#123456', visible: false },
                        { type: 'line', points: [{ x: 0, y: 0 }, { x: 5, y: 5 }], closed: true, stroke: { width: 3, color: '#ffffff', cap: 'round' } },
                    ],
                });
            }, { name: 'Hud' })();
            return createScene();
        });
        const doc = serializeScene(root);
        const component = doc.root.children[0]!.components.find((c) => c.type === 'shapes');
        if (component?.type !== 'shapes') {
            throw new Error('no shapes written');
        }
        expect(component.shapes).toHaveLength(5);
        expect(component.shapes[0]).toEqual({
            type: 'rect', x: 0, y: 0, width: 10, height: 5, radius: [1, 2, 3, 4], rotation: 0.5,
            fill: { r: 1, g: 0, b: 0, a: 1 },
            stroke: { width: 1, color: { r: 1, g: 1, b: 1, a: 1 }, join: 'round', align: 'outside' },
        });
        expect(component.zIndex).toBe(4);
        expect(parseSceneDoc(doc, '/scenes/level.scene')).toEqual(doc);

        // One that cannot be drawn is said and left out; the rest still are.
        const written = JSON.parse(JSON.stringify(doc));
        written.root.children[0].components.find((c: { type: string }) => c.type === 'shapes').shapes.push({ type: 'rect', x: 0, y: 0 }, { type: 'star' });
        const warn = spyOn(console, 'warn').mockImplementation(() => {});
        const parsed = parseSceneDoc(written, '/scenes/level.scene');
        expect(warn).toHaveBeenCalledTimes(2);
        warn.mockRestore();
        expect(parsed).toEqual(doc);

        // And built again into a scene, the game's own copies, written the same.
        const { store: again, renderer } = createTestGame();
        registerScene(again, doc.name, sceneFromDoc(doc));
        const built = startScene(again, doc.name);
        const drawn = drawnOf(again, renderer);
        expect(drawn.layer.tint.a).toBeCloseTo(128 / 255);
        expect(drawn.triangles.length).toBeGreaterThan(0);
        expect(serializeScene(built)).toEqual(doc);
    });
});
