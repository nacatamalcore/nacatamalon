import { afterEach, describe, expect, it } from 'bun:test';
import { windowOf, pageOf } from '../src/DOM/window_of';
import { fitCanvas } from '../src/DOM/fit_canvas';
import { createCanvasFullscreen } from '../src/DOM/fullscreen';
import { createFrameContext } from '../src/game/loop/create_frame_context';
import { tick } from '../src/game/loop/tick';
import { createScene } from '../src/scene/create_scene';
import { createFakeCanvas, createTestGame, startTestScene } from './helpers/test_game';

/**
 * A canvas in a window of its own, the way a host shows a game in a play window popped out of an
 * editor: its frames, its size, its density and its full screen are that window's, not the one the
 * engine was loaded in.
 */

/** A window of its own, which counts the frames it is asked for. */
const ownWindow = (fields: Record<string, unknown> = {}) => {
    const asked: Array<(now: number) => void> = [];
    const view = Object.assign(new EventTarget(), {
        closed: false,
        requestAnimationFrame: (callback: (now: number) => void) => asked.push(callback),
        cancelAnimationFrame: () => {},
        navigator: {},
        ...fields,
    });
    const page = Object.assign(new EventTarget(), { body: {}, documentElement: {}, fullscreenElement: null, defaultView: view });
    Object.assign(view, { document: page });
    return { view, page, asked };
};

/** A canvas that lives in that window. */
const canvasIn = (page: object, fields: Record<string, unknown> = {}): HTMLCanvasElement =>
    Object.assign(createFakeCanvas(), { ownerDocument: page, ...fields });

afterEach(() => {
    delete (globalThis as Record<string, unknown>).requestAnimationFrame;
});

describe('the window a canvas lives in', () => {
    it('is the one its page belongs to, and the global one for a canvas with no page', () => {
        const { view, page } = ownWindow();
        const canvas = canvasIn(page);
        expect(windowOf(canvas)).toBe(view as unknown as Window);
        expect(pageOf(canvas)).toBe(page as unknown as Document);
        expect(windowOf(createFakeCanvas())).toBe(globalThis as unknown as Window);
    });

    it('gives the loop its frames, not the window the engine was loaded in', () => {
        let global = 0;
        (globalThis as Record<string, unknown>).requestAnimationFrame = () => ++global;
        const { page, asked } = ownWindow();
        const { store } = createTestGame({}, canvasIn(page));
        startTestScene(store, 'Level', () => createScene());

        tick(store, createFrameContext(), 0, 0);
        expect(asked.length).toBe(1);
        // Its next frame comes from there too, while the other window is minimised and gives none.
        asked[0]!(16);
        expect(asked.length).toBe(2);
        expect(global).toBe(0);
    });

    it('stops the loop once that window is closed, which gives no more frames to draw into nothing', () => {
        const { view, page, asked } = ownWindow();
        const { store } = createTestGame({}, canvasIn(page));
        startTestScene(store, 'Level', () => createScene());
        tick(store, createFrameContext(), 0, 0);

        view.closed = true;
        asked[0]!(16);
        expect(asked.length).toBe(1);
    });

    it('fits the canvas to the density of the screen that window is on', () => {
        const { page } = ownWindow({ devicePixelRatio: 2, innerWidth: 640, innerHeight: 480 });
        const style = {} as CSSStyleDeclaration;
        const canvas = canvasIn(page, { width: 300, height: 150, style, parentElement: (page as { body: object }).body });
        fitCanvas(canvas, { width: 320, height: 240, scaling: 'integer', pixelRatio: 'device' });
        // Its own window is the room, and its screen draws two pixels for each: a buffer of 640.
        expect(canvas.width).toBe(640);
        expect([style.width, style.height]).toEqual(['640px', '480px']);
    });

    it('asks that page for full screen, and hears it end there', async () => {
        const { page } = ownWindow();
        const parent: Record<string, unknown> = { style: {} };
        parent.requestFullscreen = async () => {
            Object.assign(page, { fullscreenElement: parent });
            page.dispatchEvent(new Event('fullscreenchange'));
        };
        const fullscreen = createCanvasFullscreen(canvasIn(page, { parentElement: parent }), () => 'integer', () => {});

        expect(await fullscreen.enter('black')).toBe(true);
        expect(fullscreen.isActive()).toBe(true);
        // Esc in that window: its own page says it is over.
        Object.assign(page, { fullscreenElement: null });
        page.dispatchEvent(new Event('fullscreenchange'));
        expect(fullscreen.isActive()).toBe(false);
    });
});
