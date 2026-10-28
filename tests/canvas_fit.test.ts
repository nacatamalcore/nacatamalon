import { afterEach, describe, expect, it } from 'bun:test';
import { createCanvas } from '../src/DOM/create_canvas';
import { screenSizeOf } from '../src/DOM/screen_size';
import { editorHandleOf, openHost } from '../src/game/handle/editor_handle_of';
import type { TGameInstance } from '../src/game/types/t_game_instance';
import { createTestGame } from './helpers/test_game';

/**
 * A canvas fitted another way while a host asks, and back: what an editor does to look at a level
 * through the whole of its window, where the game keeps its own resolution.
 */

/** A page with a container of `space`, and a canvas already in it for `createCanvas` to adopt. */
const pageWith = (space = { width: 1200, height: 600 }) => {
    class FakeCanvas extends EventTarget {
        width = 300;
        height = 150;
        id = '';
        style = {} as CSSStyleDeclaration;
        parentElement = { clientWidth: space.width, clientHeight: space.height };
    }
    const doc = Object.assign(new EventTarget(), { body: {}, documentElement: {}, fullscreenElement: null });
    const globals = globalThis as Record<string, unknown>;
    globals.HTMLCanvasElement = FakeCanvas;
    globals.document = doc;
    globals.window = Object.assign(new EventTarget(), { devicePixelRatio: 2, innerWidth: space.width, innerHeight: space.height, addEventListener() {}, removeEventListener() {} });
    globals.ResizeObserver = class { observe() {} disconnect() {} };
    globals.requestAnimationFrame = () => 0;
    globals.cancelAnimationFrame = () => {};
    return new FakeCanvas() as unknown as HTMLCanvasElement;
};

afterEach(() => {
    for (const name of ['HTMLCanvasElement', 'document', 'window', 'ResizeObserver', 'requestAnimationFrame', 'cancelAnimationFrame']) {
        delete (globalThis as Record<string, unknown>)[name];
    }
});

describe('fitting the canvas another way', () => {
    it('lays the host\'s fit over the game\'s, and puts the game\'s back', () => {
        const canvas = pageWith();
        const screen = createCanvas(canvas, { width: 256, height: 240, scaling: 'integer' });
        expect(screenSizeOf(canvas)).toMatchObject({ width: 256, height: 240 });
        // 2.5×: the page's density is 2, and `integer` counts in the screen's pixels, 5 of them.
        expect(canvas.style.width).toBe('640px');

        // The whole container, drawn at the screen's density: a level seen through the window.
        screen.setFit({ keep: 'none', pixelRatio: 'device' });
        expect(screenSizeOf(canvas)).toEqual({ width: 1200, height: 600, pixelRatio: 2 });
        expect([canvas.width, canvas.height]).toEqual([2400, 1200]);
        expect(canvas.style.width).toBe('1200px');

        // Only what it names: the game's own scaling stays.
        screen.setFit({ pixelRatio: 'device' });
        expect(screenSizeOf(canvas)).toMatchObject({ width: 256, height: 240, pixelRatio: 2 });

        screen.setFit(null);
        expect(screenSizeOf(canvas)).toEqual({ width: 256, height: 240, pixelRatio: 1 });
        expect([canvas.width, canvas.height]).toEqual([256, 240]);
        expect(canvas.style.width).toBe('640px');
    });

    it('is asked for through the editor\'s handle, and is nothing where there is no page to fit', async () => {
        const asked: unknown[] = [];
        const { store } = createTestGame();
        store.setState('screen', { setFit: (fit) => asked.push(fit) });
        const instance: TGameInstance = { destroy: () => {}, on: () => () => {} };
        openHost(instance).resolve(store);
        const handle = await editorHandleOf(instance);
        handle.setCanvasFit({ keep: 'none', pixelRatio: 'device' });
        handle.setCanvasFit(null);
        expect(asked).toEqual([{ keep: 'none', pixelRatio: 'device' }, null]);

        // A game with no page (a test, a capture) has nothing to fit: asked, and nothing happens.
        const bare = createTestGame().store;
        expect(bare.get('screen').setFit).toBeNull();
        const other: TGameInstance = { destroy: () => {}, on: () => () => {} };
        openHost(other).resolve(bare);
        expect(() => void editorHandleOf(other).then((h) => h.setCanvasFit({ keep: 'none' }))).not.toThrow();
    });
});
