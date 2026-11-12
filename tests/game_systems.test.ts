import { afterEach, describe, expect, it, spyOn } from 'bun:test';
import { createHeadlessGame } from '../src/headless';
import { createScene } from '../src/scene/create_scene';
import { createSprite } from '../src/gameobjects/sprite/create_sprite';
import { useUpdate, useLateUpdate } from '../src/hooks/loop';
import { useCleanup } from '../src/hooks/scene/use_cleanup';
import { useReady } from '../src/hooks/scene/use_ready';
import { useGame } from '../src/hooks/game/use_game';
import { useScene } from '../src/hooks/scene/use_scene';
import { useCamera3d } from '../src/hooks/camera/use_camera_3d';
import { registerGameSystem } from '../src';
import { parseSceneDoc, sceneFromDoc } from '../src/scene/document';
import { followLayout, runSystemUpdates, startGameSystems, stopGameSystems } from '../src/game_systems/game_systems';
import { createTestGame, startTestScene } from './helpers/test_game';
import { stopScene } from '../src/scene/stop_scene';
import { useRenderStyle } from '../src/hooks/style/use_render_style';
import { useFog } from '../src/hooks/fog/use_fog';
import { useSpawn } from '../src/hooks/spawn/use_spawn';

// Code of a plugin's that belongs to the whole game: started before the first scene, run around the
// scenes each frame, kept through every change of scene, torn down after them.

const removals: Array<() => void> = [];
const register = (name: string, fn: () => void): (() => void) => {
    const remove = registerGameSystem(name, fn);
    removals.push(remove);
    return remove;
};
afterEach(() => {
    while (removals.length > 0) removals.pop()!();
});

const game = (scenes: Record<string, () => ReturnType<typeof createScene>>) =>
    createHeadlessGame({ width: 16, height: 16, scenes });

