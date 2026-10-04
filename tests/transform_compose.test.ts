import { describe, expect, it } from 'bun:test';
import { createScene } from '../src/scene/create_scene';
import { createSprite } from '../src/gameobjects/sprite/create_sprite';
import { createText } from '../src/gameobjects/text/create_text';
import { useSpawn } from '../src/hooks/spawn/use_spawn';
import { useTransform } from '../src/hooks/transform/use_transform';
import { fillFrameContext } from '../src/game/loop/fill_frame_context';
import { createTestGame, startTestScene } from './helpers/test_game';
import { createTestFont } from './helpers/test_font';
import type { TFrameContext } from '../src/render';
import type { TRuntimeStore } from '../src/store';
import type { TSprite } from '../src/gameobjects/sprite/types/t_sprite';

/**
 * A box as a place: what it does to the things inside it.
 *
 * Every check reads what the renderer would be handed, because that is the whole of what composing
 * means. The last two are the ones that keep it honest: a box that is not anywhere must change
 * nothing at all, and must not leave anything behind on the drawables it holds.
 */

const tint = { r: 1, g: 1, b: 1, a: 1 };
const at = (x = 0, y = 0, rotation = 0, scaleX = 1, scaleY = 1) => ({ x, y, rotation, scaleX, scaleY });

const card = (transform = at()): TSprite => createSprite({ width: 1, height: 1, tint, transform });

/**
 * Where the renderer would draw each sprite this frame.
 */
const placed = (store: TRuntimeStore) => {
    const ctx: TFrameContext = { passes: [{}], time: 0, progress: 0, phase: 0 };
    fillFrameContext(store, ctx);
    return (ctx.passes[0].drawables ?? []).filter((item) => item.type === 'sprite').map((item) => {
        const t = item.worldTransform ?? item.transform;
        return { x: Math.round(t.x * 1000) / 1000, y: Math.round(t.y * 1000) / 1000, rotation: t.rotation, scaleX: t.scaleX, scaleY: t.scaleY };
    });
};

