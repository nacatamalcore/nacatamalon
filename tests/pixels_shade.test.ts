import { describe, expect, it } from 'bun:test';
import { getColor } from '../src/color';
import { createPixels, fillDither, fillGradient, pixelsFromRows, shadeWithRamp } from '../src/pixels';
import type { TPixels } from '../src/pixels';

/**
 * The two passes that give flat colours some volume: a lit side and a shadowed one, and a pattern
 * between two colours.
 */

const DARK = '#100000';
const MID = '#800000';
const LIGHT = '#ff0000';
const RAMP = [DARK, MID, LIGHT];
const PALETTE = { d: DARK, m: MID, l: LIGHT, b: '#0000ff', B: '#000080' };

const rowsOf = (pixels: TPixels): string[] => {
    const names = new Map([['16,0,0,255', 'd'], ['128,0,0,255', 'm'], ['255,0,0,255', 'l'], ['0,0,255,255', 'b'], ['0,0,128,255', 'B'], ['0,0,0,0', '.']]);
    return Array.from({ length: pixels.height }, (_, y) => Array.from({ length: pixels.width }, (_, x) => {
        const at = (y * pixels.width + x) * 4;
        return names.get(Array.from(pixels.data.subarray(at, at + 4)).join(',')) ?? '?';
    }).join(''));
};

const draw = (rows: string[]): TPixels => pixelsFromRows(rows, PALETTE);

describe('shadeWithRamp', () => {
    it('lights the side facing the top left, and darkens the other', () => {
        expect(rowsOf(shadeWithRamp(draw(['.....', '.mmm.', '.mmm.', '.mmm.', '.....']), RAMP))).toEqual([
            '.....',
            '.llm.',
            '.lmd.',
            '.mdd.',
            '.....',
        ]);
    });

    it('takes the light from where it is told', () => {
        expect(rowsOf(shadeWithRamp(draw(['mmm', 'mmm', 'mmm']), RAMP, { light: { x: 1, y: 0 } }))).toEqual(['dml', 'dml', 'dml']);
        expect(rowsOf(shadeWithRamp(draw(['mmm', 'mmm', 'mmm']), RAMP, { light: { x: 0, y: 1 } }))).toEqual(['ddd', 'mmm', 'lll']);
    });

    it('ignores a side the light hardly comes from', () => {
        expect(rowsOf(shadeWithRamp(draw(['mmm', 'mmm', 'mmm']), RAMP, { light: { x: -1, y: 0.1 } }))).toEqual(['lmd', 'lmd', 'lmd']);
        // Half as much is still enough to count, on either side.
        expect(rowsOf(shadeWithRamp(draw(['mmm', 'mmm', 'mmm']), RAMP, { light: { x: -1, y: -0.5 } }))).toEqual(rowsOf(shadeWithRamp(draw(['mmm', 'mmm', 'mmm']), RAMP, { light: { x: -1, y: -1 } })));
        expect(rowsOf(shadeWithRamp(draw(['mmm', 'mmm', 'mmm']), RAMP, { light: { x: -1, y: 0.5 } }))).toEqual(rowsOf(shadeWithRamp(draw(['mmm', 'mmm', 'mmm']), RAMP, { light: { x: -1, y: 1 } })));
    });

    it('takes the length of the direction as nothing', () => {
        expect(rowsOf(shadeWithRamp(draw(['mmm']), RAMP, { light: { x: 40, y: 0 } }))).toEqual(['dml']);
    });

    it('leaves alone a pixel with an edge on both sides', () => {
        expect(rowsOf(shadeWithRamp(draw(['m']), RAMP))).toEqual(['m']);
        expect(rowsOf(shadeWithRamp(draw(['mm']), RAMP, { light: { x: -1, y: 0 } }))).toEqual(['ld']);
    });

    it('stops at the ends of a ramp', () => {
        expect(rowsOf(shadeWithRamp(draw(['lll']), RAMP, { light: { x: -1, y: 0 } }))).toEqual(['llm']);
        expect(rowsOf(shadeWithRamp(draw(['ddd']), RAMP, { light: { x: -1, y: 0 } }))).toEqual(['mdd']);
    });

    it('shades each colour along its own ramp, and leaves one in none of them', () => {
        const ramps = [[DARK, MID, LIGHT], ['#000080', '#0000ff']];

        expect(rowsOf(shadeWithRamp(draw(['mmbb']), ramps, { light: { x: -1, y: 0 } }))).toEqual(['lmbB']);
        expect(rowsOf(shadeWithRamp(draw(['bbb']), RAMP, { light: { x: -1, y: 0 } }))).toEqual(['bbb']);
    });

    it('takes the holes of a shape as edges too', () => {
        expect(rowsOf(shadeWithRamp(draw(['mmmmm', 'mm.mm', 'mmmmm']), RAMP, { light: { x: -1, y: 0 } }))).toEqual(['lmmmd', 'ld.ld', 'lmmmd']);
    });

    it('keeps alpha, and counts a see-through pixel as part of the shape', () => {
        const pixels = createPixels(2, 1);
        pixels.data.set([128, 0, 0, 40, 128, 0, 0, 255]);

        shadeWithRamp(pixels, RAMP, { light: { x: -1, y: 0 } });

        expect(Array.from(pixels.data)).toEqual([255, 0, 0, 40, 16, 0, 0, 255]);
    });

    it('looks at a region as if it were the whole picture', () => {
        const pixels = draw(['mmmm']);

        shadeWithRamp(pixels, RAMP, { light: { x: -1, y: 0 }, region: { x: 0, y: 0, width: 2, height: 1 } });

        expect(rowsOf(pixels)).toEqual(['ldmm']);
    });

    it('does nothing with a region off the picture or of no number', () => {
        for (const region of [{ x: 9, y: 0, width: 2, height: 1 }, { x: Number.NaN, y: 0, width: 2, height: 1 }]) {
            expect(rowsOf(shadeWithRamp(draw(['mm']), RAMP, { region }))).toEqual(['mm']);
        }
    });

    it('gives back the same picture', () => {
        const pixels = draw(['m']);
        expect(shadeWithRamp(pixels, RAMP)).toBe(pixels);
    });

    it('refuses what it could not use, before painting anything', () => {
        const pixels = draw(['mm']);

        expect(() => shadeWithRamp(pixels, [])).toThrow('there is no ramp');
        expect(() => shadeWithRamp(pixels, 'red' as never)).toThrow('there is no ramp');
        expect(() => shadeWithRamp(pixels, ['#ff0000'])).toThrow('a ramp has one colour');
        expect(() => shadeWithRamp(pixels, [RAMP, []])).toThrow('a ramp has no colours');
        expect(() => shadeWithRamp(pixels, [RAMP, 'red'] as never)).toThrow('a ramp is not a list');
        expect(() => shadeWithRamp(pixels, ['#ff0000', 'gren'])).toThrow("colour 1 of the ramp is 'gren'");
        expect(() => shadeWithRamp(pixels, RAMP, { light: { x: 0, y: 0 } })).toThrow('which is no direction');
        expect(() => shadeWithRamp(pixels, RAMP, { light: { x: Number.NaN, y: 1 } })).toThrow('which is no direction');
        expect(rowsOf(pixels)).toEqual(['mm']);
    });
});

