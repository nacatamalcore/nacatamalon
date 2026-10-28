import { describe, expect, it } from 'bun:test';
import { createSprite } from '../src/gameobjects/sprite/create_sprite';
import { createScene } from '../src/scene/create_scene';
import { destroy } from '../src/destroy/destroy';
import { flushDestroyed } from '../src/destroy/flush_destroyed';
import { ownerOf } from '../src/box/owner_of';
import { useSpawn } from '../src/hooks/spawn/use_spawn';
import { createTestGame, startTestScene } from './helpers/test_game';
import type { TGameObject } from '../src/hooks/spawn/use_spawn';
import type { TSprite } from '../src/gameobjects/sprite/types/t_sprite';

/**
 * From something drawn back to the object that drew it: what was touched is a sprite, and what a
 * game wants to remove, or to ask something of, is the whole piece.
 */

const tint = { r: 1, g: 1, b: 1, a: 1 };
const square = (x: number): TSprite => createSprite({ width: 8, height: 8, tint, transform: { x, y: 0, rotation: 0, scaleX: 1, scaleY: 1 } });

const Card = () => {
    const face = square(0);
    const shadow = square(2);
    return { face, shadow, flip: () => 'flipped' };
};

const level = () => {
    const { store } = createTestGame();
    let card!: TGameObject<ReturnType<typeof Card>>;
    let loose!: TSprite;
    const root = startTestScene(store, 'Level', () => {
        card = useSpawn(Card)();
        loose = square(40);
        return createScene();
    });
    return { store, root, card, loose };
};

describe('ownerOf', () => {
    it('is the piece a sprite was made by, with what the piece offers', () => {
        const { card } = level();

        expect(ownerOf(card.api.face)).toBe(card);
        expect(ownerOf(card.api.shadow)).toBe(card);
        expect((ownerOf(card.api.face) as typeof card).api.flip()).toBe('flipped');
    });

    it('is the scene for a sprite made in the scene\'s own body', () => {
        const { root, loose } = level();

        expect(ownerOf(loose)).toBe(root);
    });

    it('is null once the sprite is destroyed, before the sweep and after it', () => {
        const { store, loose } = level();

        destroy(loose);
        expect(ownerOf(loose)).toBeNull();
        flushDestroyed(store);
        expect(ownerOf(loose)).toBeNull();
    });

    it('leads destroy to the whole piece, where the sprite alone leaves it running', () => {
        const { store, card } = level();

        // The sprite alone: the piece and its other sprite stay.
        destroy(card.api.shadow);
        flushDestroyed(store);
        expect(card.destroyed).toBe(false);
        expect(card.api.face.destroyed).toBe(false);

        // Through its owner: all of it. Its sprites have no owner from that moment on.
        destroy(ownerOf(card.api.face)!);
        expect(ownerOf(card.api.face)).toBeNull();
        flushDestroyed(store);
        expect(card.destroyed).toBe(true);
        expect(card.drawables).toHaveLength(0);
        // And its sprites say so, like one destroyed on its own.
        expect(card.api.face.destroyed).toBe(true);
        expect(ownerOf(card.api.face)).toBeNull();
    });
});
