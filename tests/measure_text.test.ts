import { describe, expect, it, spyOn } from 'bun:test';
import * as msdf from '../src/loaders/font/msdf/generate_msdf';
import { createScene } from '../src/scene/create_scene';
import { createText } from '../src/gameobjects/text/create_text';
import { measureText } from '../src/layout/measure_text';
import { layoutText } from '../src/gameobjects/text/layout_text';
import { sizeOf } from '../src/layout/size_of';
import { newFont } from '../src/loaders/font/new_font';
import { createTestGame, startTestScene } from './helpers/test_game';
import { createTestFont, TEST_FONT_META } from './helpers/test_font';
import { createTestVectorFont } from './helpers/test_ttf';
import type { TTextStyle } from '../src/gameobjects/text';

/**
 * How big a text will be before there is one: the same block, measured the same way, as the text
 * `createText` would make, and the lines it would be set in.
 */

/** A text made in a scene with this font and style, measured both ways. */
const bothWays = (text: string, style: TTextStyle, vector: boolean) => {
    const { store } = createTestGame();
    let measured!: ReturnType<typeof measureText>;
    let made!: { width: number; height: number };
    startTestScene(store, 'Level', () => {
        const font = vector ? createTestVectorFont(store) : createTestFont();
        measured = measureText(text, { ...style, font });
        made = sizeOf(createText({ text, font, style }));
        return createScene();
    });
    return { measured, made };
};

describe('measureText', () => {
    it('measures with the font the engine carries, with no game at all', () => {
        // Two letters and a gap of one, as drawText writes them.
        expect(measureText('HH')).toEqual({ width: 17, height: 8, lines: ['HH'] });
        expect(measureText('HH', { fontSize: 16 }).width).toBe(34);
    });

    it('gives the size createText makes the same text, in a bitmap font and a vector one', () => {
        for (const vector of [false, true]) {
            for (const style of [{}, { fontSize: 24, letterSpacing: 2 }, { maxWidth: 30, lineSpacing: 3 }] as TTextStyle[]) {
                const { measured, made } = bothWays('AB CD\nE', style, vector);
                expect(measured.width).toBeGreaterThan(0);
                expect(measured.width).toBeCloseTo(made.width);
                expect(measured.height).toBeCloseTo(made.height);
            }
        }
    });

    it('says what each line says: one per newline, and more where maxWidth broke one', () => {
        const font = createTestFont();

        expect(measureText('AB CD\nE', { font }).lines).toEqual(['AB CD', 'E']);
        expect(measureText('AB CD\nE', { font, maxWidth: 20 }).lines).toEqual(['AB', 'CD', 'E']);
    });

    it('breaks a vector font\'s lines where a text on screen breaks them', () => {
        const { store } = createTestGame();
        const font = createTestVectorFont(store);

        // At 20, "IA" is 26 wide and "IA IA" 57.
        expect(measureText('IA IA', { font, fontSize: 20, maxWidth: 30 })).toEqual({ width: 30, height: 40, lines: ['IA', 'IA'] });
    });

    it('draws no letter into a vector font\'s atlas to measure it', () => {
        const { store } = createTestGame();
        const font = createTestVectorFont(store);
        const drawn = spyOn(msdf, 'generateMsdf');

        measureText('OAI OAI', { font });

        expect(drawn).not.toHaveBeenCalled();
        drawn.mockRestore();
    });

    it('lets a dialogue show its lines letter by letter without a word jumping down halfway', () => {
        const glyphs = new Map(TEST_FONT_META.chars.map((glyph) => [glyph.char, glyph]));
        const style = { font: createTestFont(), maxWidth: 30 };
        const page = measureText('AB ABCD A B CDE', style).lines.join('\n');

        // Every beginning of the page is set in the beginnings of the same lines, never with the end
        // of a line moved onto the next.
        const whole = page.split('\n');
        for (let shown = 1; shown <= page.length; shown++) {
            const lines = layoutText(page.slice(0, shown), style, TEST_FONT_META, glyphs).lines;
            lines.forEach((line, row) => expect(whole[row].startsWith(line)).toBe(true));
        }
    });

    it('measures nothing, with no lines, while the font is on its way', () => {
        const loading = newFont('late.ttf', 'late.ttf', 512);
        const first = measureText('ABC', { font: loading });

        expect(first).toEqual({ width: 0, height: 0, lines: [] });
        first.lines.push('mine');
        expect(measureText('ABC', { font: loading }).lines).toEqual([]);
    });

    it('measures a text that is there with its own font and style, the block sizeOf gives before its scale', () => {
        for (const vector of [false, true]) {
            const { store } = createTestGame();
            startTestScene(store, 'Level', () => {
                const font = vector ? createTestVectorFont(store) : createTestFont();
                const label = createText({ text: 'AB CD\nE', font, style: { maxWidth: 30, lineSpacing: 2 } });
                const measured = measureText(label);

                expect(measured.width).toBeCloseTo(sizeOf(label).width);
                expect(measured.height).toBeCloseTo(sizeOf(label).height);
                expect(measured.lines).toEqual(['AB', 'CD', 'E']);

                label.transform.scaleX = 2;
                expect(sizeOf(label).width).toBeCloseTo(measured.width * 2);
                expect(measureText(label).width).toBeCloseTo(measured.width);
                return createScene();
            });
        }
    });

    it('measures a text as it is now: what it says and its style, changed since it was made', () => {
        const { store } = createTestGame();
        startTestScene(store, 'Level', () => {
            const box = createText({ text: 'AB', font: createTestFont() });
            expect(measureText(box).lines).toEqual(['AB']);

            box.text = 'AB CD E';
            box.style.maxWidth = 20;
            expect(measureText(box)).toEqual({ width: 20, height: 24, lines: ['AB', 'CD', 'E'] });
            return createScene();
        });
    });

    it('measures nothing for a text whose font is on its way, and never hands out lines it shares', () => {
        const { store } = createTestGame();
        startTestScene(store, 'Level', () => {
            const label = createText({ text: 'ABC', font: newFont('late.ttf', 'late.ttf', 512) });
            const first = measureText(label);

            expect(first).toEqual({ width: 0, height: 0, lines: [] });
            first.lines.push('mine');
            expect(measureText(label).lines).toEqual([]);
            return createScene();
        });
    });

    it('finds a font by its key in a scene body, and says to pass the font itself elsewhere', () => {
        const { store } = createTestGame();
        let width = 0;
        startTestScene(store, 'Level', () => {
            store.get('assets').bitmapFonts.set('title', createTestFont('title'));
            width = measureText('AB', { font: 'title' }).width;
            return createScene();
        });

        expect(width).toBe(17);
        expect(() => measureText('AB', { font: 'title' })).toThrow(/measureText: the font 'title' is a key/);
    });
});
