import { describe, expect, it } from 'bun:test';
import { createFrameContext } from '../src/game/loop/create_frame_context';
import { createScene } from '../src/scene/create_scene';
import { registerScene } from '../src/scene/register_scene';
import { startScene } from '../src/scene/start_scene';
import { tick } from '../src/game/loop/tick';
import { useUpdate } from '../src/hooks/loop/use_update';
import { useLateUpdate } from '../src/hooks/loop/use_late_update';
import { useSpawn } from '../src/hooks/spawn/use_spawn';
import { useTransform } from '../src/hooks/transform';
import { useTween } from '../src/hooks/tween/use_tween';
import { destroy } from '../src/destroy';
import { createFakeCanvas, createTestGame } from './helpers/test_game';
import type { TSceneFn } from '../src/scene';
import type { TTransform3d } from '../src/gameobjects/types/t_transform_3d';

/**
 * `useLateUpdate` runs once every `useUpdate` of the scene is over, so what it reads is where things
 * ended up this frame. Driven through the real `tick`, because the point is the order inside a frame.
 */

(globalThis as { requestAnimationFrame?: (cb: FrameRequestCallback) => number }).requestAnimationFrame = () => 0;

const drivenGame = (body: TSceneFn) => {
    const { store } = createTestGame({}, createFakeCanvas(480, 320));
    const ctx = createFrameContext();
    let now = 0;
    const frame = (): void => {
        const prev = now;
        now += 1000 / 60;
        tick(store, ctx, now, prev);
    };
    registerScene(store, 'Level', body);
    startScene(store, 'Level');
    return { store, frame };
};

describe('useLateUpdate', () => {
    it('refuses to be called outside a scene body', () => {
        expect(() => useLateUpdate(() => {})).toThrow('[NacatamalOn] useLateUpdate');
    });

    it('reads where a child ended up this frame, which useUpdate in the scene cannot', () => {
        let place!: TTransform3d;
        const Player = () => {
            place = useTransform({ x: 100 });
            useUpdate(() => {
                place.x += 2;
            });
        };
        const early: number[] = [];
        const late: number[] = [];
        const { frame } = drivenGame(() => {
            useSpawn(Player)();
            useUpdate(() => early.push(place.x));
            useLateUpdate(() => late.push(place.x));
            return createScene();
        });

        frame();
        frame();

        // The scene is reached before the player: in useUpdate it sees the step before.
        expect(early).toEqual([100, 102]);
        expect(late).toEqual([102, 104]);
    });

    it('sees what a tween moved this frame', () => {
        let seen = -1;
        let value = 0;
        const { frame } = drivenGame(() => {
            const tween = useTween();
            tween({ from: 0, to: 100, duration: 1, onUpdate: (v: number) => { value = v; } });
            useLateUpdate(() => { seen = value; });
            return createScene();
        });

        frame();

        expect(value).toBeGreaterThan(0);
        expect(seen).toBe(value);
    });

    it('runs after every update of the scene, parents before children, with the same delta and time', () => {
        const order: string[] = [];
        const clocks: Array<[number, number]> = [];
        const Child = () => {
            useUpdate(() => order.push('child update'));
            useLateUpdate((dt, time) => {
                order.push('child late');
                clocks.push([dt, time]);
            });
        };
        const { frame } = drivenGame(() => {
            useSpawn(Child)();
            useLateUpdate((dt, time) => {
                order.push('scene late');
                clocks.push([dt, time]);
            });
            useUpdate((dt, time) => {
                order.push('scene update');
                clocks.push([dt, time]);
            });
            return createScene();
        });

        frame();

        expect(order).toEqual(['scene update', 'child update', 'scene late', 'child late']);
        expect(clocks[1]).toEqual(clocks[0]);
        expect(clocks[2]).toEqual(clocks[0]);
    });

    it('starts on the frame after something is spawned, like useUpdate', () => {
        let lates = 0;
        const Bullet = () => {
            useLateUpdate(() => { lates += 1; });
        };
        let fired = false;
        const { frame } = drivenGame(() => {
            const spawnBullet = useSpawn(Bullet);
            useUpdate(() => {
                if (!fired) {
                    fired = true;
                    spawnBullet();
                }
            });
            return createScene();
        });

        frame();
        expect(lates).toBe(0);
        frame();
        expect(lates).toBe(1);
    });

    it('is not run by something destroyed during the updates, nor by what hangs from it', () => {
        const lates: string[] = [];
        const Gun = () => {
            useLateUpdate(() => lates.push('gun'));
        };
        const Enemy = () => {
            useSpawn(Gun)();
            useLateUpdate(() => lates.push('enemy'));
        };
        const { frame } = drivenGame(() => {
            const enemy = useSpawn(Enemy)();
            let hits = 0;
            useLateUpdate(() => lates.push('scene'));
            useUpdate(() => {
                hits += 1;
                if (hits === 2) {
                    destroy(enemy);
                }
            });
            return createScene();
        });

        frame();
        expect(lates).toEqual(['scene', 'enemy', 'gun']);
        lates.length = 0;
        frame();
        expect(lates).toEqual(['scene']);
    });

    it('stops while the game is paused', () => {
        let lates = 0;
        const { store, frame } = drivenGame(() => {
            useLateUpdate(() => { lates += 1; });
            return createScene();
        });

        frame();
        store.setState('loop', { ...store.get('loop'), pausedBy: ['menu'] });
        frame();
        frame();
        expect(lates).toBe(1);
        store.setState('loop', { ...store.get('loop'), pausedBy: [] });
        frame();
        expect(lates).toBe(2);
    });
});