describe('a box that is a place', () => {
    it('moves what is inside it', () => {
        const { store } = createTestGame();
        const Turret = () => {
            useTransform({ x: 100, y: 50 });
            card(at(0, 0));
            card(at(0, -12));
        };
        startTestScene(store, 'Level', () => {
            useSpawn(Turret)();
            return createScene();
        });

        expect(placed(store)).toEqual([
            { x: 100, y: 50, rotation: 0, scaleX: 1, scaleY: 1 },
            { x: 100, y: 38, rotation: 0, scaleX: 1, scaleY: 1 },
        ]);
    });

    it('turns what is inside it around itself', () => {
        const { store } = createTestGame();
        const Turret = () => {
            // A quarter turn: what was 10 to the right is now 10 below.
            useTransform({ x: 100, y: 50, rotation: Math.PI / 2 });
            card(at(10, 0));
        };
        startTestScene(store, 'Level', () => {
            useSpawn(Turret)();
            return createScene();
        });

        const [barrel] = placed(store);
        expect(barrel.x).toBeCloseTo(100, 5);
        expect(barrel.y).toBeCloseTo(60, 5);
        expect(barrel.rotation).toBeCloseTo(Math.PI / 2, 5);
    });

    it('scales the distance as well as the thing', () => {
        const { store } = createTestGame();
        const Ship = () => {
            useTransform({ x: 0, y: 0, scaleX: 2, scaleY: 3 });
            card(at(10, 10, 0, 1, 1));
        };
        startTestScene(store, 'Level', () => {
            useSpawn(Ship)();
            return createScene();
        });

        // Twice as far across and three times as far down, and twice and three times as big.
        expect(placed(store)).toEqual([{ x: 20, y: 30, rotation: 0, scaleX: 2, scaleY: 3 }]);
    });

    it('reaches all the way down, through boxes that are not anywhere', () => {
        const { store } = createTestGame();
        const Hand = () => { card(at(5, 0)); };
        const Group = () => { useSpawn(Hand)(); };
        const Arm = () => {
            useTransform({ x: 10, y: 0 });
            // A box with no placement of its own: it groups, it does not move.
            useSpawn(Group)();
        };
        const Body = () => {
            useTransform({ x: 100, y: 0 });
            useSpawn(Arm)();
        };
        startTestScene(store, 'Level', () => {
            useSpawn(Body)();
            return createScene();
        });

        expect(placed(store)).toEqual([{ x: 115, y: 0, rotation: 0, scaleX: 1, scaleY: 1 }]);
    });

    it('follows a change made between two frames', () => {
        const { store } = createTestGame();
        let place!: ReturnType<typeof useTransform>;
        const Turret = () => {
            place = useTransform({ x: 0, y: 0 });
            card(at(4, 0));
        };
        startTestScene(store, 'Level', () => {
            useSpawn(Turret)();
            return createScene();
        });

        expect(placed(store)).toEqual([{ x: 4, y: 0, rotation: 0, scaleX: 1, scaleY: 1 }]);

        place.x = 60;
        expect(placed(store)).toEqual([{ x: 64, y: 0, rotation: 0, scaleX: 1, scaleY: 1 }]);
    });

    it('carries a text and its characters with it', () => {
        const { store } = createTestGame();
        const Panel = () => {
            useTransform({ x: 200, y: 100 });
            createText({ text: 'AB', font: createTestFont(), transform: at(0, 0) });
        };
        startTestScene(store, 'Level', () => {
            useSpawn(Panel)();
            return createScene();
        });

        // Both characters, and the first one starts where the panel is.
        const glyphs = placed(store);
        expect(glyphs).toHaveLength(2);
        expect(glyphs[0]).toEqual({ x: 200, y: 100, rotation: 0, scaleX: 1, scaleY: 1 });
        expect(glyphs[1].x).toBeGreaterThan(200);
    });

    it('gives back the same placement when asked twice', () => {
        const { store } = createTestGame();
        let first!: ReturnType<typeof useTransform>;
        let second!: ReturnType<typeof useTransform>;
        const Thing = () => {
            first = useTransform({ x: 7 });
            second = useTransform({ x: 900 });
        };
        startTestScene(store, 'Level', () => {
            useSpawn(Thing)();
            return createScene();
        });

        expect(second).toBe(first);
        expect(first.x).toBe(7);
    });
});

describe('a box that is not a place', () => {
    it('changes nothing, and writes nothing on what it holds', () => {
        const { store } = createTestGame();
        let plain!: TSprite;
        startTestScene(store, 'Level', () => {
            plain = card(at(12, 34, 0.5, 2, 2));
            return createScene();
        });

        expect(placed(store)).toEqual([{ x: 12, y: 34, rotation: 0.5, scaleX: 2, scaleY: 2 }]);
        // Nothing worked out and nothing kept: the ordinary case pays for nothing.
        expect(plain.worldTransform).toBeUndefined();
    });

    it('stops moving things the moment it stops being one', () => {
        const { store } = createTestGame();
        let box!: ReturnType<ReturnType<typeof useSpawn>>;
        const Thing = () => { card(at(4, 0)); };
        startTestScene(store, 'Level', () => {
            box = useSpawn(Thing)();
            return createScene();
        });

        box.transform = { x: 50, y: 0, z: 0, rotation: 0, rotationX: 0, rotationY: 0, scaleX: 1, scaleY: 1, scaleZ: 1 };
        expect(placed(store)).toEqual([{ x: 54, y: 0, rotation: 0, scaleX: 1, scaleY: 1 }]);

        // Taken away again: what it held goes back to where it says it is, rather than staying
        // where the box had put it.
        box.transform = null;
        expect(placed(store)).toEqual([{ x: 4, y: 0, rotation: 0, scaleX: 1, scaleY: 1 }]);
    });
});
