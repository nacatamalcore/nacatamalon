import { describe, expect, it } from 'bun:test';
import { createScene } from '../src/scene/create_scene';
import { createSprite } from '../src/gameobjects/sprite/create_sprite';
import { destroy } from '../src/destroy/destroy';
import { flushDestroyed } from '../src/destroy/flush_destroyed';
import { runHookUpdates } from '../src/game/loop/runHookUpdates';
import { useSelf } from '../src/hooks/spawn/use_self';
import { useSpawn } from '../src/hooks/spawn/use_spawn';
import { useUpdate } from '../src/hooks/loop/use_update';
import { createTestGame, startTestScene } from './helpers/test_game';
import type { TGameObject } from '../src/hooks/spawn/use_spawn';

/**
 * What a component gives back reaches whoever made it, as the new thing's `api`: the way a level
 * talks to the enemy it spawned without a signal or a lookup.
 */

const tint = { r: 1, g: 1, b: 1, a: 1 };

const Bat = (life: number) => {
    const self = useSelf();
    createSprite({ width: 8, height: 8, tint, transform: { x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1 } });
    return {
        hurt: (damage: number) => {
            life -= damage;
            if (life <= 0) destroy(self);
        },
        life: () => life,
    };
};

describe('what a spawned component gives back', () => {
    it('is the new thing\'s api, typed, and it talks to that one alone', () => {
        const { store } = createTestGame();
        let one!: TGameObject<ReturnType<typeof Bat>>;
        let two!: TGameObject<ReturnType<typeof Bat>>;
        startTestScene(store, 'Cave', () => {
            const spawnBat = useSpawn(Bat);
            one = spawnBat(3);
            two = spawnBat(3);
            return createScene();
        });

        one.api.hurt(1);

        expect(one.api.life()).toBe(2);
        expect(two.api.life()).toBe(3);
    });

    it('reaches the thing itself: an api that destroys it takes it out of the scene', () => {
        const { store } = createTestGame();
        let bat!: TGameObject<ReturnType<typeof Bat>>;
        const root = startTestScene(store, 'Cave', () => {
            bat = useSpawn(Bat)(1);
            return createScene();
        });

        bat.api.hurt(1);
        flushDestroyed(store);

        expect(root.children).toHaveLength(0);
    });

    it('is there for something spawned from a frame, as soon as the maker returns', () => {
        const { store } = createTestGame();
        const lives: number[] = [];
        const root = startTestScene(store, 'Cave', () => {
            const spawnBat = useSpawn(Bat);
            useUpdate(() => {
                lives.push(spawnBat(5).api.life());
            });
            return createScene();
        });

        runHookUpdates(root, 1 / 60);

        expect(lives).toEqual([5]);
    });

    it('is undefined while the component is still being run, and for one that gives back nothing', () => {
        const { store } = createTestGame();
        const during: unknown[] = [];
        let quiet!: TGameObject<void>;
        let bat!: TGameObject<{ ok: boolean }>;
        startTestScene(store, 'Cave', () => {
            quiet = useSpawn(() => {})();
            bat = useSpawn(() => {
                during.push(useSelf().api);
                return { ok: true };
            })();
            return createScene();
        });

        expect(during).toEqual([undefined]);
        expect(quiet.api).toBeUndefined();
        expect(bat.api).toEqual({ ok: true });
    });

    it('is never half set: a component that throws reaches the caller and leaves no api', () => {
        const { store } = createTestGame();
        const root = startTestScene(store, 'Cave', () => {
            const spawn = useSpawn((): { ok: boolean } => {
                throw new Error('broken');
            });
            expect(() => spawn()).toThrow('broken');
            return createScene();
        });

        expect(root.children[0].api).toBeUndefined();
    });
});
