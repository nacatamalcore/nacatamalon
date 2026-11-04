import { describe, expect, it } from 'bun:test';
import { createScene } from '../src/scene/create_scene';
import { createPolygon } from '../src/gameobjects/polygon';
import { createSprite } from '../src/gameobjects/sprite/create_sprite';
import { createSpriteAtlas } from '../src/atlas';
import { fillFrameContext } from '../src/game/loop/fill_frame_context';
import { destroy, flushDestroyed } from '../src/destroy';
import { serializeScene } from '../src/scene/document/serialize_scene';
import { createTestGame, startTestScene } from './helpers/test_game';
import { TILE_CORNER_FLOATS } from '../src/render/shared/tile_corner';
import type { TFrameContext, TRenderPass } from '../src/render';
import type { TDrawTilemapLayer } from '../src/render/interface';
import type { TRuntimeStore } from '../src/store';
import type { TPolygon } from '../src/gameobjects/polygon';
import type { TTexture } from '../src/loaders';

/**
 * A shape whose corners the game moves: drawn as triangles from its middle (or cut into ears when
 * that would fold), each corner holding its point of the picture, rebuilt every frame, in the
 * scene's order.
 */

const frame = (store: TRuntimeStore): TRenderPass => {
    const ctx: TFrameContext = { passes: [{}], time: 0, progress: 0, phase: 0 };
    fillFrameContext(store, ctx);
    return ctx.passes[0];
};

const SQUARE = [{ x: -10, y: -10 }, { x: 10, y: -10 }, { x: 10, y: 10 }, { x: -10, y: 10 }];

/**
 * The corners a frame drew for the first shape: `[x, y, u, v]` each.
 */
const cornersOf = (store: TRuntimeStore, renderer: ReturnType<typeof createTestGame>['renderer']): number[][] => {
    const pass = frame(store);
    const layer = (pass.drawables ?? []).find((item) => item.type === 'tilemap') as TDrawTilemapLayer | undefined;
    expect(layer).toBeDefined();
    const mesh = layer!.meshes[0];
    const data = renderer.buffers.find((buffer) => buffer.handle === mesh.buffer)!.data;
    const out: number[][] = [];
    for (let i = 0; i < mesh.vertexCount; i++) {
        // Read as the card reads them: a whole corner at a time, its window after its point.
        out.push(Array.from(data.slice(i * TILE_CORNER_FLOATS, i * TILE_CORNER_FLOATS + 4)).map((n) => Math.round(n * 1000) / 1000));
    }
    return out;
};