describe('fillDither', () => {
    const RED = getColor('#ff0000');
    const BLUE = getColor('#0000ff');
    const countOfBlue = (pixels: TPixels): number => {
        let count = 0;
        for (let at = 0; at < pixels.data.length; at += 4) if (pixels.data[at + 2] === 255) count++;
        return count;
    };

    it('is all of one colour at the ends', () => {
        expect(countOfBlue(fillDither(createPixels(4, 4), 0, 0, 4, 4, RED, BLUE, 0))).toBe(0);
        expect(countOfBlue(fillDither(createPixels(4, 4), 0, 0, 4, 4, RED, BLUE, 1))).toBe(16);
    });

    it('takes as much of the second colour as it is asked, in sixteen steps', () => {
        for (let step = 0; step <= 16; step++) {
            expect(countOfBlue(fillDither(createPixels(4, 4), 0, 0, 4, 4, RED, BLUE, step / 16))).toBe(step);
        }
    });

    it('is half and half left to itself, one and one', () => {
        const pixels = fillDither(createPixels(4, 4), 0, 0, 4, 4, RED, BLUE);

        expect(countOfBlue(pixels)).toBe(8);
        for (let y = 0; y < 4; y++) {
            for (let x = 0; x < 4; x++) {
                const blue = pixels.data[(y * 4 + x) * 4 + 2] === 255;
                expect(blue).toBe((x + y) % 2 === 1);
            }
        }
    });

    it('puts its dots by where they are on the picture, so two patches meet with no seam', () => {
        const whole = fillDither(createPixels(8, 8), 0, 0, 8, 8, RED, BLUE, 0.3);
        const parts = createPixels(8, 8);
        fillDither(parts, 0, 0, 3, 8, RED, BLUE, 0.3);
        fillDither(parts, 3, 0, 5, 8, RED, BLUE, 0.3);

        expect(Array.from(parts.data)).toEqual(Array.from(whole.data));
    });

    it('lays its dots where a dithered gradient does', () => {
        // The middle row of a gradient of two bands is half way: half of each, by the same pattern.
        const gradient = fillGradient(createPixels(4, 17), { from: RED, to: BLUE, bands: 2, dither: true });
        const patch = fillDither(createPixels(4, 17), 0, 0, 4, 17, RED, BLUE, 0.5);
        const row = (pixels: TPixels): number[] => Array.from(pixels.data.subarray(8 * 4 * 4, 9 * 4 * 4));

        expect(row(patch)).toEqual(row(gradient));
    });

    it('cuts its rectangle to the picture, and writes alpha as it is', () => {
        const pixels = createPixels(2, 1);
        fillDither(pixels, -5, -5, 6, 6, RED, { r: 0, g: 0, b: 1, a: 0 }, 0);

        expect(Array.from(pixels.data)).toEqual([255, 0, 0, 255, 0, 0, 0, 0]);
        // A hole, where the second colour is transparent.
        fillDither(pixels, 0, 0, 2, 1, RED, { r: 0, g: 0, b: 1, a: 0 }, 1);
        expect(pixels.data[3]).toBe(0);
    });

    it('takes an amount past the ends as the end', () => {
        expect(countOfBlue(fillDither(createPixels(4, 4), 0, 0, 4, 4, RED, BLUE, 9))).toBe(16);
        expect(countOfBlue(fillDither(createPixels(4, 4), 0, 0, 4, 4, RED, BLUE, -1))).toBe(0);
    });

    it('refuses an amount that is no number', () => {
        expect(() => fillDither(createPixels(1, 1), 0, 0, 1, 1, RED, BLUE, Number.NaN)).toThrow('amount is NaN');
        expect(() => fillDither(createPixels(1, 1), 0, 0, 1, 1, RED, BLUE, '0.5' as never)).toThrow('amount is 0.5');
    });
});
