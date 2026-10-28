import { afterEach, describe, expect, it } from 'bun:test';
import { computeCanvasLayout } from '../src/DOM/canvas_layout';
import { fitCanvas } from '../src/DOM/fit_canvas';

/**
 * `scaling: 'integer'` counts its whole multiple in the screen's own pixels. On a screen at 125% a
 * CSS 3× is 3.75 of them, and painted with nearest neighbour a game pixel came out 3 wide in some
 * columns and 4 in others: measured in Chromium and WebKit at 1.25, 1.5 and 1.75, 118 stripes of
 * one width and 40 of another where the game drew them all the same.
 */

/** How many of the screen's pixels one game pixel is painted across. */
const screenPixelsPer = (layout: { cssWidth: number; bufferWidth: number }, density: number): number =>
    layout.cssWidth * density / layout.bufferWidth;

describe('integer scaling on screens of every density', () => {
    it('is the same as before on a density of 1', () => {
        const layout = computeCanvasLayout(160, 120, 1000, 700, 'integer', 'both', 1);
        expect(layout).toEqual({ bufferWidth: 160, bufferHeight: 120, cssWidth: 800, cssHeight: 600, scale: 5 });
    });

    it.each([
        [1.25, 7, 896, 672],
        [1.5, 8, 853.3333333333334, 640],
        [1.75, 10, 914.2857142857143, 685.7142857142857],
        [2, 11, 880, 660],
    ])('paints a game pixel a whole number of the screen\'s pixels at %p: %p of them', (density, whole, cssWidth, cssHeight) => {
        const layout = computeCanvasLayout(160, 120, 1000, 700, 'integer', 'both', density);
        expect(screenPixelsPer(layout, density)).toBeCloseTo(whole, 9);
        expect(layout.cssWidth).toBeCloseTo(cssWidth, 9);
        expect(layout.cssHeight).toBeCloseTo(cssHeight, 9);
        // And still fits.
        expect(layout.cssWidth).toBeLessThanOrEqual(1000);
        expect(layout.cssHeight).toBeLessThanOrEqual(700);
    });

    it('keeps a free side on whole screen pixels too, and inside the container', () => {
        const density = 1.25;
        const layout = computeCanvasLayout(160, 120, 1000, 700, 'integer', 'height', density);
        expect(layout.bufferHeight).toBe(120);
        expect(layout.bufferWidth).toBe(178);
        expect(screenPixelsPer(layout, density)).toBeCloseTo(7, 9);
        expect(layout.cssWidth).toBeLessThanOrEqual(1000);
    });

    it('falls back to the exact fit below 1×, as it did', () => {
        const layout = computeCanvasLayout(640, 480, 500, 500, 'integer', 'both', 2);
        expect(layout.scale).toBeCloseTo(500 / 640, 9);
    });

    it('falls back to the exact fit when not even one screen pixel a game pixel fits', () => {
        // Zoomed out to 80%: 1.1 CSS pixels are 0.88 of the screen's.
        const layout = computeCanvasLayout(100, 100, 110, 110, 'integer', 'both', 0.8);
        expect(layout.scale).toBeCloseTo(1.1, 9);
    });

    it('leaves contain, fill and none as they were', () => {
        expect(computeCanvasLayout(160, 120, 1000, 700, 'contain', 'both', 1.25).scale).toBeCloseTo(700 / 120, 9);
        expect(computeCanvasLayout(160, 120, 1000, 700, 'fill', 'both', 1.25).cssWidth).toBe(1000);
        expect(computeCanvasLayout(160, 120, 1000, 700, 'none', 'both', 1.25).cssWidth).toBe(160);
    });
});

describe('fitting a canvas on a screen at 125%', () => {
    afterEach(() => {
        delete (globalThis as Record<string, unknown>).document;
        delete (globalThis as Record<string, unknown>).window;
    });

    it('reads the screen\'s density and paints 7 of its pixels a game pixel, leaving the buffer alone', () => {
        (globalThis as Record<string, unknown>).document = { body: {} };
        (globalThis as Record<string, unknown>).window = { devicePixelRatio: 1.25, innerWidth: 1000, innerHeight: 1000 };
        const style = {} as CSSStyleDeclaration;
        const canvas = { width: 300, height: 150, style, parentElement: { clientWidth: 1000, clientHeight: 700 } } as unknown as HTMLCanvasElement;

        fitCanvas(canvas, { width: 160, height: 120, scaling: 'integer' });

        expect([canvas.width, canvas.height]).toEqual([160, 120]);
        expect([style.width, style.height]).toEqual(['896px', '672px']);
    });
});
