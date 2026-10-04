import { describe, expect, it } from 'bun:test';
import { createSprite } from '../src/gameobjects/sprite/create_sprite';
import { createScene } from '../src/scene/create_scene';
import { destroy } from '../src/destroy/destroy';
import { flushDestroyed } from '../src/destroy/flush_destroyed';
import { ownerOfDrawable } from '../src/box/drawable_owner';
import { stopScene } from '../src/scene/stop_scene';
import { withSceneUpdates } from '../src/store/scene_updates';
import { createTestGame, startTestScene } from './helpers/test_game';
import type { TSprite } from '../src/gameobjects/sprite/types/t_sprite';
import type { TTexture } from '../src/loaders';

const tint = { r: 1, g: 1, b: 1, a: 1 };
const at = (x: number) => ({ x, y: 0, rotation: 0, scaleX: 1, scaleY: 1 });
const square = (x: number): TSprite => createSprite({ width: 8, height: 8, tint, transform: at(x) });

/**
 * One scene holding `count` sprites, which is the shape almost every check below starts from.
 */
const gameWithSprites = (count: number) => {
    const { store } = createTestGame();
    const sprites: TSprite[] = [];
    const root = startTestScene(store, 'Level', () => {
        for (let i = 0; i < count; i++) sprites.push(square(i));
        return createScene();
    });
    return { store, root, sprites };
};

describe('destroy', () => {
    it('queues instead of removing, and says so on the record', () => {
        const { store, root, sprites } = gameWithSprites(1);

        destroy(sprites[0]);

        expect(root.drawables).toHaveLength(1);
        expect(sprites[0].destroyed).toBe(true);
        expect(store.get('world').pendingDestroy).toHaveLength(1);
    });

    it('removes it on the next sweep and forgets where it lived', () => {
        const { store, root, sprites } = gameWithSprites(1);

        destroy(sprites[0]);
        flushDestroyed(store);

        expect(root.drawables).toHaveLength(0);
        expect(store.get('world').pendingDestroy).toHaveLength(0);
        expect(ownerOfDrawable(sprites[0])).toBeUndefined();
    });

    it('does nothing the second time, before or after the sweep', () => {
        const { store, sprites } = gameWithSprites(1);

        destroy(sprites[0]);
        destroy(sprites[0]);
        expect(store.get('world').pendingDestroy).toHaveLength(1);

        flushDestroyed(store);
        destroy(sprites[0]);
        expect(store.get('world').pendingDestroy).toHaveLength(0);
    });

    it('leaves the survivors in the order they are drawn', () => {
        const { store, root, sprites } = gameWithSprites(3);

        destroy(sprites[1]);
        flushDestroyed(store);

        expect(root.drawables.map((drawable) => (drawable as TSprite).transform.x)).toEqual([0, 2]);
    });

    it('never frees the image, which other sprites may still be drawing', () => {
        const { store } = createTestGame();
        const texture = {
            key: 'hero', src: '/hero.png', status: 'ready', width: 4, height: 4,
            gpu: { resourceType: 'texture' },
        } as unknown as TTexture;
        store.get('assets').textures.set('hero', texture);

        let first!: TSprite;
        const root = startTestScene(store, 'Level', () => {
            first = createSprite({ key: 'hero', tint, transform: at(0) });
            createSprite({ key: 'hero', tint, transform: at(1) });
            return createScene();
        });

        destroy(first);
        flushDestroyed(store);

        expect(store.get('assets').textures.get('hero')).toBe(texture);
        expect(root.drawables).toHaveLength(1);
        expect((root.drawables[0] as TSprite).texture).toBe(texture);
    });

    it('says nothing about something that was never in a scene', () => {
        const stray = { id: 'x', type: 'sprite', transform: at(0), texture: null, tint, destroyed: false } as TSprite;

        expect(() => destroy(stray)).not.toThrow();
        expect(stray.destroyed).toBe(false);
    });
});

describe('destroy({ immediate: true })', () => {
    it('removes it on the spot when nothing is reading the scene', () => {
        const { store, root, sprites } = gameWithSprites(1);

        destroy(sprites[0], { immediate: true });

        expect(root.drawables).toHaveLength(0);
        expect(store.get('world').pendingDestroy).toHaveLength(0);
    });

    it('is a request, not an order: asked for mid-update it waits for the sweep', () => {
        const { store, root, sprites } = gameWithSprites(1);

        withSceneUpdates(store, () => {
            destroy(sprites[0], { immediate: true });
            expect(root.drawables).toHaveLength(1);
        });

        expect(store.get('world').pendingDestroy).toHaveLength(1);
        flushDestroyed(store);
        expect(root.drawables).toHaveLength(0);
    });

    it('goes back to removing on the spot once the updates are over', () => {
        const { store, root, sprites } = gameWithSprites(2);

        withSceneUpdates(store, () => {});
        destroy(sprites[0], { immediate: true });

        expect(root.drawables).toHaveLength(1);
    });

    it('releases the mark even when an update throws', () => {
        const { store, root, sprites } = gameWithSprites(1);

        expect(() => withSceneUpdates(store, () => { throw new Error('an update blew up'); })).toThrow();

        destroy(sprites[0], { immediate: true });
        expect(root.drawables).toHaveLength(0);
    });
});

describe('the sweep', () => {
    it('hands a destroy made during the sweep to the next one', () => {
        const { store, root, sprites } = gameWithSprites(2);

        destroy(sprites[0]);

        // Stands in for a disposal that destroys something else, which is what the drained-first
        // queue is there to survive.
        const queue = store.get('world').pendingDestroy;
        const originalSplice = queue.splice.bind(queue);
        let queuedDuringSweep = -1;
        (queue as { splice: unknown }).splice = (...args: [number, number]) => {
            const taken = originalSplice(...args);
            destroy(sprites[1]);
            queuedDuringSweep = queue.length;
            return taken;
        };

        flushDestroyed(store);
        (queue as { splice: unknown }).splice = originalSplice;

        expect(queuedDuringSweep).toBe(1);
        expect(root.drawables).toHaveLength(1);

        flushDestroyed(store);
        expect(root.drawables).toHaveLength(0);
    });

    it('survives a scene that stopped with things still queued', () => {
        const { store, sprites } = gameWithSprites(1);

        destroy(sprites[0]);
        stopScene(store, 'Level');

        expect(() => flushDestroyed(store)).not.toThrow();
        expect(store.get('world').pendingDestroy).toHaveLength(0);
    });

    it('costs nothing when nothing was destroyed', () => {
        const { store, root } = gameWithSprites(2);

        flushDestroyed(store);

        expect(root.drawables).toHaveLength(2);
    });

    it('keeps two games apart', () => {
        const first = gameWithSprites(1);
        const second = gameWithSprites(1);

        destroy(first.sprites[0]);
        flushDestroyed(second.store);

        expect(first.root.drawables).toHaveLength(1);
        expect(second.root.drawables).toHaveLength(1);
        expect(first.store.get('world').pendingDestroy).toHaveLength(1);

        flushDestroyed(first.store);
        expect(first.root.drawables).toHaveLength(0);
        expect(second.root.drawables).toHaveLength(1);
    });
});
