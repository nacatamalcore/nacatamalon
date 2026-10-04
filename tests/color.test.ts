import { describe, expect, it } from 'bun:test';
import { CSS_NAMED_COLORS } from '../src/color/css_named_color_values';
import { fromCss } from '../src/color/from_css';
import { getColor } from '../src/color/get_color';
import { createTestGame } from './helpers/test_game';

/**
 * What a browser answers for each of these, taken from its own CSS parser and pinned here.
 *
 * The whole point of the table is that the engine agrees with the browser without asking it, so
 * the only thing worth testing is exactly that agreement. The full sweep over all 150 names lives
 * in the browser check; this is the subset that would catch a table that drifted.
 */
const BROWSER = {
    white: { r: 1, g: 1, b: 1, a: 1 },
    black: { r: 0, g: 0, b: 0, a: 1 },
    red: { r: 1, g: 0, b: 0, a: 1 },
    skyblue: { r: 0x87 / 255, g: 0xce / 255, b: 0xeb / 255, a: 1 },
    darkviolet: { r: 0x94 / 255, g: 0x00 / 255, b: 0xd3 / 255, a: 1 },
    rebeccapurple: { r: 0x66 / 255, g: 0x33 / 255, b: 0x99 / 255, a: 1 },
    gray: { r: 0x80 / 255, g: 0x80 / 255, b: 0x80 / 255, a: 1 },
    grey: { r: 0x80 / 255, g: 0x80 / 255, b: 0x80 / 255, a: 1 },
    orange: { r: 1, g: 0xa5 / 255, b: 0, a: 1 },
    navy: { r: 0, g: 0, b: 0x80 / 255, a: 1 },
} as const;

const close = (got: { r: number; g: number; b: number; a: number }, want: { r: number; g: number; b: number; a: number }) => {
    // A browser answers through 8-bit channels, so agreement means within half a step of 1/255.
    const tolerance = 1 / 510 + 1e-6;
    expect(Math.abs(got.r - want.r)).toBeLessThanOrEqual(tolerance);
    expect(Math.abs(got.g - want.g)).toBeLessThanOrEqual(tolerance);
    expect(Math.abs(got.b - want.b)).toBeLessThanOrEqual(tolerance);
    expect(Math.abs(got.a - want.a)).toBeLessThanOrEqual(tolerance);
};

describe('the named colour table', () => {
    it('holds every name the type offers', () => {
        expect(Object.keys(CSS_NAMED_COLORS)).toHaveLength(150);
    });

    it('agrees with the browser, name by name', () => {
        for (const [name, want] of Object.entries(BROWSER)) close(fromCss(name), want);
    });

    it('reads a name with stray spaces or capitals', () => {
        close(fromCss('  SkyBlue  '), BROWSER.skyblue);
        close(fromCss('RED'), BROWSER.red);
    });

    it('gives `transparent` its zero alpha, which a hex number cannot carry', () => {
        expect(fromCss('transparent')).toEqual({ r: 0, g: 0, b: 0, a: 0 });
    });
});

describe('fromCss', () => {
    it('reads rgb() with commas, spaces, percentages and a slashed alpha', () => {
        close(fromCss('rgb(255, 0, 0)'), { r: 1, g: 0, b: 0, a: 1 });
        close(fromCss('rgb(0 128 255)'), { r: 0, g: 128 / 255, b: 1, a: 1 });
        close(fromCss('rgba(10, 20, 30, 0.5)'), { r: 10 / 255, g: 20 / 255, b: 30 / 255, a: 0.5 });
        close(fromCss('rgb(0 128 255 / 25%)'), { r: 0, g: 128 / 255, b: 1, a: 0.25 });
        close(fromCss('rgb(100%, 0%, 50%)'), { r: 1, g: 0, b: 0.5, a: 1 });
    });

    it('reads hsl(), including hues that wrap', () => {
        close(fromCss('hsl(0, 100%, 50%)'), { r: 1, g: 0, b: 0, a: 1 });
        close(fromCss('hsl(210 50% 40%)'), { r: 0.2, g: 0.4, b: 0.6, a: 1 });
        close(fromCss('hsla(120, 100%, 25%, 0.5)'), { r: 0, g: 0.5, b: 0, a: 0.5 });
        close(fromCss('hsl(-30, 100%, 50%)'), fromCss('hsl(330, 100%, 50%)'));
        close(fromCss('hsl(390, 100%, 50%)'), fromCss('hsl(30, 100%, 50%)'));
    });

    it('clamps out-of-range channels the way CSS does, instead of refusing them', () => {
        close(fromCss('rgb(300, 0, 0)'), { r: 1, g: 0, b: 0, a: 1 });
        expect(fromCss('rgba(0, 0, 0, 5)').a).toBe(1);
        expect(fromCss('rgb(-20, 0, 0)').r).toBe(0);
    });

    it('still takes hex strings', () => {
        close(fromCss('#fff'), { r: 1, g: 1, b: 1, a: 1 });
        close(fromCss('#00ff0080'), { r: 0, g: 1, b: 0, a: 0x80 / 255 });
    });

    it('throws on anything it does not understand', () => {
        for (const value of ['nosuchcolor', 'rgb(1,2)', 'hsl(a, b%, c%)', 'rgb(1,2,3,4,5)', '', 'rgb 1 2 3']) {
            expect(() => fromCss(value)).toThrow(/Invalid CSS color string/);
        }
    });

    it('needs no document, which is the reason it was rewritten', () => {
        expect(typeof globalThis.document).toBe('undefined');
        expect(getColor('white')).toEqual({ r: 1, g: 1, b: 1, a: 1 });
    });
});

describe('the renderer follows the game settings', () => {
    it('hears a change of smooth, and only that', () => {
        const { store, renderer } = createTestGame({ smooth: false });

        // The same wiring `createGame` sets up, which cannot be exercised here: it needs a page.
        store.subscribe('config', (config) => config.smooth, (smooth) => renderer.setSmooth(smooth));

        store.setState('config', { smooth: true });
        expect(renderer.smoothCalls).toEqual([true]);

        // Writing the same value again is not a change.
        store.setState('config', { smooth: true });
        expect(renderer.smoothCalls).toEqual([true]);

        // Neither is writing something else.
        store.setState('config', { background: { r: 1, g: 0, b: 0, a: 1 } });
        expect(renderer.smoothCalls).toEqual([true]);

        store.setState('config', { smooth: false });
        expect(renderer.smoothCalls).toEqual([true, false]);
    });
});
