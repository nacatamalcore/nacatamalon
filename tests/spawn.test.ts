import { describe, expect, it } from 'bun:test';
import { createScene } from '../src/scene/create_scene';
import { createSprite } from '../src/gameobjects/sprite/create_sprite';
import { destroy } from '../src/destroy/destroy';
import { flushDestroyed } from '../src/destroy/flush_destroyed';
import { runHookUpdates } from '../src/game/loop/runHookUpdates';
import { useSelf } from '../src/hooks/spawn/use_self';
import { useSpawn } from '../src/hooks/spawn/use_spawn';
import { useSceneUnmount } from '../src/hooks/scene/use_scene_unmount';
import { useUpdate } from '../src/hooks/loop/use_update';
import { withSceneUpdates } from '../src/store/scene_updates';
import { createTestGame, startTestScene } from './helpers/test_game';
import type { TBox } from '../src/box';
import type { TSprite } from '../src/gameobjects/sprite/types/t_sprite';

const tint = { r: 1, g: 1, b: 1, a: 1 };
const at = (x: number) => ({ x, y: 0, rotation: 0, scaleX: 1, scaleY: 1 });

describe('useSpawn', () => {
    it('throws outside a scene body', () => {
        expect(() => useSpawn(() => {})).toThrow(/inside a scene body/);
    });

    it('gives each call a place of its own, named after the component', () => {
        const { store } = createTestGame();
        const Bullet = (x: number) => { createSprite({ width: 4, height: 4, tint, transform: at(x) }); };

        const root = startTestScene(store, 'Level', () => {
            const spawn = useSpawn(Bullet);
            spawn(1);
            spawn(2);
            return createScene();
        });

        expect(root.children).toHaveLength(2);
        expect(root.children.map((child) => child.name)).toEqual(['Bullet', 'Bullet']);
        expect(root.children[0].id).not.toBe(root.children[1].id);
    });

    it('keeps the sprites and the per-frame code on the thing itself, not on the scene', () => {
        const { store } = createTestGame();
        const ticks: string[] = [];
        const Bullet = () => {
            createSprite({ width: 4, height: 4, tint, transform: at(0) });
            useUpdate(() => ticks.push('bullet'));
        };

        const root = startTestScene(store, 'Level', () => {
            useUpdate(() => ticks.push('scene'));
            useSpawn(Bullet)();
            return createScene();
        });

        expect(root.drawables).toHaveLength(0);
        expect(root.children[0].drawables).toHaveLength(1);
        expect(root.updateCallbacks).toHaveLength(1);
        expect(root.children[0].updateCallbacks).toHaveLength(1);

        runHookUpdates(root, 0.016);
        expect(ticks).toEqual(['scene', 'bullet']);
    });

    it('passes its arguments straight through', () => {
        const { store } = createTestGame();
        let seen: unknown[] = [];
        const Bullet = (x: number, label: string) => { seen = [x, label]; };

        startTestScene(store, 'Level', () => {
            useSpawn(Bullet)(7, 'fast');
            return createScene();
        });

        expect(seen).toEqual([7, 'fast']);
    });

    it('works from a frame, and what is born mid-frame waits for the next one', () => {
        const { store } = createTestGame();
        const ticks: string[] = [];
        const Bullet = () => { useUpdate(() => ticks.push('bullet')); };

        let spawn!: () => TBox;
        const root = startTestScene(store, 'Level', () => {
            spawn = useSpawn(Bullet);
            useUpdate(() => { if (root.children.length === 0) spawn(); });
            return createScene();
        });

        withSceneUpdates(store, () => runHookUpdates(root, 0.016));
        expect(root.children).toHaveLength(1);
        expect(ticks).toEqual([]);

        withSceneUpdates(store, () => runHookUpdates(root, 0.016));
        expect(ticks).toEqual(['bullet']);
    });

    it('nests: a thing can spawn its own things', () => {
        const { store } = createTestGame();
        const Turret = () => { createSprite({ width: 4, height: 4, tint, transform: at(0) }); };
        const Tank = () => { useSpawn(Turret)(); };

        const root = startTestScene(store, 'Level', () => {
            useSpawn(Tank)();
            return createScene();
        });

        expect(root.children[0].name).toBe('Tank');
        expect(root.children[0].children[0].name).toBe('Turret');
        expect(root.children[0].children[0].parent).toBe(root.children[0]);
    });

    it("hangs at the top of the scene when asked for 'scene', however deep the maker is", () => {
        // A cannon's shot: it must not swing round with the barrel once it has left.
        const { store } = createTestGame();
        const Shot = () => { createSprite({ width: 2, height: 2, tint, transform: at(0) }); };
        let fire: (() => unknown) | null = null;
        const Cannon = () => { fire = useSpawn(Shot, { parent: 'scene' }); };

        const root = startTestScene(store, 'Level', () => {
            useSpawn(function Base() { useSpawn(Cannon)(); })();
            return createScene();
        });
        fire!();

        const shot = root.children.find((child) => child.name === 'Shot');
        expect(shot?.parent).toBe(root);
        expect(root.children[0].children[0].children).toHaveLength(0);
    });

    it('hangs under the thing it is given', () => {
        const { store } = createTestGame();
        const Mark = () => { createSprite({ width: 2, height: 2, tint, transform: at(0) }); };

        const root = startTestScene(store, 'Level', () => {
            const holder = useSpawn(function Holder() {})();
            useSpawn(Mark, { parent: holder })();
            return createScene();
        });

        expect(root.children.map((child) => child.name)).toEqual(['Holder']);
        expect(root.children[0].children[0].name).toBe('Mark');
    });
});

