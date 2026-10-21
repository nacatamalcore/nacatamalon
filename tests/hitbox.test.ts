import { describe, expect, it } from 'bun:test';
import { createFrameContext } from '../src/game/loop/create_frame_context';
import { tick } from '../src/game/loop/tick';
import { createScene } from '../src/scene/create_scene';
import { registerScene } from '../src/scene/register_scene';
import { startScene } from '../src/scene/start_scene';
import { createSprite } from '../src/gameobjects/sprite/create_sprite';
import { destroy } from '../src/destroy/destroy';
import { useSpawn } from '../src/hooks/spawn/use_spawn';
import { useSelf } from '../src/hooks/spawn/use_self';
import { useUpdate } from '../src/hooks/loop/use_update';
import { useLateUpdate } from '../src/hooks/loop/use_late_update';
import { useTransform } from '../src/hooks/transform/use_transform';
import { useHitbox, useCollisionBetween, useCollisionWith } from '../src/hooks/hitbox';
import { useTag } from '../src/hooks/tags/use_tag';
import type { THitboxOptions } from '../src/hooks/hitbox/use_hitbox';
import { collisionBetween } from '../src/hitbox';
import { createTestGame, startTestScene } from './helpers/test_game';
import type { TSceneFn } from '../src/scene';
import type { TSprite } from '../src/gameobjects/sprite/types/t_sprite';
import type { TGameObject } from '../src/hooks/spawn/use_spawn';
import type { THitbox } from '../src/hitbox';

/**
 * Whether things touch, with no physics: two rectangles, turned the way they are drawn, sharing any
 * area. Asked once with `collisionBetween`, or every frame between tags with `useCollisionBetween`.
 */

(globalThis as { requestAnimationFrame?: (cb: FrameRequestCallback) => number }).requestAnimationFrame = () => 0;

const tint = { r: 1, g: 1, b: 1, a: 1 };
const at = (x: number, y: number, rotation = 0, scale = 1) => ({ x, y, rotation, scaleX: scale, scaleY: scale });
const square = (x: number, y: number, size = 10, rotation = 0) =>
    createSprite({ width: size, height: size, tint, transform: at(x, y, rotation) });

/**
 * A scene built with `body`, and a frame to run it by, through the real tick.
 */
/** A hitbox on the object being built, and the tag it is touched by. */
const hitboxOf = (tag: string, options: THitboxOptions = {}) => {
    useTag(tag).add(useSelf());
    return useHitbox(options);
};

const game = (body: TSceneFn) => {
    const { store } = createTestGame();
    const ctx = createFrameContext();
    let now = 0;
    registerScene(store, 'Level', body);
    startScene(store, 'Level');
    return {
        store,
        frame: (): void => {
            const prev = now;
            now += 1000 / 60;
            tick(store, ctx, now, prev);
        },
    };
};

describe('collision_between', () => {
    it('says whether two pictures share any area, and edges that only meet are not touching', () => {
        const { store } = createTestGame();
        let a!: TSprite; let b!: TSprite; let c!: TSprite; let d!: TSprite;
        startTestScene(store, 'Level', () => {
            a = square(50, 50);
            b = square(58, 52);
            c = square(80, 50);
            // Side by side with a: its left edge is a's right edge.
            d = square(60, 50);
            return createScene();
        });

        expect(collisionBetween(a, b)).toBe(true);
        expect(collisionBetween(a, c)).toBe(false);
        expect(collisionBetween(a, d)).toBe(false);
    });

    it('follows a turn: a bar on the diagonal misses what the box around it would catch', () => {
        const { store } = createTestGame();
        let bar!: TSprite; let off!: TSprite; let on!: TSprite;
        startTestScene(store, 'Level', () => {
            // 100 long, turned 45°: it runs from top-left to bottom-right through 100, 100.
            bar = createSprite({ width: 100, height: 4, tint, transform: at(100, 100, Math.PI / 4) });
            off = square(130, 70, 4);
            on = square(130, 130, 4);
            return createScene();
        });

        expect(collisionBetween(bar, off)).toBe(false);
        expect(collisionBetween(bar, on)).toBe(true);
    });

    it('measures a picture where it is drawn, through the objects above it', () => {
        const { store } = createTestGame();
        let barrel!: TSprite;
        startTestScene(store, 'Level', () => {
            useSpawn(function Turret() {
                useTransform({ x: 100, y: 50, scaleX: 2, scaleY: 2 });
                barrel = square(10, 0, 4);
            })();
            return createScene();
        });

        // At 120, 50 in the world and 8 wide: from 116 to 124.
        expect(collisionBetween(barrel, { x: 123, y: 48, width: 4, height: 4 })).toBe(true);
        expect(collisionBetween(barrel, { x: 124, y: 48, width: 4, height: 4 })).toBe(false);
    });

    it('measures an object by its hitboxes, by nothing when they are off, and by its picture when it has none', () => {
        const { store } = createTestGame();
        let hero!: TGameObject; let body!: THitbox; let rock!: TGameObject;
        startTestScene(store, 'Level', () => {
            hero = useSpawn(function Hero() {
                square(50, 50, 20);
                body = hitboxOf('player', { width: 6, height: 6 });
            })();
            rock = useSpawn(function Rock() { square(64, 50, 10); })();
            return createScene();
        });
        const near = { x: 56, y: 48, width: 4, height: 4 };

        // The picture reaches 60, the hitbox only 53.
        expect(collisionBetween(hero, rock)).toBe(false);
        // Where the hero's picture is and its hitbox is not.
        expect(collisionBetween(hero, near)).toBe(false);
        expect(collisionBetween(hero, { x: 52, y: 48, width: 4, height: 4 })).toBe(true);
        body.enabled = false;
        expect(collisionBetween(hero, { x: 52, y: 48, width: 4, height: 4 })).toBe(false);
        expect(collisionBetween(rock, { x: 58, y: 48, width: 4, height: 4 })).toBe(true);
    });

    it('takes the picture\'s size until given one, follows it when it changes, and moves by x and y', () => {
        const { store } = createTestGame();
        let hero!: TGameObject; let sprite!: TSprite; let body!: THitbox;
        startTestScene(store, 'Level', () => {
            hero = useSpawn(function Hero() {
                sprite = square(50, 50, 20);
                body = hitboxOf('player');
            })();
            return createScene();
        });
        const probe = { x: 58, y: 49, width: 1, height: 2 };

        expect(collisionBetween(hero, probe)).toBe(true);
        sprite.width = 10;
        expect(collisionBetween(hero, probe)).toBe(false);
        body.width = 30;
        expect(collisionBetween(hero, probe)).toBe(true);
        // Moved down by 20: its top is now at 50, below the probe.
        body.y = 20;
        expect(collisionBetween(hero, probe)).toBe(false);
    });
});

