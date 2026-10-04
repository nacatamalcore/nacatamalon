import { describe, expect, it, mock, spyOn } from 'bun:test';
import { createGameEvents } from '../src/game/bootstrap/create_game_events';
import { createGameHandle } from '../src/game/handle/create_game_handle';
import { createFrameContext } from '../src/game/loop/create_frame_context';
import { tick } from '../src/game/loop/tick';
import { createScene } from '../src/scene/create_scene';
import { createSprite } from '../src/gameobjects/sprite/create_sprite';
import { useSpawn } from '../src/hooks/spawn/use_spawn';
import { createFakeCanvas, createTestGame, startTestScene } from './helpers/test_game';
import type { TGameHandle } from '../src/game/handle/t_game_handle';

/**
 * What a game tells the page around it, and what its handle can say about it.
 *
 * These are how anything outside a scene (a React HUD, the sandbox's debug panel) reaches a running
 * game. The one property that matters most is the replay: the three events happen once, so a page
 * that subscribes a moment late has to hear them anyway, or it waits for ever with no error.
 */

(globalThis as { requestAnimationFrame?: (cb: FrameRequestCallback) => number }).requestAnimationFrame = () => 0;

const fakeHandle = { getBackend: () => 'WEBGPU' } as unknown as TGameHandle;

describe('the game\'s events', () => {
    it('hands the handle to whoever is listening when the game is ready', () => {
        const events = createGameEvents();
        const heard: TGameHandle[] = [];
        events.on('ready', (handle) => heard.push(handle));

        events.emit('ready', fakeHandle);

        expect(heard).toEqual([fakeHandle]);
    });

    it('replays an event to a listener that arrives after it happened', () => {
        const events = createGameEvents();
        events.emit('ready', fakeHandle);
        events.emit('error', new Error('no webgpu'));

        const ready = mock();
        const error = mock();
        events.on('ready', ready);
        events.on('error', error);

        expect(ready).toHaveBeenCalledWith(fakeHandle);
        expect(error.mock.calls[0][0].message).toBe('no webgpu');
    });

    it('happens once: a second emit of the same event says nothing', () => {
        const events = createGameEvents();
        const ready = mock();
        events.on('ready', ready);

        events.emit('ready', fakeHandle);
        events.emit('ready', fakeHandle);

        expect(ready).toHaveBeenCalledTimes(1);
    });

    it('stops calling a listener that unsubscribed', () => {
        const events = createGameEvents();
        const ready = mock();
        const off = events.on('ready', ready);

        off();
        events.emit('ready', fakeHandle);

        expect(ready).not.toHaveBeenCalled();
    });

    it('says nothing more once the game is destroyed', () => {
        const events = createGameEvents();
        const ready = mock();
        const destroyed = mock();
        events.on('ready', ready);
        events.on('destroy', destroyed);

        events.emit('destroy', undefined);
        // A renderer that answers after the game was taken down starts nothing.
        events.emit('ready', fakeHandle);

        expect(destroyed).toHaveBeenCalledTimes(1);
        expect(ready).not.toHaveBeenCalled();
        const late = mock();
        events.on('destroy', late);
        expect(late).toHaveBeenCalledTimes(1);
    });

    it('does not let one broken listener keep the others from hearing', () => {
        const events = createGameEvents();
        const error = spyOn(console, 'error').mockImplementation(() => {});
        const second = mock();
        events.on('ready', () => {
            throw new Error('broken hud');
        });
        events.on('ready', second);

        events.emit('ready', fakeHandle);

        expect(second).toHaveBeenCalledTimes(1);
        expect(error).toHaveBeenCalled();
        error.mockRestore();
    });
});

describe('what the handle says about the game', () => {
    it('names the backend that is drawing', () => {
        const { store } = createTestGame();

        expect(createGameHandle(store).getBackend()).toBe(store.get('screen').renderer.capabilities.backend);
    });

    it('counts the running scenes, and every drawing in their trees, nested ones included', () => {
        const { store } = createTestGame();
        const Child = () => {
            createSprite({ width: 4, height: 4 });
            createSprite({ width: 4, height: 4, visible: false });
        };
        startTestScene(store, 'Level', () => {
            createSprite({ width: 8, height: 8 });
            useSpawn(Child)();
            return createScene();
        });
        startTestScene(store, 'Hud', () => {
            createSprite({ width: 8, height: 8 });
            return createScene();
        });

        const handle = createGameHandle(store);
        expect(handle.getSceneCount()).toBe(2);
        // One in the level, two in its child (the hidden one counts), one in the HUD.
        expect(handle.getDrawableCount()).toBe(4);
    });

    it('averages the frame rate, and a pause or a slow timeScale do not change it', () => {
        const { store } = createTestGame({}, createFakeCanvas());
        startTestScene(store, 'Only', () => createScene());
        const handle = createGameHandle(store);
        const ctx = createFrameContext();
        let now = 0;
        const frames = (count: number, ms: number) => {
            for (let i = 0; i < count; i++) {
                const prev = now;
                now += ms;
                tick(store, ctx, now, prev);
            }
        };

        expect(handle.getFps()).toBe(0);

        frames(200, 1000 / 60);
        expect(handle.getFps()).toBeCloseTo(60, 3);

        // It measures the machine, not the game: slow motion drawn at 60 frames a second is 60.
        store.setState('loop', { ...store.get('loop'), timeScale: 0.25 });
        frames(50, 1000 / 60);
        expect(handle.getFps()).toBeCloseTo(60, 3);

        // And a frozen game still draws: if the machine slows down under the pause menu, it shows.
        handle.pause();
        frames(300, 1000 / 30);
        expect(handle.getFps()).toBeCloseTo(30, 1);
    });

    it('shows a drop in the frame rate, but does not jump to one slow frame', () => {
        const { store } = createTestGame({}, createFakeCanvas());
        startTestScene(store, 'Only', () => createScene());
        const handle = createGameHandle(store);
        const ctx = createFrameContext();
        let now = 0;
        const frame = (ms: number) => {
            const prev = now;
            now += ms;
            tick(store, ctx, now, prev);
        };

        for (let i = 0; i < 200; i++) frame(1000 / 60);
        frame(100);
        const afterOneHitch = handle.getFps();
        expect(afterOneHitch).toBeLessThan(60);
        expect(afterOneHitch).toBeGreaterThan(50);

        for (let i = 0; i < 200; i++) frame(1000 / 30);
        expect(handle.getFps()).toBeCloseTo(30, 1);
    });
});
