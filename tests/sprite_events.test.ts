import { describe, expect, it } from 'bun:test';
import { createScene } from '../src/scene/create_scene';
import { stopScene } from '../src/scene/stop_scene';
import { setScenePaused } from '../src/scene/pause_scene';
import { createSprite } from '../src/gameobjects/sprite/create_sprite';
import { destroy, flushDestroyed } from '../src/destroy';
import { createFakeCanvas, createTestGame, startTestScene } from './helpers/test_game';
import type { TSprite } from '../src/gameobjects/sprite/types/t_sprite';
import type { TSpriteOptions } from '../src/gameobjects/sprite/types';

const tint = { r: 1, g: 1, b: 1, a: 1 };

/**
 * A 40x40 sprite centred on `x`, `y`, with whatever else the test adds (events above all).
 */
const square = (x: number, y: number, extra: Partial<TSpriteOptions> = {}): TSprite =>
    createSprite({ width: 40, height: 40, tint, transform: { x, y, rotation: 0, scaleX: 1, scaleY: 1 }, ...extra });

const fire = (canvas: HTMLCanvasElement, type: string, clientX = 0, clientY = 0): void => {
    canvas.dispatchEvent(Object.assign(new Event(type), { clientX, clientY, button: 0, pointerId: 1 }));
};

/**
 * A game on a 480x320 canvas, a log to write events into, and a way to run the start of a frame.
 */
const eventsGame = () => {
    const canvas = createFakeCanvas(480, 320);
    const { store } = createTestGame({}, canvas);
    const log: string[] = [];
    const frame = () => store.get('input').pointer.dispatch(store);
    /**
     * Every event, logged as `<name> <event>`.
     */
    const logging = (name: string): Partial<TSpriteOptions> => ({
        onPointerOver: () => { log.push(`${name} over`); },
        onPointerOut: () => { log.push(`${name} out`); },
        onPointerMove: () => { log.push(`${name} move`); },
        onPointerDown: () => { log.push(`${name} down`); },
        onPointerUp: () => { log.push(`${name} up`); },
        onClick: () => { log.push(`${name} click`); },
    });
    const click = (x: number, y: number) => { fire(canvas, 'pointerdown', x, y); fire(canvas, 'pointerup', x, y); frame(); };
    return { store, canvas, log, frame, logging, click };
};

