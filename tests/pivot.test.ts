import { describe, expect, it } from 'bun:test';
import { createScene } from '../src/scene/create_scene';
import { createSprite } from '../src/gameobjects/sprite/create_sprite';
import { createText } from '../src/gameobjects/text/create_text';
import { createNineSlice } from '../src/gameobjects/nine_slice/create_nine_slice';
import { useSpawn } from '../src/hooks/spawn/use_spawn';
import { useTransform } from '../src/hooks/transform/use_transform';
import { fillFrameContext } from '../src/game/loop/fill_frame_context';
import { pickTargets } from '../src/input/pick_targets';
import { overlaps } from '../src/hitbox';
import { pivotPlace } from '../src/render/shared/pivot_place';
import { composeTransform2d } from '../src/render/shared/compose_transform_2d';
import { createTestGame, startTestScene } from './helpers/test_game';
import { createTestFont } from './helpers/test_font';
import { textBlockSize as textBlock } from '../src/gameobjects/text/expand_text';
import type { TFrameContext } from '../src/render';
import type { TDrawSprite } from '../src/render/interface';
import type { TSprite } from '../src/gameobjects/sprite/types/t_sprite';
import type { TText } from '../src/gameobjects/text';
import type { TNineSlice } from '../src/gameobjects/nine_slice';
import type { TTexture } from '../src/loaders';
import type { TRuntimeStore } from '../src/store';
import type { TTransform2d } from '../src/gameobjects/types/t_transform_2d';

/**
 * A pivot: the point a picture turns and grows about, apart from its anchor, the point it is placed
 * by. Unturned and ungrown it sits as its anchor says; turned, it turns about its pivot. The same for
 * a sprite, a text and a panel, where they are drawn, touched and measured.
 */

type TPoint = { x: number; y: number };
const at = (x: number, y: number, rotation = 0, scale = 1): TTransform2d => ({ x, y, rotation, scaleX: scale, scaleY: scale });

/**
 * The corners of a quad as the sprite shader lays them: `(corner + 0.5 − anchor) × size × scale`,
 * turned, added to the placement. What is on the screen, whatever numbers got it there.
 */
const corners = (place: TTransform2d, anchor: TPoint, width: number, height: number): TPoint[] =>
    [[0, 0], [1, 0], [1, 1], [0, 1]].map(([u, v]) => {
        const x = (u! - anchor.x) * width * place.scaleX;
        const y = (v! - anchor.y) * height * place.scaleY;
        const cos = Math.cos(place.rotation);
        const sin = Math.sin(place.rotation);
        return { x: place.x + x * cos - y * sin, y: place.y + x * sin + y * cos };
    });

const close = (a: TPoint[], b: TPoint[]) => a.forEach((p, i) => {
    expect(p.x).toBeCloseTo(b[i]!.x, 6);
    expect(p.y).toBeCloseTo(b[i]!.y, 6);
});

/** Where a picture is drawn, from where it is and what it says, as the renderer reads it. */
const drawnCorners = (world: TTransform2d, local: TTransform2d, anchor: TPoint, pivot: TPoint | undefined, w: number, h: number) =>
    corners(pivotPlace(world, { transform: local, pivot }, anchor, w, h, at(0, 0)), pivot ?? anchor, w, h);