describe('useCollisionWith', () => {
    const Bat = (x: number) => { square(x, 50, 10); hitboxOf('enemy'); };

    it('calls with each thing of the tag the piece touches, every frame, from the piece itself', () => {
        const seen: string[] = [];
        const { frame } = game(() => {
            // Two bullets written apart from the bats, each saying what it hits: no rule in the scene.
            const Bullet = (label: string, x: number) => {
                square(x, 50, 4);
                hitboxOf('shot');
                useCollisionWith('enemy', (bat) => seen.push(`${label}>${(bat as TGameObject).name}`));
            };
            useSpawn(Bat, 'Bat')(52);
            useSpawn(Bat, 'Bat')(200);
            useSpawn(Bullet)('a', 50);
            useSpawn(Bullet)('b', 120);
            return createScene();
        });

        frame();
        frame();

        expect(seen).toEqual(['a>Bat', 'a>Bat']);
    });

    it('meets a thing born during this frame\'s updates from the next frame, as it moves from the next', () => {
        const frames: number[] = [];
        let frameNumber = 0;
        const { frame } = game(() => {
            const spawnBat = useSpawn(Bat, 'Bat');
            useSpawn(() => {
                square(50, 50, 4);
                hitboxOf('shot');
                useCollisionWith('enemy', () => frames.push(frameNumber));
            }, 'Bullet')();
            // A bat let out during the third frame's updates, right on the bullet.
            useUpdate(() => { if (frameNumber === 3) spawnBat(52); });
            return createScene();
        });

        for (frameNumber = 1; frameNumber <= 5; frameNumber++) frame();
        expect(frames).toEqual([4, 5]);
    });

    it('calls once on the first frame they touch with start, and once when they part with end', () => {
        const said: string[] = [];
        let bat!: TSprite;
        const { frame } = game(() => {
            useSpawn(() => { bat = square(52, 50, 10); hitboxOf('enemy'); }, 'Bat')();
            useSpawn(() => {
                square(50, 50, 4);
                useCollisionWith('enemy', () => said.push('start'), { when: 'start' });
                useCollisionWith('enemy', () => said.push('end'), { when: 'end' });
            }, 'Player')();
            return createScene();
        });

        frame();
        frame();
        bat.transform.x = 300;
        frame();
        frame();

        expect(said).toEqual(['start', 'end']);
    });

    it('is not called again once the piece destroyed itself, nor with what an earlier call destroyed', () => {
        const hits: string[] = [];
        const { frame } = game(() => {
            useSpawn(Bat, 'Bat')(48);
            useSpawn(Bat, 'Bat')(52);
            useSpawn(() => {
                const self = useSelf();
                square(50, 50, 4);
                hitboxOf('shot');
                useCollisionWith('enemy', (bat) => {
                    hits.push((bat as TGameObject).name);
                    destroy(self);
                });
            }, 'Bullet')();
            return createScene();
        });

        frame();
        frame();

        // One bullet, one bat.
        expect(hits).toEqual(['Bat']);
    });
});

