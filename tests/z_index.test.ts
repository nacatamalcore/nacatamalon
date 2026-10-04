import { describe, expect, it } from 'bun:test';
import { createScene } from '../src/scene/create_scene';
import { createSprite } from '../src/gameobjects/sprite/create_sprite';
import { useSpawn } from '../src/hooks/spawn/use_spawn';
import { fillFrameContext } from '../src/game/loop/fill_frame_context';
import { createTestGame, startTestScene } from './helpers/test_game';
import type { TSprite } from '../src/gameobjects/sprite/types/t_sprite';
import type { TFrameContext } from '../src/render';
import type { TRuntimeStore } from '../src/store';

const tint = { r: 1, g: 1, b: 1, a: 1 };
const at = { x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1 };

/**
 * A sprite named by its width, so an order reads as a list of numbers.
 */
const card = (width: number, zIndex?: number): TSprite => createSprite({ width, height: 1, tint, transform: { ...at }, zIndex });

/**
 * What the renderer would be handed this frame, as the widths of the sprites in paint order.
 */
const paintOrder = (store: TRuntimeStore): number[] => {
    const ctx: TFrameContext = { passes: [{}], time: 0, progress: 0, phase: 0 };
    fillFrameContext(store, ctx);
    return (ctx.passes[0].drawables ?? []).map((drawable) => (drawable.type === 'sprite' ? drawable.width ?? -1 : -1));
};

describe('zIndex', () => {
    it('leaves creation order alone when nobody asks for it', () => {
        const { store } = createTestGame();
        startTestScene(store, 'Level', () => {
            card(1); card(2); card(3);
            return createScene();
        });

        expect(paintOrder(store)).toEqual([1, 2, 3]);
    });

    it('paints a higher zIndex later, so on top', () => {
        const { store } = createTestGame();
        startTestScene(store, 'Level', () => {
            card(1, 5); card(2); card(3, 1);
            return createScene();
        });

        expect(paintOrder(store)).toEqual([2, 3, 1]);
    });

    it('puts negatives behind the sprites that say nothing', () => {
        const { store } = createTestGame();
        startTestScene(store, 'Level', () => {
            card(1); card(2, -1); card(3);
            return createScene();
        });

        expect(paintOrder(store)).toEqual([2, 1, 3]);
    });

    it('keeps creation order among equal numbers', () => {
        const { store } = createTestGame();
        startTestScene(store, 'Level', () => {
            card(1, 2); card(2, 0); card(3, 2); card(4, 0); card(5, 2);
            return createScene();
        });

        expect(paintOrder(store)).toEqual([2, 4, 1, 3, 5]);
    });

    it('follows a change made between two frames', () => {
        const { store } = createTestGame();
        const cards: TSprite[] = [];
        startTestScene(store, 'Level', () => {
            cards.push(card(1, 0), card(2, 1), card(3, 2));
            return createScene();
        });

        expect(paintOrder(store)).toEqual([1, 2, 3]);

        cards[0].zIndex = 10;
        expect(paintOrder(store)).toEqual([2, 3, 1]);
    });

    it('can put a spawned object behind the one that spawned it', () => {
        const { store } = createTestGame();
        const Shadow = () => { card(2, -1); };
        startTestScene(store, 'Level', () => {
            card(1);
            useSpawn(Shadow)();
            return createScene();
        });

        expect(paintOrder(store)).toEqual([2, 1]);
    });

    it('never lifts a sprite over a scene started after its own', () => {
        const { store } = createTestGame();
        startTestScene(store, 'Level', () => {
            card(1, 1000);
            return createScene();
        });
        startTestScene(store, 'Hud', () => {
            card(2, 0);
            card(3, -5);
            return createScene();
        });

        expect(paintOrder(store)).toEqual([1, 3, 2]);
    });

    it('does not reorder a scene without zIndex because another scene has one', () => {
        const { store } = createTestGame();
        startTestScene(store, 'Level', () => {
            card(3); card(1); card(2);
            return createScene();
        });
        startTestScene(store, 'Hud', () => {
            card(5, 1); card(4, 0);
            return createScene();
        });

        expect(paintOrder(store)).toEqual([3, 1, 2, 4, 5]);
    });
});