describe('useSelf', () => {
    it('is the thing being built, and inside a scene body it is the scene', () => {
        const { store } = createTestGame();
        let mine!: TBox;
        const Bullet = () => { mine = useSelf(); };

        let sceneSelf!: TBox;
        const root = startTestScene(store, 'Level', () => {
            sceneSelf = useSelf();
            useSpawn(Bullet)();
            return createScene();
        });

        expect(sceneSelf).toBe(root);
        expect(mine).toBe(root.children[0]);
    });

    it('throws outside a scene body', () => {
        expect(() => useSelf()).toThrow(/inside a scene body/);
    });
});

describe('destroy of a spawned object', () => {
    const gameWithBullet = () => {
        const { store } = createTestGame();
        const ticks: string[] = [];
        const cleanups: string[] = [];
        let self!: TBox;

        const Bullet = () => {
            self = useSelf();
            createSprite({ width: 4, height: 4, tint, transform: at(0) });
            useUpdate(() => ticks.push('bullet'));
            useSceneUnmount(() => cleanups.push('bullet'));
        };

        const root = startTestScene(store, 'Level', () => {
            useSpawn(Bullet)();
            return createScene();
        });

        return { store, root, ticks, cleanups, self };
    };

    it('stops running the moment it is destroyed, before the sweep', () => {
        const { store, root, ticks, self } = gameWithBullet();

        destroy(self);
        expect(root.children).toHaveLength(1);

        runHookUpdates(root, 0.016);
        expect(ticks).toEqual([]);
        expect(store.get('world').pendingDestroy).toHaveLength(1);
    });

    it('leaves the tree on the sweep, running its cleanups and dropping its sprites', () => {
        const { store, root, cleanups, self } = gameWithBullet();
        const sprite = self.drawables[0] as TSprite;

        destroy(self);
        flushDestroyed(store);

        expect(root.children).toHaveLength(0);
        expect(self.parent).toBeNull();
        expect(cleanups).toEqual(['bullet']);
        expect(self.drawables).toHaveLength(0);
        expect(sprite.destroyed).toBe(false);   // never asked for on its own, it went with its owner
    });

    it('takes everything under it, children first', () => {
        const { store } = createTestGame();
        const order: string[] = [];
        const Turret = () => { useSceneUnmount(() => order.push('turret')); };
        let tank!: TBox;
        const Tank = () => {
            tank = useSelf();
            useSceneUnmount(() => order.push('tank'));
            useSpawn(Turret)();
        };

        const root = startTestScene(store, 'Level', () => {
            useSpawn(Tank)();
            return createScene();
        });

        destroy(tank);
        flushDestroyed(store);

        expect(order).toEqual(['turret', 'tank']);
        expect(root.children).toHaveLength(0);
    });

    it('refuses a scene and says where to go instead', () => {
        const { store, root } = gameWithBullet();
        const warnings: string[] = [];
        const original = console.warn;
        console.warn = (...args: unknown[]) => { warnings.push(String(args[0])); };

        destroy(root);
        console.warn = original;

        expect(root.destroyed).toBe(false);
        expect(store.get('world').scenes).toContain(root);
        expect(warnings[0]).toMatch(/is a scene\. Use useScene\(\)\.stop\(\)/);
    });

    it('honours immediate outside the updates, and defers it inside', () => {
        const first = gameWithBullet();
        destroy(first.self, { immediate: true });
        expect(first.root.children).toHaveLength(0);
        expect(first.store.get('world').pendingDestroy).toHaveLength(0);

        const second = gameWithBullet();
        withSceneUpdates(second.store, () => {
            destroy(second.self, { immediate: true });
            expect(second.root.children).toHaveLength(1);
        });
        flushDestroyed(second.store);
        expect(second.root.children).toHaveLength(0);
    });

    it('does nothing the second time', () => {
        const { store, self } = gameWithBullet();

        destroy(self);
        destroy(self);
        expect(store.get('world').pendingDestroy).toHaveLength(1);

        flushDestroyed(store);
        expect(() => destroy(self)).not.toThrow();
        expect(store.get('world').pendingDestroy).toHaveLength(0);
    });
});
