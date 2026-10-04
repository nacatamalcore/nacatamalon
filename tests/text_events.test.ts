import { describe, expect, it } from 'bun:test';
import { createScene } from '../src/scene/create_scene';
import { createSprite } from '../src/gameobjects/sprite/create_sprite';
import { createText } from '../src/gameobjects/text/create_text';
import { useSpawn } from '../src/hooks/spawn/use_spawn';
import { useCamera2d } from '../src/hooks/camera/use_camera_2d';
import { useScreenSpace } from '../src/hooks/camera/use_screen_space';
import { destroy, flushDestroyed } from '../src/destroy';
import { listen } from '../src/events';
import { pickTargets } from '../src/input/pick_targets';
import { createFakeCanvas, createTestGame, startTestScene } from './helpers/test_game';
import { createTestFont } from './helpers/test_font';
import type { TText, TTextOptions } from '../src/gameobjects/text';

const at = (x: number, y: number, rotation = 0, scale = 1) => ({ x, y, rotation, scaleX: scale, scaleY: scale });

const fire = (canvas: HTMLCanvasElement, type: string, clientX = 0, clientY = 0): void => {
    canvas.dispatchEvent(Object.assign(new Event(type), { clientX, clientY, button: 0, pointerId: 1 }));
};

/**
 * A game on a 480x320 canvas, with helpers to click, hover and log. The test font is 8 px tall:
 * 'AB D' is A (8) + 1 + B (8) + 1 + space (6) + 1 + D (8) = 33 px wide.
 */
const textGame = () => {
    const canvas = createFakeCanvas(480, 320);
    const { store } = createTestGame({}, canvas);
    const font = createTestFont();
    const log: string[] = [];
    const frame = () => store.get('input').pointer.dispatch(store);
    const click = (x: number, y: number) => { fire(canvas, 'pointerdown', x, y); fire(canvas, 'pointerup', x, y); frame(); };
    const hover = (x: number, y: number) => { fire(canvas, 'pointermove', x, y); frame(); };
    const text = (options: Partial<TTextOptions>) => createText({ text: 'AB D', font, transform: at(100, 100), ...options });
    return { store, canvas, font, log, frame, click, hover, text };
};

describe('text events', () => {
    it('click anywhere inside the block, including the gap between letters and a space', () => {
        const game = textGame();
        startTestScene(game.store, 'Menu', () => { game.text({ onClick: () => { game.log.push('click'); } }); return createScene(); });

        game.click(104, 104);   // inside A
        game.click(108.5, 104); // the tracking gap between A and B
        game.click(120, 104);   // inside the space
        game.click(140, 104);   // past the end: 100 + 33 = 133
        game.click(104, 110);   // below: the block is 8 tall

        expect(game.log).toEqual(['click', 'click', 'click']);
    });

    it('follow the anchor, the turn and the scale of the block', () => {
        const game = textGame();
        startTestScene(game.store, 'Menu', () => {
            // Centred on 240, 160 and twice as big: the block covers x 207..273 and y 152..168.
            game.text({ anchor: { x: 0.5, y: 0.5 }, transform: at(240, 160, 0, 2), onClick: () => { game.log.push('scaled'); } });
            // Turned a quarter around its top-left corner at 100, 200: it now runs downwards, to the
            // left of x 100.
            game.text({ transform: at(100, 200, Math.PI / 2), onClick: () => { game.log.push('turned'); } });
            return createScene();
        });

        game.click(210, 155);
        game.click(275, 160);
        game.click(96, 225);
        game.click(120, 204);

        expect(game.log).toEqual(['scaled', 'turned']);
    });

    it('go over and out with the block, and show the hand only when clickable', () => {
        const game = textGame();
        startTestScene(game.store, 'Menu', () => {
            game.text({ onPointerOver: () => { game.log.push('over'); }, onPointerOut: () => { game.log.push('out'); }, onClick: () => {} });
            game.text({ transform: at(100, 200), onPointerOver: () => {} });
            return createScene();
        });

        game.hover(104, 104);
        expect(game.canvas.style.cursor).toBe('pointer');
        game.hover(120, 104);   // across the space: still over, no out and in again
        game.hover(300, 300);
        game.hover(104, 204);
        expect(game.canvas.style.cursor).toBe('');

        expect(game.log).toEqual(['over', 'out']);
    });

    it('list a text once among the hits, not once per letter', () => {
        const game = textGame();
        let label!: TText;
        startTestScene(game.store, 'Menu', () => { label = game.text({}); return createScene(); });

        expect(pickTargets(game.store, 104, 104)).toEqual([label]);
    });

    it('take their place in the draw order against sprites', () => {
        const game = textGame();
        const tint = { r: 1, g: 1, b: 1, a: 1 };
        startTestScene(game.store, 'Menu', () => {
            createSprite({ width: 200, height: 200, tint, transform: at(100, 100), onClick: () => { game.log.push('sprite'); } });
            game.text({ zIndex: 5, onClick: () => { game.log.push('text on top'); } });
            game.text({ transform: at(40, 40), zIndex: -5, onClick: () => { game.log.push('text below'); } });
            return createScene();
        });

        game.click(104, 104);
        game.click(44, 44);

        // At 44, 44 the text is under the sprite, which covers 0..200: the sprite gets it.
        expect(game.log).toEqual(['text on top', 'sprite']);
    });

    it('work through a camera and in screen space', () => {
        const game = textGame();
        const Hud = () => { useScreenSpace(); game.text({ transform: at(10, 10), onClick: () => { game.log.push('hud'); } }); };
        startTestScene(game.store, 'Menu', () => {
            useCamera2d({ x: 1000, y: 0 });
            game.text({ transform: at(1100, 100), onClick: () => { game.log.push('world'); } });
            useSpawn(Hud)();
            return createScene();
        });

        game.click(104, 104);
        game.click(14, 14);

        expect(game.log).toEqual(['world', 'hud']);
    });

    it('cannot be touched while there is nothing drawn: font loading, or no text', () => {
        const game = textGame();
        const loading = { ...createTestFont('loading'), status: 'loading' as const, meta: null };
        startTestScene(game.store, 'Menu', () => {
            createText({ text: 'AB', font: loading, transform: at(100, 100), onClick: () => { game.log.push('loading'); } });
            game.text({ text: '', transform: at(300, 100), onClick: () => { game.log.push('empty'); } });
            return createScene();
        });

        game.click(104, 104);
        game.click(300, 100);

        expect(game.log).toEqual([]);
    });

    it('are forgotten when the text is destroyed', () => {
        const game = textGame();
        let label!: TText;
        startTestScene(game.store, 'Menu', () => { label = game.text({ onClick: () => { game.log.push('click'); } }); return createScene(); });

        destroy(label);
        flushDestroyed(game.store);
        game.click(104, 104);

        expect(game.log).toEqual([]);
    });

    it('can be connected later with listen, adding to the ones in the options', () => {
        const game = textGame();
        let label!: TText;
        startTestScene(game.store, 'Menu', () => { label = game.text({ onClick: () => { game.log.push('options'); } }); return createScene(); });

        listen(label, { onClick: () => { game.log.push('listen'); } });
        game.click(104, 104);

        expect(game.log).toEqual(['options', 'listen']);
    });

    it('leave the text as plain data', () => {
        const game = textGame();
        let label!: TText;
        startTestScene(game.store, 'Menu', () => { label = game.text({ onClick: () => {}, onPointerOver: () => {} }); return createScene(); });

        expect(Object.values(label).some((value) => typeof value === 'function')).toBe(false);
    });
});