describe('sprite events', () => {
    it('leave the sprite itself untouched: nothing is added to it', () => {
        const { store } = eventsGame();
        let plain!: TSprite;
        let reacting!: TSprite;

        startTestScene(store, 'Level', () => {
            plain = square(0, 0);
            reacting = square(0, 0, { onClick: () => {}, onPointerOver: () => {} });
            return createScene();
        });

        expect(Object.keys(reacting).sort()).toEqual(Object.keys(plain).sort());
        expect(Object.values(reacting).some((value) => typeof value === 'function')).toBe(false);
    });

    it('click when pressed and released on the same sprite', () => {
        const { store, log, click } = eventsGame();
        startTestScene(store, 'Level', () => { square(100, 100, { onClick: () => { log.push('click'); } }); return createScene(); });

        click(100, 100);
        expect(log).toEqual(['click']);
    });

    it('do not click when the release happens somewhere else', () => {
        const { store, canvas, log, frame } = eventsGame();
        startTestScene(store, 'Level', () => {
            square(100, 100, { onClick: () => { log.push('a click'); } });
            square(300, 100, { onClick: () => { log.push('b click'); } });
            return createScene();
        });

        fire(canvas, 'pointerdown', 100, 100);
        fire(canvas, 'pointerup', 300, 100);
        frame();
        fire(canvas, 'pointerdown', 100, 100);
        fire(canvas, 'pointerup', 450, 300);
        frame();

        expect(log).toEqual([]);
    });

    it('go to the listening sprite on top, down and up included', () => {
        const { store, log, click, logging } = eventsGame();
        startTestScene(store, 'Level', () => {
            square(100, 100, logging('below'));
            square(100, 100, logging('above'));
            return createScene();
        });

        click(100, 100);
        expect(log.filter((line) => !line.endsWith('over'))).toEqual(['above down', 'above up', 'above click']);
    });

    it('pass through a sprite that does not listen', () => {
        const { store, log, click } = eventsGame();
        startTestScene(store, 'Level', () => {
            square(100, 100, { onClick: () => { log.push('button click'); } });
            // A glow drawn over the button, with no events of its own.
            square(100, 100, { zIndex: 5 });
            return createScene();
        });

        click(100, 100);
        expect(log).toEqual(['button click']);
    });

    it('do not fall through to the sprite below when the one on top listens to something else', () => {
        const { store, log, click } = eventsGame();
        startTestScene(store, 'Level', () => {
            square(100, 100, { onClick: () => { log.push('below click'); } });
            square(100, 100, { onPointerOver: () => {} });
            return createScene();
        });

        click(100, 100);
        expect(log).toEqual([]);
    });

    it('go over and out as the pointer moves in and away', () => {
        const { store, canvas, log, frame, logging } = eventsGame();
        startTestScene(store, 'Level', () => { square(100, 100, logging('button')); return createScene(); });

        fire(canvas, 'pointermove', 300, 300); frame();
        fire(canvas, 'pointermove', 100, 100); frame();
        fire(canvas, 'pointermove', 105, 100); frame();
        fire(canvas, 'pointermove', 300, 300); frame();

        expect(log).toEqual(['button over', 'button move', 'button out']);
    });

    it('go over when the sprite slides under a pointer that does not move', () => {
        const { store, canvas, log, frame } = eventsGame();
        let button!: TSprite;
        startTestScene(store, 'Level', () => {
            button = square(300, 100, { onPointerOver: () => { log.push('over'); } });
            return createScene();
        });

        fire(canvas, 'pointermove', 100, 100); frame();
        expect(log).toEqual([]);

        button.transform.x = 100;
        frame();
        expect(log).toEqual(['over']);
    });

    it('go out when the pointer leaves the game, and when the sprite is destroyed', () => {
        const { store, canvas, log, frame } = eventsGame();
        let a!: TSprite;
        startTestScene(store, 'Level', () => {
            a = square(100, 100, { onPointerOut: () => { log.push('a out'); } });
            square(300, 100, { onPointerOut: () => { log.push('b out'); } });
            return createScene();
        });

        fire(canvas, 'pointermove', 300, 100); frame();
        fire(canvas, 'pointerleave'); frame();

        fire(canvas, 'pointermove', 100, 100); frame();
        destroy(a);
        frame();
        flushDestroyed(store);

        expect(log).toEqual(['b out', 'a out']);
    });

    it('ignore a paused scene, which also stops covering the scene below', () => {
        const { store, log, click } = eventsGame();
        startTestScene(store, 'Level', () => { square(100, 100, { onClick: () => { log.push('level click'); } }); return createScene(); });
        startTestScene(store, 'Menu', () => { square(100, 100, { onClick: () => { log.push('menu click'); } }); return createScene(); });

        click(100, 100);
        setScenePaused(store, 'Menu', true);
        click(100, 100);

        expect(log).toEqual(['menu click', 'level click']);
    });

    it('are forgotten when their scene stops', () => {
        const { store, log, click } = eventsGame();
        startTestScene(store, 'Level', () => { square(100, 100, { onClick: () => { log.push('click'); } }); return createScene(); });

        stopScene(store, 'Level');
        click(100, 100);

        expect(log).toEqual([]);
    });

    it('follow the turn of the sprite', () => {
        const { store, log, click } = eventsGame();
        startTestScene(store, 'Level', () => {
            // 120 by 10, turned a quarter: it now stands upright.
            createSprite({ width: 120, height: 10, tint, transform: { x: 200, y: 160, rotation: Math.PI / 2, scaleX: 1, scaleY: 1 }, onClick: () => { log.push('click'); } });
            return createScene();
        });

        click(250, 160);
        click(200, 210);

        expect(log).toEqual(['click']);
    });

    it('show a hand over something clickable, and the normal cursor elsewhere', () => {
        const { store, canvas, frame } = eventsGame();
        startTestScene(store, 'Level', () => {
            square(100, 100, { onClick: () => {} });
            square(300, 100, { onPointerOver: () => {} });
            return createScene();
        });

        fire(canvas, 'pointermove', 100, 100); frame();
        expect(canvas.style.cursor).toBe('pointer');

        fire(canvas, 'pointermove', 300, 100); frame();
        expect(canvas.style.cursor).toBe('');

        fire(canvas, 'pointermove', 100, 100); frame();
        fire(canvas, 'pointermove', 450, 300); frame();
        expect(canvas.style.cursor).toBe('');
    });
});