describe('useCollisionBetween', () => {
    const Shot = (x: number) => { square(x, 50, 4); hitboxOf('shot'); };
    const Bat = (x: number) => { square(x, 50, 10); hitboxOf('enemy'); };

    it('calls for every pair touching, every frame they touch, in the order the tags were named', () => {
        const seen: string[] = [];
        const { frame } = game(() => {
            useSpawn(Shot)(50);
            useSpawn(Bat)(52);
            useSpawn(Bat)(200);
            useCollisionBetween('shot', 'enemy', (shot, bat) => seen.push(`${(shot as TGameObject).name}>${(bat as TGameObject).name}`));
            return createScene();
        });

        frame();
        frame();

        expect(seen).toEqual(['Shot>Bat', 'Shot>Bat']);
    });

    it('compares where the updates left things, before the late updates read them', () => {
        const order: string[] = [];
        const { frame } = game(() => {
            useSpawn(function Runner() {
                const sprite = square(0, 50, 4);
                hitboxOf('shot');
                useUpdate(() => { sprite.transform.x = 50; order.push('update'); });
            })();
            useSpawn(Bat)(52);
            useCollisionBetween('shot', 'enemy', () => order.push('overlap'));
            useLateUpdate(() => order.push('late'));
            return createScene();
        });

        frame();

        expect(order).toEqual(['update', 'overlap', 'late']);
    });

    it('does not call again with something an earlier call destroyed: one bullet, one bat', () => {
        const hit: number[] = [];
        const { frame, store } = game(() => {
            useSpawn(Shot)(50);
            useSpawn(Bat)(48);
            useSpawn(Bat)(52);
            useCollisionBetween('shot', 'enemy', (shot, bat) => {
                hit.push((bat as TGameObject).drawables.length);
                destroy(shot);
            });
            return createScene();
        });

        frame();

        expect(hit).toHaveLength(1);
        expect(store.get('world').scenes[0].children.filter((child) => child.name === 'Shot')).toHaveLength(0);
    });

    it('calls once for each pair of one tag, and never pairs a thing with itself', () => {
        const pairs: string[] = [];
        const { frame } = game(() => {
            const bats: TGameObject[] = [useSpawn(Bat)(50), useSpawn(Bat)(55), useSpawn(Bat)(58)];
            useCollisionBetween('enemy', 'enemy', (one, other) => pairs.push([bats.indexOf(one as TGameObject), bats.indexOf(other as TGameObject)].sort().join('')));
            return createScene();
        });

        frame();

        expect(pairs.sort()).toEqual(['01', '02', '12']);
    });

    it('calls once for a pair of objects however many of their hitboxes touch', () => {
        let calls = 0;
        const { frame } = game(() => {
            useSpawn(function Knight() {
                square(50, 50, 10);
                hitboxOf('enemy');
                hitboxOf('enemy', { x: 2 });
            })();
            useSpawn(Shot)(50);
            useCollisionBetween('shot', 'enemy', () => { calls += 1; });
            return createScene();
        });

        frame();

        expect(calls).toBe(1);
    });

    it('never touches a hitbox that is off, and obeys one turned off by an earlier call', () => {
        const seen: number[] = [];
        let first!: THitbox;
        const { frame } = game(() => {
            useSpawn(function Hero() { square(50, 50, 10); first = hitboxOf('player'); })();
            useSpawn(Bat)(52);
            useSpawn(Bat)(48);
            useCollisionBetween('player', 'enemy', () => {
                seen.push(1);
                // Hurt: blinking, so nothing else hurts this frame or after.
                first.enabled = false;
            });
            return createScene();
        });

        frame();
        frame();

        expect(seen).toEqual([1]);
    });

    it('stops when asked, and with the object that registered it', () => {
        let a = 0;
        let b = 0;
        let stop!: () => void;
        let watcher!: TGameObject;
        const { frame } = game(() => {
            useSpawn(Shot)(50);
            useSpawn(Bat)(52);
            stop = useCollisionBetween('shot', 'enemy', () => { a += 1; });
            watcher = useSpawn(function Watcher() {
                useCollisionBetween('shot', 'enemy', () => { b += 1; });
            })();
            return createScene();
        });

        frame();
        stop();
        destroy(watcher);
        frame();

        expect([a, b]).toEqual([1, 1]);
    });

    it('is not called while its scene is paused', () => {
        let calls = 0;
        const { frame, store } = game(() => {
            useSpawn(Shot)(50);
            useSpawn(Bat)(52);
            useCollisionBetween('shot', 'enemy', () => { calls += 1; });
            return createScene();
        });

        store.get('world').scenes[0].paused = true;
        frame();

        expect(calls).toBe(0);
    });

    it('lets a thing end its own life on being touched', () => {
        const { frame, store } = game(() => {
            useSpawn(function Coin() {
                const self = useSelf();
                square(50, 50, 6);
                hitboxOf('coin');
                useCollisionBetween('player', 'coin', (_, coin) => { if (coin === self) destroy(self); });
            })();
            useSpawn(function Hero() { square(52, 50, 10); hitboxOf('player'); })();
            return createScene();
        });

        frame();

        expect(store.get('world').scenes[0].children.map((child) => child.name)).toEqual(['Hero']);
    });
});
