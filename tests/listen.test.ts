import { describe, expect, it, spyOn } from 'bun:test';
import { createScene } from '../src/scene/create_scene';
import { stopScene } from '../src/scene/stop_scene';
import { createSprite } from '../src/gameobjects/sprite/create_sprite';
import { useSpawn } from '../src/hooks/spawn/use_spawn';
import { useUpdate } from '../src/hooks/loop/use_update';
import { runHookUpdates } from '../src/game/loop/runHookUpdates';
import { destroy, flushDestroyed } from '../src/destroy';
import { listen } from '../src/events';
import { createFakeCanvas, createTestGame, startTestScene } from './helpers/test_game';
import type { TSprite } from '../src/gameobjects/sprite/types/t_sprite';
import type { TSpriteOptions } from '../src/gameobjects/sprite/types';

const tint = { r: 1, g: 1, b: 1, a: 1 };

const square = (x: number, y: number, extra: Partial<TSpriteOptions> = {}): TSprite =>
    createSprite({ width: 40, height: 40, tint, transform: { x, y, rotation: 0, scaleX: 1, scaleY: 1 }, ...extra });

const fire = (canvas: HTMLCanvasElement, type: string, clientX = 0, clientY = 0): void => {
    canvas.dispatchEvent(Object.assign(new Event(type), { clientX, clientY, button: 0, pointerId: 1 }));
};

const listenGame = () => {
    const canvas = createFakeCanvas(480, 320);
    const { store } = createTestGame({}, canvas);
    const log: string[] = [];
    const frame = () => store.get('input').pointer.dispatch(store);
    const click = (x: number, y: number) => { fire(canvas, 'pointerdown', x, y); fire(canvas, 'pointerup', x, y); frame(); };
    const hover = (x: number, y: number) => { fire(canvas, 'pointermove', x, y); frame(); };
    return { store, canvas, log, frame, click, hover };
};

describe('listen', () => {
    it('connects events to a sprite that was created without them', () => {
        const { store, log, click } = listenGame();
        let sprite!: TSprite;
        startTestScene(store, 'Level', () => { sprite = square(100, 100); return createScene(); });

        click(100, 100);
        listen(sprite, { onClick: () => { log.push('click'); } });
        click(100, 100);

        expect(log).toEqual(['click']);
    });

    it('works outside the scene body, from inside an update', () => {
        const { store, log, click } = listenGame();
        let sprite!: TSprite;
        const root = startTestScene(store, 'Level', () => {
            sprite = square(100, 100);
            let connected = false;
            useUpdate(() => {
                if (!connected) {
                    connected = true;
                    listen(sprite, { onClick: () => { log.push('click'); } });
                }
            });
            return createScene();
        });

        runHookUpdates(root, 0.016);
        click(100, 100);

        expect(log).toEqual(['click']);
    });

    it('adds to the events given in createSprite, which run first', () => {
        const { store, log, click, hover } = listenGame();
        let sprite!: TSprite;
        startTestScene(store, 'Level', () => {
            sprite = square(100, 100, { onClick: () => { log.push('from options'); }, onPointerOver: () => { log.push('over'); } });
            return createScene();
        });

        listen(sprite, { onClick: () => { log.push('from listen'); } });
        hover(100, 100);
        click(100, 100);

        expect(log).toEqual(['over', 'from options', 'from listen']);
    });

    it('removes only what its own call connected, however many times off is called', () => {
        const { store, log, click } = listenGame();
        let sprite!: TSprite;
        startTestScene(store, 'Level', () => { sprite = square(100, 100); return createScene(); });

        const offA = listen(sprite, { onClick: () => { log.push('a'); } });
        listen(sprite, { onClick: () => { log.push('b'); } });

        offA();
        offA();
        click(100, 100);

        expect(log).toEqual(['b']);
    });

    it('stops covering the sprite below once the last connection is gone, and says out if it was hovered', () => {
        const { store, log, click, hover } = listenGame();
        let top!: TSprite;
        startTestScene(store, 'Level', () => {
            square(100, 100, { onClick: () => { log.push('below click'); } });
            top = square(100, 100, { zIndex: 5 });
            return createScene();
        });

        const off = listen(top, { onPointerOver: () => { log.push('top over'); }, onPointerOut: () => { log.push('top out'); } });
        hover(100, 100);
        click(100, 100);
        off();
        click(100, 100);

        expect(log).toEqual(['top over', 'top out', 'below click']);
    });

    it('shows the hand while any connection is clickable', () => {
        const { store, canvas, hover, frame } = listenGame();
        let sprite!: TSprite;
        startTestScene(store, 'Level', () => { sprite = square(100, 100, { onPointerOver: () => {} }); return createScene(); });

        hover(100, 100);
        expect(canvas.style.cursor).toBe('');

        const off = listen(sprite, { onClick: () => {} });
        frame();
        expect(canvas.style.cursor).toBe('pointer');

        off();
        frame();
        expect(canvas.style.cursor).toBe('');
    });

    it('is forgotten when the scene stops, without calling out on a scene that is gone', () => {
        const { store, log, click, hover } = listenGame();
        let sprite!: TSprite;
        startTestScene(store, 'Level', () => { sprite = square(100, 100); return createScene(); });

        listen(sprite, { onClick: () => { log.push('click'); }, onPointerOut: () => { log.push('out'); } });
        hover(100, 100);
        stopScene(store, 'Level');
        click(100, 100);

        expect(log).toEqual([]);
    });

    it('is forgotten when the object the sprite belongs to is destroyed', () => {
        const { store, log, click } = listenGame();
        let sprite!: TSprite;
        const Coin = () => { sprite = square(100, 100); };
        let coin!: ReturnType<ReturnType<typeof useSpawn>>;
        startTestScene(store, 'Level', () => { coin = useSpawn(Coin)(); return createScene(); });

        listen(sprite, { onClick: () => { log.push('click'); } });
        destroy(coin);
        flushDestroyed(store);
        click(100, 100);

        expect(log).toEqual([]);
    });

    it('does nothing on a destroyed sprite, and says so once', () => {
        const { store, log, click } = listenGame();
        const warn = spyOn(console, 'warn').mockImplementation(() => {});
        warn.mockClear();
        let sprite!: TSprite;
        startTestScene(store, 'Level', () => { sprite = square(100, 100); return createScene(); });

        destroy(sprite);
        flushDestroyed(store);
        const off = listen(sprite, { onClick: () => { log.push('click'); } });
        listen(sprite, { onClick: () => { log.push('click'); } });
        off();
        click(100, 100);

        expect(log).toEqual([]);
        expect(warn.mock.calls.filter((call) => String(call[0]).includes('listen'))).toHaveLength(1);
        warn.mockRestore();
    });

    it('with no events, does not make the sprite start covering the one below', () => {
        const { store, log, click } = listenGame();
        let top!: TSprite;
        startTestScene(store, 'Level', () => {
            square(100, 100, { onClick: () => { log.push('below click'); } });
            top = square(100, 100, { zIndex: 5 });
            return createScene();
        });

        listen(top, {});
        click(100, 100);

        expect(log).toEqual(['below click']);
    });
});
