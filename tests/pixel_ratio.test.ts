import { afterEach, describe, expect, it } from 'bun:test';
import { fitCanvas } from '../src/DOM/fit_canvas';
import { screenSizeOf, resolvePixelRatio } from '../src/DOM/screen_size';
import { cleanGameOptions } from '../src/game/bootstrap/clean_gameoptions';
import { createGameHandle } from '../src/game/handle/create_game_handle';
import { fillFrameContext } from '../src/game/loop/fill_frame_context';
import { createScene } from '../src/scene/create_scene';
import { usePointer } from '../src/hooks/input/use_pointer';
import { createTestGame, startTestScene } from './helpers/test_game';
import type { TCanvasOptions } from '../src/DOM';
import type { TFrameContext } from '../src/render';
import type { TPointerInfo } from '../src/input';

/**
 * A canvas inside a container of `space`, the way `fitCanvas` measures one. Its bounding box is the
 * CSS size the fit writes, so the pointer reads what a browser would.
 */
const placedCanvas = (space = { width: 1000, height: 1000 }): HTMLCanvasElement => {
    const style = {} as CSSStyleDeclaration;
    const canvas = Object.assign(new EventTarget(), {
        width: 300,
        height: 150,
        style,
        parentElement: { clientWidth: space.width, clientHeight: space.height },
        getBoundingClientRect: () => ({ left: 0, top: 0, width: parseFloat(style.width), height: parseFloat(style.height) }),
    });
    return canvas as unknown as HTMLCanvasElement;
};

/**
 * `fitCanvas` compares the container with `document.body`, and a test has no page.
 */
const withPage = (devicePixelRatio = 1): void => {
    (globalThis as Record<string, unknown>).document = { body: {} };
    (globalThis as Record<string, unknown>).window = { devicePixelRatio, innerWidth: 1000, innerHeight: 1000 };
};

afterEach(() => {
    delete (globalThis as Record<string, unknown>).document;
    delete (globalThis as Record<string, unknown>).window;
});

const fit = (canvas: HTMLCanvasElement, options: Partial<TCanvasOptions>): void =>
    fitCanvas(canvas, { width: 320, height: 240, ...options });

describe('pixelRatio: the canvas', () => {
    it('draws exactly the game at 1, as before it existed', () => {
        withPage();
        const canvas = placedCanvas();
        fit(canvas, {});

        expect([canvas.width, canvas.height]).toEqual([320, 240]);
        expect(screenSizeOf(canvas)).toEqual({ width: 320, height: 240, pixelRatio: 1 });
    });

    it('multiplies the buffer and nothing else', () => {
        withPage();
        const canvas = placedCanvas();
        fit(canvas, { pixelRatio: 2 });

        expect([canvas.width, canvas.height]).toEqual([640, 480]);
        // The size on screen and the game's own size are the ones asked for.
        expect([canvas.style.width, canvas.style.height]).toEqual(['320px', '240px']);
        expect(screenSizeOf(canvas)).toEqual({ width: 320, height: 240, pixelRatio: 2 });
    });

    it('scales on screen the same way whatever the ratio', () => {
        withPage();
        const canvas = placedCanvas({ width: 1000, height: 1000 });
        fit(canvas, { pixelRatio: 2, scaling: 'integer' });

        // 3x fits in 1000: the CSS is the game at 3x, the buffer the game at 2x.
        expect([canvas.style.width, canvas.style.height]).toEqual(['960px', '720px']);
        expect([canvas.width, canvas.height]).toEqual([640, 480]);
    });

    it('rounds a fractional buffer, and remembers the game size rather than dividing it back', () => {
        withPage();
        const canvas = placedCanvas();
        fitCanvas(canvas, { width: 255, height: 101, pixelRatio: 1.5 });

        expect([canvas.width, canvas.height]).toEqual([383, 152]);
        expect(screenSizeOf(canvas)).toEqual({ width: 255, height: 101, pixelRatio: 1.5 });
    });

    it("follows the screen's density with 'device'", () => {
        withPage(3);
        const canvas = placedCanvas();
        fit(canvas, { pixelRatio: 'device' });

        expect([canvas.width, canvas.height]).toEqual([960, 720]);
        expect(screenSizeOf(canvas).pixelRatio).toBe(3);
    });

    it("treats an unusable density as 1 instead of drawing nothing", () => {
        withPage(Number.NaN);
        expect(resolvePixelRatio('device')).toBe(1);
    });

    it('takes a canvas no fit has touched at its word', () => {
        const canvas = { width: 64, height: 32 } as HTMLCanvasElement;
        expect(screenSizeOf(canvas)).toEqual({ width: 64, height: 32, pixelRatio: 1 });
    });
});

describe('pixelRatio: the option', () => {
    it('defaults to 1', () => {
        expect(cleanGameOptions({ width: 320, height: 240 }).pixelRatio).toBe(1);
    });

    it("keeps 'device' as a request", () => {
        expect(cleanGameOptions({ width: 320, height: 240, pixelRatio: 'device' }).pixelRatio).toBe('device');
    });

    it('refuses a ratio that could not draw', () => {
        for (const bad of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
            expect(() => cleanGameOptions({ width: 320, height: 240, pixelRatio: bad })).toThrow('pixelRatio');
        }
    });
});

describe('pixelRatio: the game keeps measuring in its own pixels', () => {
    /**
     * A game fitted at ratio 2 on a canvas shown at 1:1 CSS.
     */
    const doubled = () => {
        withPage();
        const canvas = placedCanvas();
        fit(canvas, { pixelRatio: 2 });
        return { canvas, ...createTestGame({ width: 320, height: 240, pixelRatio: 2 }, canvas) };
    };

    it('reports the game size, not the buffer, through the handle', () => {
        const { store, canvas } = doubled();
        const game = createGameHandle(store);

        expect(canvas.width).toBe(640);
        expect([game.getWidth(), game.getHeight()]).toEqual([320, 240]);
    });

    it('puts the pointer in game pixels', () => {
        const { store, canvas } = doubled();
        const seen: TPointerInfo[] = [];
        startTestScene(store, 'Level', () => {
            usePointer().onDown((info) => { seen.push(info); });
            return createScene();
        });

        canvas.dispatchEvent(Object.assign(new Event('pointerdown'), { clientX: 100, clientY: 50, button: 0, pointerId: 1 }));
        store.get('input').pointer.dispatch(store);

        expect(seen).toHaveLength(1);
        // Read off the buffer this would be 200, 100: twice as far, because the buffer is twice the game.
        expect([seen[0].screenX, seen[0].screenY]).toEqual([100, 50]);
    });

    it('hands the renderer the ratio with the frame', () => {
        const { store } = doubled();
        startTestScene(store, 'Level', () => createScene());
        const ctx: TFrameContext = { passes: [{}], time: 0, progress: 0, phase: 0 };

        fillFrameContext(store, ctx);

        expect(ctx.pixelRatio).toBe(2);
    });
});