describe('registerGameSystem', () => {
    it('starts each system once, before the first scene, in the order they were registered', () => {
        const told: string[] = [];
        register('test-first', () => {
            told.push('first');
            useReady(() => told.push('first ready'));
        });
        register('test-second', () => { told.push('second'); });
        const running = game({ Level: () => { told.push('scene'); return createScene(); } });
        expect(told).toEqual(['first', 'second', 'first ready', 'scene']);
        running.destroy();
    });

    it('runs its updates before every scene\'s and its late updates after, each frame', () => {
        const told: string[] = [];
        register('test-order', () => {
            useUpdate(() => { told.push('system'); });
            useLateUpdate(() => { told.push('system late'); });
        });
        const running = game({
            Level: () => {
                useUpdate(() => { told.push('scene'); });
                useLateUpdate(() => { told.push('scene late'); });
                return createScene();
            },
        });
        running.run(1);
        expect(told).toEqual(['system', 'scene', 'scene late', 'system late']);
        running.destroy();
    });

    it('lives through every change of scene, and is torn down after the scenes, the last started first', () => {
        const told: string[] = [];
        let frames = 0;
        register('test-one', () => {
            useUpdate(() => { frames++; });
            useCleanup(() => told.push('one'));
        });
        register('test-two', () => { useCleanup(() => told.push('two')); });
        const running = game({
            Title: () => {
                const scene = useScene();
                useUpdate(() => scene.change('Level'));
                return createScene();
            },
            Level: () => {
                useCleanup(() => told.push('level'));
                return createScene();
            },
        });
        running.run(3);
        expect(frames).toBe(3);
        running.destroy();
        expect(told).toEqual(['level', 'two', 'one']);
    });

    it('stops while the game is paused, and not while a scene is', () => {
        let frames = 0;
        register('test-paused', () => { useUpdate(() => { frames++; }); });
        let pause!: () => void;
        let resume!: () => void;
        let pauseScene!: () => void;
        const running = game({
            Level: () => {
                const handle = useGame();
                const scene = useScene();
                pause = () => handle.pause();
                resume = () => handle.resume();
                pauseScene = () => scene.pause();
                return createScene();
            },
        });
        running.run(1);
        pause();
        running.run(2);
        expect(frames).toBe(1);
        resume();
        pauseScene();
        running.run(2);
        expect(frames).toBe(3);
        running.destroy();
    });

    it('one that throws is reported and left out, and the game goes on', () => {
        const error = spyOn(console, 'error').mockImplementation(() => {});
        let frames = 0;
        register('test-broken', () => { throw new Error('broken on purpose'); });
        register('test-fine', () => { useUpdate(() => { frames++; }); });
        const running = game({ Level: () => createScene() });
        running.run(2);
        expect(frames).toBe(2);
        expect(String(error.mock.calls[0]?.[0])).toContain("game system 'test-broken'");
        running.destroy();
        error.mockRestore();
    });

    it('a frame that throws costs only that system\'s update, not the scenes', () => {
        const error = spyOn(console, 'error').mockImplementation(() => {});
        let scene = 0;
        register('test-throws', () => { useUpdate(() => { throw new Error('every frame'); }); });
        const running = game({ Level: () => { useUpdate(() => { scene++; }); return createScene(); } });
        // A headless game hands the frame's first error to whoever ran it, as it does a scene's; the
        // scenes of that frame ran all the same.
        expect(() => running.run(1)).toThrow('every frame');
        expect(scene).toBe(1);
        expect(error).toHaveBeenCalledTimes(1);
        running.destroy();
        error.mockRestore();
    });

    it('takes the same name twice only with the same function, and is taken out for the next game', () => {
        let started = 0;
        const body = () => { started++; };
        const remove = register('test-twice', body);
        expect(() => registerGameSystem('test-twice', body)).not.toThrow();
        expect(() => registerGameSystem('test-twice', () => {})).toThrow(/already registered with another function/);
        game({ Level: () => createScene() }).destroy();
        remove();
        game({ Level: () => createScene() }).destroy();
        expect(started).toBe(1);
    });

    it('registered while a game runs waits for the next one, and says so once', () => {
        const warn = spyOn(console, 'warn').mockImplementation(() => {});
        let started = 0;
        const running = game({ Level: () => createScene() });
        register('test-late', () => { started++; });
        running.run(1);
        expect(started).toBe(0);
        expect(String(warn.mock.calls[0]?.[0])).toContain("'test-late' was registered after a game started");
        running.destroy();
        game({ Level: () => createScene() }).destroy();
        expect(started).toBe(1);
        warn.mockRestore();
    });

    it('belongs to no scene: the hooks that need one throw, and what it would draw is said', () => {
        const error = spyOn(console, 'error').mockImplementation(() => {});
        const warn = spyOn(console, 'warn').mockImplementation(() => {});
        register('test-scene', () => { useScene(); });
        register('test-camera', () => { useCamera3d(); });
        register('test-draws', () => { createSprite({}); });
        const running = game({ Level: () => createScene() });
        const said = error.mock.calls.map((call) => `${String(call[0])} ${String((call[1] as Error | undefined)?.message)}`);
        expect(said[0]).toContain("useScene: 'test-scene' is a game system, which belongs to no scene");
        expect(said[1]).toContain("useCamera3d: 'test-camera' is a game system");
        expect(String(warn.mock.calls[0]?.[0])).toContain("game system 'test-draws': it made something to draw");
        running.destroy();
        error.mockRestore();
        warn.mockRestore();
    });

    it('without a plugin: a scene launched beside the levels lives through their changes', () => {
        let frames = 0;
        const running = game({
            Main: () => {
                const scene = useScene();
                useReady(() => scene.launch('Level1'));
                useUpdate(() => { frames++; });
                return createScene();
            },
            Level1: () => {
                const scene = useScene();
                useUpdate(() => scene.change('Level2'));
                return createScene();
            },
            Level2: () => createScene(),
        });
        running.run(3);
        expect(frames).toBe(3);
        running.destroy();
    });

    it('is taken down while a tool lays the game out, listeners and all, and started again when it is played', () => {
        const told: string[] = [];
        let frames = 0;
        register('test-laid-out', () => {
            told.push('start');
            useUpdate(() => { frames++; });
            useCleanup(() => told.push('down'));
        });
        const doc = parseSceneDoc({
            format: 'nacatamalon-scene', version: 1, name: 'Level', assets: [],
            root: { id: 'root', name: 'Level', transform: null, children: [], components: [] },
        }, 'test');
        const { store } = createTestGame();
        startGameSystems(store);
        const shown = startTestScene(store, 'Level', sceneFromDoc(doc, 'Level', { scripts: 'attach' }));
        followLayout(store);
        expect(told).toEqual(['start', 'down']);
        expect(store.get('world').systems).toEqual([]);
        // Played again in the same game: started from the beginning.
        stopScene(store, shown);
        startTestScene(store, 'Played', () => createScene());
        followLayout(store);
        expect(told).toEqual(['start', 'down', 'start']);
        expect(runSystemUpdates(store, 1 / 60)).not.toBeNull();
        expect(frames).toBe(1);
        stopGameSystems(store);
    });

    it('a document built inside a played scene to be shown (a preview) leaves the game played', () => {
        const told: string[] = [];
        register('test-preview', () => { useCleanup(() => told.push('down')); });
        const doc = parseSceneDoc({
            format: 'nacatamalon-scene', version: 1, name: 'Preview', assets: [],
            root: { id: 'root', name: 'Preview', transform: null, children: [], components: [] },
        }, 'test');
        const { store } = createTestGame();
        startGameSystems(store);
        startTestScene(store, 'Menu', () => {
            useSpawn(function Preview() { sceneFromDoc(doc, 'Preview', { scripts: 'attach' })(); })();
            return createScene();
        });
        followLayout(store);
        expect(told).toEqual([]);
        expect(store.get('world').systems).toHaveLength(1);
        stopGameSystems(store);
    });

    it('with no scene at all while laid out (between one build and the next), nothing starts again', () => {
        const told: string[] = [];
        register('test-between', () => {
            told.push('start');
            useCleanup(() => told.push('down'));
        });
        const doc = parseSceneDoc({
            format: 'nacatamalon-scene', version: 1, name: 'Level', assets: [],
            root: { id: 'root', name: 'Level', transform: null, children: [], components: [] },
        }, 'test');
        const { store } = createTestGame();
        startGameSystems(store);
        const shown = startTestScene(store, 'Level', sceneFromDoc(doc, 'Level', { scripts: 'attach' }));
        followLayout(store);
        stopScene(store, shown);
        followLayout(store);
        followLayout(store);
        expect(told).toEqual(['start', 'down']);
        stopGameSystems(store);
    });

    it('one that fails to start runs nothing that anything it made set aside', () => {
        const error = spyOn(console, 'error').mockImplementation(() => {});
        let ready = 0;
        register('test-child-ready', () => {
            useSpawn(function Child() { useReady(() => { ready++; }); })();
            throw new Error('after the child');
        });
        game({ Level: () => createScene() }).destroy();
        expect(ready).toBe(0);
        error.mockRestore();
    });

    it('a headless game whose first scene\'s ready throws still runs that scene\'s cleanups', () => {
        let cleaned = 0;
        expect(() => game({
            Level: () => {
                useCleanup(() => { cleaned++; });
                useReady(() => { throw new Error('ready of the level'); });
                return createScene();
            },
        })).toThrow('ready of the level');
        expect(cleaned).toBe(1);
    });

    it('a game with none walks nothing and makes nothing in a frame', () => {
        const { store } = createTestGame();
        startGameSystems(store);
        expect(store.get('world').systems).toEqual([]);
        expect(runSystemUpdates(store, 1 / 60)).toBeNull();
        stopGameSystems(store);
    });

    it('one whose ready throws is said, and the game still starts', () => {
        const error = spyOn(console, 'error').mockImplementation(() => {});
        let scene = 0;
        register('test-ready-throws', () => { useReady(() => { throw new Error('ready on purpose'); }); });
        const running = game({ Level: () => { useUpdate(() => { scene++; }); return createScene(); } });
        running.run(1);
        expect(scene).toBe(1);
        expect(String(error.mock.calls[0]?.[0])).toContain('game system: what one set aside');
        running.destroy();
        error.mockRestore();
    });

    it('one whose body throws after setting a ready aside runs nothing of it', () => {
        const error = spyOn(console, 'error').mockImplementation(() => {});
        let ready = 0;
        register('test-half', () => {
            useReady(() => { ready++; });
            throw new Error('after the ready');
        });
        game({ Level: () => createScene() }).destroy();
        expect(ready).toBe(0);
        error.mockRestore();
    });

    it('a render style or fog inside a system throws: they are a scene\'s', () => {
        const error = spyOn(console, 'error').mockImplementation(() => {});
        register('test-style', () => { useRenderStyle(null); });
        register('test-fog', () => { useFog(); });
        game({ Level: () => createScene() }).destroy();
        const said = error.mock.calls.map((call) => String((call[1] as Error | undefined)?.message));
        expect(said[0]).toContain("useRenderStyle: 'test-style' is a game system");
        expect(said[1]).toContain("useFog: 'test-fog' is a game system");
        error.mockRestore();
    });

    it('a game whose first scene throws takes its systems with it, so a later one is not told it came late', () => {
        const warn = spyOn(console, 'warn').mockImplementation(() => {});
        let down = 0;
        register('test-first-throws', () => { useCleanup(() => { down++; }); });
        expect(() => game({ Level: () => { throw new Error('no level'); } })).toThrow('no level');
        expect(down).toBe(1);
        register('test-after', () => {});
        expect(warn).not.toHaveBeenCalled();
        warn.mockRestore();
    });
});