describe('createPolygon', () => {
    it('refuses an outline of fewer than three corners, and points of the picture that do not match', () => {
        const { store } = createTestGame();
        expect(() => startTestScene(store, 'A', () => {
            createPolygon({ points: [{ x: 0, y: 0 }, { x: 1, y: 0 }] });
            return createScene();
        })).toThrow('three corners');
        expect(() => startTestScene(store, 'B', () => {
            createPolygon({ points: SQUARE, uvs: [{ x: 0, y: 0 }] });
            return createScene();
        })).toThrow('Give one for each');
    });

    it('stretches the picture over the box the outline fits in, and draws a triangle from its middle to each side', () => {
        const { store, renderer } = createTestGame();
        startTestScene(store, 'Level', () => {
            createPolygon({ points: SQUARE });
            return createScene();
        });
        const corners = cornersOf(store, renderer);
        expect(corners.length).toBe(12);
        // The first side: the middle, then its two corners, each with its point of the picture.
        expect(corners.slice(0, 3)).toEqual([[0, 0, 0.5, 0.5], [-10, -10, 0, 0], [10, -10, 1, 0]]);
        expect(corners.slice(9, 12)).toEqual([[0, 0, 0.5, 0.5], [-10, 10, 0, 1], [-10, -10, 0, 0]]);
    });

    it('draws the corners where the game moved them this frame, each keeping its point of the picture', () => {
        const { store, renderer } = createTestGame();
        let blob!: TPolygon;
        startTestScene(store, 'Level', () => {
            blob = createPolygon({ points: SQUARE });
            return createScene();
        });
        cornersOf(store, renderer);
        blob.points[2].x = 30;
        blob.points[2].y = 25;
        const corners = cornersOf(store, renderer);
        // The middle moved with it, and the corner pushed out still holds the bottom-right of the picture.
        expect(corners[0]).toEqual([5, 3.75, 0.5, 0.5]);
        expect(corners[5]).toEqual([30, 25, 1, 1]);
        // Rewritten in the same memory, not made again.
        expect(renderer.buffers.filter((buffer) => buffer.usage === 'vertex' && buffer.alive).length).toBe(1);
    });

    it('works its points of the picture out again when the number of corners changes', () => {
        const { store, renderer } = createTestGame();
        let blob!: TPolygon;
        startTestScene(store, 'Level', () => {
            blob = createPolygon({ points: SQUARE });
            return createScene();
        });
        blob.points.push({ x: -20, y: 0 });
        const corners = cornersOf(store, renderer);
        expect(corners.length).toBe(15);
        expect(blob.uvs.length).toBe(5);
        expect(blob.uvs[4]).toEqual({ x: 0, y: 0.5 });
    });

    it('shows the points of one frame of a sheet', () => {
        const { store, renderer } = createTestGame();
        const sheet: TTexture = { type: 'texture', key: 'sheet', src: '', width: 64, height: 32, status: 'ready', gpu: { resourceType: 'texture' } };
        startTestScene(store, 'Level', () => {
            const atlas = createSpriteAtlas({ texture: sheet, columns: 4, rows: 2 });
            createPolygon({ points: SQUARE, atlas, frame: 5 });
            return createScene();
        });
        const corners = cornersOf(store, renderer);
        // Frame 5 is the second of the bottom row: a quarter across, half down.
        expect(corners[1]).toEqual([-10, -10, 0.25, 0.5]);
        expect(corners[2]).toEqual([10, -10, 0.5, 0.5]);
    });

    it('writes each corner whole, as a map cell has it, with the window of its frame half a texel in', () => {
        const { store, renderer } = createTestGame();
        const sheet: TTexture = { type: 'texture', key: 'sheet', src: '', width: 64, height: 32, status: 'ready', gpu: { resourceType: 'texture' } };
        startTestScene(store, 'Level', () => {
            const atlas = createSpriteAtlas({ texture: sheet, columns: 4, rows: 2 });
            createPolygon({ points: SQUARE, atlas, frame: 5 });
            return createScene();
        });
        const pass = frame(store);
        const layer = (pass.drawables ?? []).find((item) => item.type === 'tilemap') as TDrawTilemapLayer;
        const mesh = layer.meshes[0]!;
        const data = renderer.buffers.find((buffer) => buffer.handle === mesh.buffer)!.data;
        // What the card reads: as many whole corners as it is told there are, none cut short.
        expect(mesh.vertexCount * TILE_CORNER_FLOATS).toBeLessThanOrEqual(data.length);
        expect(mesh.vertexCount).toBe(12);
        for (let i = 0; i < mesh.vertexCount; i++) {
            const at = i * TILE_CORNER_FLOATS;
            expect(Array.from(data.slice(at + 4, at + 8))).toEqual([0.25 + 0.5 / 64, 0.5 + 0.5 / 32, 0.5 - 0.5 / 64, 1 - 0.5 / 32]);
        }
    });

    it('keeps the fan for an outline seen whole from its middle, and cuts one hollowed in past it into ears', () => {
        const { store, renderer } = createTestGame();
        let shape!: TPolygon;
        // A star: hollowed in, but every side seen from its middle. Drawn as before, from there.
        const star = Array.from({ length: 10 }, (_, i) => {
            const r = i % 2 === 0 ? 20 : 8;
            const a = (i / 10) * Math.PI * 2;
            return { x: Math.cos(a) * r, y: Math.sin(a) * r };
        });
        startTestScene(store, 'Level', () => {
            shape = createPolygon({ points: star });
            return createScene();
        });
        expect(cornersOf(store, renderer).length).toBe(30);
        // A C: its middle is outside it, so a fan from there would fold. Eight corners, six ears.
        shape.points = [
            { x: 0, y: 0 }, { x: 30, y: 0 }, { x: 30, y: 8 }, { x: 8, y: 8 },
            { x: 8, y: 22 }, { x: 30, y: 22 }, { x: 30, y: 30 }, { x: 0, y: 30 },
        ];
        const corners = cornersOf(store, renderer);
        expect(corners.length).toBe(18);
        let area = 0;
        for (let i = 0; i < corners.length; i += 3) {
            const [a, b, c] = [corners[i]!, corners[i + 1]!, corners[i + 2]!];
            area += Math.abs((b[0]! - a[0]!) * (c[1]! - a[1]!) - (b[1]! - a[1]!) * (c[0]! - a[0]!)) / 2;
        }
        // Covered once: the C's own area, 30 by 30 less the 22 by 14 bite.
        expect(area).toBeCloseTo(900 - 22 * 14);
    });

    it('is drawn in its place among the sprites, by zIndex, with its tint and its place', () => {
        const { store } = createTestGame();
        startTestScene(store, 'Level', () => {
            createSprite({ width: 4, height: 4, zIndex: 2 });
            createPolygon({ points: SQUARE, zIndex: 1, transform: { x: 50, y: 60 }, tint: { r: 1, g: 0, b: 0, a: 1 } });
            createSprite({ width: 8, height: 8, zIndex: 0 });
            return createScene();
        });
        const items = frame(store).drawables ?? [];
        expect(items.map((item) => item.type)).toEqual(['sprite', 'tilemap', 'sprite']);
        const layer = items[1] as TDrawTilemapLayer;
        expect([layer.transform.x, layer.transform.y]).toEqual([50, 60]);
        expect(layer.tint).toEqual({ r: 1, g: 0, b: 0, a: 1 });
        // No picture: drawn with a plain white one, so its colour is its tint.
        expect(layer.texture?.status).toBe('ready');
    });

    it('lets go of its corners on the card when it is destroyed, and is left out of a saved scene', () => {
        const { store, renderer } = createTestGame();
        let blob!: TPolygon;
        const root = startTestScene(store, 'Level', () => {
            blob = createPolygon({ points: SQUARE });
            return createScene();
        });
        frame(store);
        expect(JSON.stringify(serializeScene(root))).not.toContain('polygon');
        destroy(blob);
        flushDestroyed(store);
        expect(renderer.buffers.filter((buffer) => buffer.usage === 'vertex' && buffer.alive).length).toBe(0);
    });
});
