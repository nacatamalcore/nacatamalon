import { afterEach, describe, expect, it } from 'bun:test';
import { createScene } from '../src/scene/create_scene';
import { parseSceneDoc, sceneFromDoc } from '../src/scene/document';
import { registerScene } from '../src/scene/register_scene';
import { startScene } from '../src/scene/start_scene';
import { clearScripts, registerScript } from '../src/scripts';
import { destroy } from '../src/destroy/destroy';
import { findObject } from '../src/box/find_object';
import { runHookUpdates } from '../src/game/loop/runHookUpdates';
import { useReady } from '../src/hooks/scene/use_ready';
import { useSelf } from '../src/hooks/spawn/use_self';
import { useSpawn } from '../src/hooks/spawn/use_spawn';
import { useUpdate } from '../src/hooks/loop/use_update';
import { createTestGame, startTestScene } from './helpers/test_game';
import type { TBox } from '../src/box';

afterEach(() => clearScripts());

describe('useReady', () => {
    it('throws outside a build', () => {
        expect(() => useReady(() => {})).toThrow(/inside a scene body/);
    });

    it('runs once the whole scene is built, before its first frame', () => {
        const { store } = createTestGame();
        const seen: number[] = [];
        let updates = 0;
        const Coin = () => {};

        startTestScene(store, 'Level', () => {
            const root = useSelf() as unknown as TBox;
            // Registered before the children exist; run after they all do.
            useReady(() => seen.push(root.children.length));
            useUpdate(() => { updates++; });
            const coin = useSpawn(Coin);
            coin();
            coin();
            return createScene();
        });

        expect(seen).toEqual([2]);
        expect(updates).toBe(0);
    });

    it('finds the boxes of a scene laid out as a document, from a behaviour on its root', () => {
        const { store } = createTestGame();
        let inBody: unknown = 'not run';
        let inReady: unknown = 'not run';
        registerScript('match', () => {
            const root = useSelf() as unknown as TBox;
            inBody = findObject(root, 'Pitcher');
            useReady(() => { inReady = findObject(root, 'Pitcher')?.name ?? null; });
        });
        const doc = parseSceneDoc({
            format: 'nacatamalon-scene',
            version: 1,
            name: 'Ballgame',
            assets: [],
            root: {
                id: 'root', name: 'Ballgame', transform: null,
                components: [{ type: 'script', id: 's1', ref: 'match' }],
                children: [{ id: 'p', name: 'Pitcher', transform: { x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1 }, components: [], children: [] }],
            },
        }, 'test');
        registerScene(store, 'Ballgame', sceneFromDoc(doc, 'test'));
        startScene(store, 'Ballgame');

        expect(inBody).toBeNull();
        expect(inReady).toBe('Pitcher');
    });

    it('runs parents\' before children\'s, each with its own box being built', () => {
        const { store } = createTestGame();
        const order: string[] = [];
        const Child = () => {
            useReady(() => order.push('child'));
        };

        const root = startTestScene(store, 'Level', () => {
            useReady(() => {
                order.push('parent');
                // A hook inside it belongs to the box it was written in.
                useUpdate(() => order.push('tick'));
            });
            useSpawn(Child)();
            return createScene();
        });

        expect(order).toEqual(['parent', 'child']);
        runHookUpdates(root, 0.016);
        expect(order).toEqual(['parent', 'child', 'tick']);
    });

    it('for something spawned later, runs before the spawner gets it back', () => {
        const { store } = createTestGame();
        const seen: number[] = [];
        const Part = () => {};
        const Ship = () => {
            const self = useSelf() as unknown as TBox;
            useReady(() => seen.push(self.children.length));
            useSpawn(Part)();
            useSpawn(Part)();
        };
        let spawn: (() => unknown) | null = null;

        startTestScene(store, 'Level', () => {
            spawn = useSpawn(Ship);
            return createScene();
        });
        expect(seen).toEqual([]);

        // From outside any build, as a useUpdate or a click would.
        spawn!();
        expect(seen).toEqual([2]);
    });

    it('skips a box destroyed before the build ended, and runs the rest when one throws', () => {
        const { store } = createTestGame();
        const ran: string[] = [];
        const Doomed = () => {
            useReady(() => ran.push('doomed'));
            destroy(useSelf());
        };

        expect(() => startTestScene(store, 'Level', () => {
            useReady(() => { throw new Error('first'); });
            useReady(() => ran.push('second'));
            useSpawn(Doomed)();
            return createScene();
        })).toThrow('first');
        expect(ran).toEqual(['second']);
    });
});