describe('pivotPlace', () => {
    const W = 24;
    const H = 18;
    const wheel = { x: 5 / 24, y: 1 };
    const middle = { x: 0.5, y: 0.5 };

    it('changes nothing with no pivot, or one on the anchor: the same placement', () => {
        const world = at(100, 50, 0.3);
        expect(pivotPlace(world, { transform: world }, wheel, W, H, at(0, 0))).toBe(world);
        expect(pivotPlace(world, { transform: world, pivot: { ...wheel } }, wheel, W, H, at(0, 0))).toBe(world);
    });

    it('unturned and ungrown, sits as its anchor says', () => {
        const place = at(100, 50);
        close(drawnCorners(place, place, wheel, middle, W, H), corners(place, wheel, W, H));
    });

    it('turned, turns about the pivot, which stays where it was', () => {
        // A bike anchored under its back wheel at (100, 50), turned half round about its middle.
        const place = at(100, 50, Math.PI);
        const drawn = drawnCorners(place, place, wheel, middle, W, H);
        // Its middle, unturned, is (100 − 5 + 12, 50 − 9): it is still there.
        const centreX = (drawn[0]!.x + drawn[2]!.x) / 2;
        const centreY = (drawn[0]!.y + drawn[2]!.y) / 2;
        expect(centreX).toBeCloseTo(107, 6);
        expect(centreY).toBeCloseTo(41, 6);
        // The same as a bike anchored at its middle, placed there and turned.
        close(drawn, corners(at(107, 41, Math.PI), middle, W, H));
    });

    it('grows about the pivot too', () => {
        const place = at(100, 50, 0, 2);
        close(drawnCorners(place, place, wheel, middle, W, H), corners(at(107, 41, 0, 2), middle, W, H));
    });

    it('inside a box that moved, turned and grew, moves with it as one', () => {
        const parent = at(200, 100, Math.PI / 2, 3);
        const local = at(10, 4, 0.7, 1.5);
        const world = composeTransform2d(parent, local, at(0, 0));
        // The pivot laid out where the anchor is unturned in the box, then the box's placement on top.
        const moved = composeTransform2d(parent, { ...local, x: local.x + (0.5 - wheel.x) * W, y: local.y + (0.5 - wheel.y) * H }, at(0, 0));
        close(drawnCorners(world, local, wheel, middle, W, H), corners(moved, middle, W, H));
    });
});

const panelTexture = (): TTexture => ({
    type: 'texture', key: 'panel', src: '/panel.png', width: 24, height: 24, status: 'ready', gpu: { resourceType: 'texture' },
} as unknown as TTexture);

const drawn = (store: TRuntimeStore): TDrawSprite[] => {
    const ctx: TFrameContext = { passes: [{}], time: 0, progress: 0, phase: 0 };
    fillFrameContext(store, ctx);
    return (ctx.passes[0].drawables ?? []) as TDrawSprite[];
};

/** What the parts of a text or a panel are drawn at, rounded so two ways of getting there compare. */
const parts = (list: TDrawSprite[]) => list.map((d) => [d.transform.x, d.transform.y, d.transform.rotation].map((n) => Math.round(n * 1e6) / 1e6));

