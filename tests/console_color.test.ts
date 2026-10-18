import { describe, expect, it } from 'bun:test';
import { consoleColor } from '../src/color/console_color';
import { getColor } from '../src/color/get_color';
import { COLOR_LEVELS } from '../src/post/builtin/color_levels';

describe('consoleColor', () => {
    it('moves each channel to the nearest step of the machine', () => {
        // #e8423f: 232, 66, 63 of 255 are 6.37, 1.81, 1.73 of 7, so steps 6, 2, 2.
        const color = consoleColor('#e8423f', COLOR_LEVELS.genesis);

        expect(color.r).toBeCloseTo(6 / 7, 10);
        expect(color.g).toBeCloseTo(2 / 7, 10);
        expect(color.b).toBeCloseTo(2 / 7, 10);
        expect(color.a).toBe(1);
    });

    it('takes what getColor takes, and a colour already made, alike', () => {
        const fromText = consoleColor('#e8423f', COLOR_LEVELS.genesis);

        expect(consoleColor(getColor('#e8423f'), COLOR_LEVELS.genesis)).toEqual(fromText);
        expect(consoleColor(0xe8423f, COLOR_LEVELS.genesis)).toEqual(fromText);
        expect(consoleColor('red', COLOR_LEVELS.genesis)).toEqual({ r: 1, g: 0, b: 0, a: 1 });
    });

    it('leaves alpha and the colour it was given as they were', () => {
        const given = { r: 0.5, g: 0.5, b: 0.5, a: 0.3 };
        const color = consoleColor(given, COLOR_LEVELS.genesis);

        expect(color.a).toBe(0.3);
        expect(given).toEqual({ r: 0.5, g: 0.5, b: 0.5, a: 0.3 });
        expect(color).not.toBe(given);
    });

    it('keeps a colour already on a step where it is, and the ends at the ends', () => {
        expect(consoleColor({ r: 3 / 7, g: 0, b: 1, a: 1 }, COLOR_LEVELS.genesis)).toEqual({ r: 3 / 7, g: 0, b: 1, a: 1 });
        expect(consoleColor({ r: -0.2, g: 1.4, b: 0.5, a: 1 }, COLOR_LEVELS.poster)).toEqual({ r: 0, g: 1, b: 2 / 3, a: 1 });
    });

    it('uses as many steps as it is told, never fewer than two', () => {
        expect(consoleColor({ r: 0.49, g: 0.51, b: 0.5, a: 1 }, 32).r).toBeCloseTo(15 / 31, 10);
        expect(consoleColor({ r: 0.4, g: 0.6, b: 0, a: 1 }, 1)).toEqual({ r: 0, g: 1, b: 0, a: 1 });
    });
});