describe('a pivot on what a game makes', () => {
    it('a sprite: drawn, touched and measured where it is turned about its pivot', () => {
        const { store } = createTestGame();
        let bike!: TSprite;
        let probe!: TSprite;
        startTestScene(store, 'Level', () => {
            // 40 × 10, placed by its left end at (100, 100), turned a quarter about its middle: it
            // stands upright through (120, 100), from y 80 to 120.
            bike = createSprite({ width: 40, height: 10, anchor: { x: 0, y: 0.5 }, pivot: { x: 0.5, y: 0.5 }, transform: at(100, 100, Math.PI / 2) });
            probe = createSprite({ width: 2, height: 2, transform: at(120, 85) });
            return createScene();
        });
        drawn(store);
        expect(pickTargets(store, 120, 85)).toContain(bike);
        expect(pickTargets(store, 130, 100)).not.toContain(bike);
        // Turned about its left end, it would have stood at x 100, from y 100 to 140.
        expect(pickTargets(store, 100, 130)).not.toContain(bike);
        expect(overlaps(bike, probe)).toBe(true);

        // Taken away: back to turning about its anchor.
        bike.pivot = undefined;
        drawn(store);
        expect(pickTargets(store, 100, 130)).toContain(bike);
        expect(overlaps(bike, probe)).toBe(false);
    });

    it('a text: anchored at its corner and turned about its middle is the text anchored at its middle', () => {
        const font = createTestFont();
        const once = (pivot: boolean) => {
            const { store } = createTestGame();
            let text!: TText;
            startTestScene(store, 'Level', () => {
                text = pivot
                    ? createText({ text: 'ABC', font, anchor: { x: 0, y: 0 }, pivot: { x: 0.5, y: 0.5 }, transform: at(100, 50, Math.PI) })
                    : createText({ text: 'ABC', font, anchor: { x: 0.5, y: 0.5 }, transform: at(100, 50, Math.PI) });
                return createScene();
            });
            const glyphs = drawn(store);
            return { store, text, glyphs };
        };
        const turned = once(true);
        const middle = once(false);
        // The same block turned the same about its middle: the one placed by its corner is half a
        // block further on, so every letter is moved by the same amount, and by exactly that.
        const a = parts(turned.glyphs);
        const b = parts(middle.glyphs);
        expect(a.length).toBe(3);
        expect(a.length).toBe(b.length);
        const block = textBlock(turned.text);
        a.forEach((p, i) => {
            expect(p[0]! - b[i]![0]!).toBeCloseTo(block.width / 2, 5);
            expect(p[1]! - b[i]![1]!).toBeCloseTo(block.height / 2, 5);
            expect(p[2]).toBeCloseTo(b[i]![2]!, 6);
        });
        // Unturned, the pivot changes nothing.
        turned.text.transform.rotation = 0;
        const flat = parts(drawn(turned.store));
        turned.text.pivot = undefined;
        expect(parts(drawn(turned.store))).toEqual(flat);
    });

    it('a panel: placed by its corner and grown from its middle stays centred where it was', () => {
        const { store } = createTestGame();
        let panel!: TNineSlice;
        startTestScene(store, 'Menu', () => {
            panel = createNineSlice({ texture: panelTexture(), slice: 8, width: 100, height: 40, anchor: { x: 0, y: 0 }, pivot: { x: 0.5, y: 0.5 }, transform: at(10, 20, 0, 2) });
            return createScene();
        });
        const pieces = drawn(store);
        // Twice the size about its middle (60, 40): its top-left corner piece starts at (−40, 0).
        expect(pieces[0]!.transform.x).toBeCloseTo(-40, 6);
        expect(pieces[0]!.transform.y).toBeCloseTo(0, 6);
        expect(pickTargets(store, -30, 5)).toEqual([panel]);
    });

    it('a box turned turns its picture about the picture\'s pivot: the box is the thing, the picture how it looks', () => {
        const { store } = createTestGame();
        let bar!: TSprite;
        let box!: { transform: TTransform2d };
        startTestScene(store, 'Level', () => {
            useSpawn(() => {
                // A box at (200, 200), its picture placed by its left end there, 40 long: unturned
                // it lies from x 200 to 240, its middle at (220, 200).
                box = { transform: useTransform({ x: 200, y: 200 }) as unknown as TTransform2d };
                bar = createSprite({ width: 40, height: 10, anchor: { x: 0, y: 0.5 }, pivot: { x: 0.5, y: 0.5 } });
            })();
            return createScene();
        });
        drawn(store);
        expect(pickTargets(store, 235, 200)).toContain(bar);
        // The box turned a quarter, as a behaviour turns its own box: the picture stands up about its
        // middle, at x 220 from y 180 to 220, not about the box's point.
        box.transform.rotation = Math.PI / 2;
        drawn(store);
        expect(pickTargets(store, 220, 185)).toContain(bar);
        expect(pickTargets(store, 200, 230)).not.toContain(bar);
        expect(overlaps(bar, bar)).toBe(true);
    });

    it('a group above the box carries it as one: turning the group turns the whole about the group', () => {
        const { store } = createTestGame();
        let bar!: TSprite;
        startTestScene(store, 'Level', () => {
            useSpawn(() => {
                // A group at (100, 100) turned a quarter, with the box 100 along it: the box ends up
                // at (100, 200), and the bar, unturned in the box, lies along the group's turn,
                // from (100, 200) down to (100, 240).
                useTransform({ x: 100, y: 100, rotation: Math.PI / 2 });
                useSpawn(() => {
                    useTransform({ x: 100, y: 0 });
                    bar = createSprite({ width: 40, height: 10, anchor: { x: 0, y: 0.5 }, pivot: { x: 0.5, y: 0.5 } });
                })();
            })();
            return createScene();
        });
        drawn(store);
        expect(pickTargets(store, 100, 235)).toContain(bar);
        expect(pickTargets(store, 120, 220)).not.toContain(bar);
    });
});
