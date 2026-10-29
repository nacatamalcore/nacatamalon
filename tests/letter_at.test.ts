import { describe, expect, it } from 'bun:test';
import { createScene } from '../src/scene/create_scene';
import { createText } from '../src/gameobjects/text/create_text';
import { useSpawn } from '../src/hooks/spawn/use_spawn';
import { useCamera2d } from '../src/hooks/camera/use_camera_2d';
import { useScreenSpace } from '../src/hooks/camera/use_screen_space';
import { destroy } from '../src/destroy/destroy';
import { letterAt } from '../src/layout/letter_at';
import { createTestGame, startTestScene } from './helpers/test_game';
import { createTestFont } from './helpers/test_font';
import { createTestVectorFont } from './helpers/test_ttf';
import { layoutFontText } from '../src/gameobjects/text/layout_font_text';
import type { TText } from '../src/gameobjects/text/types/t_text';
import type { TTextStyle } from '../src/gameobjects/text/types/t_text_style';

/**
 * Which letter of a text is under a point of the screen.
 *
 * The test font's letters are 8 px wide with 1 px between them and a space of 6, so 'AB CD' from x
 * 10 has A at 10–18, B at 19–27, the space at 28–34, C at 35–43 and D at 44–52, each line 8 tall.
 */

const at = (x: number, y: number) => ({ screenX: x, screenY: y });

const level = (text: string, options: { style?: TTextStyle; scaleX?: number; rotation?: number } = {}) => {
    const { store } = createTestGame();
    const font = createTestFont();
    let made!: TText;
    startTestScene(store, 'Level', () => {
        made = createText({
            text,
            font,
            style: options.style,
            transform: { x: 10, y: 20, rotation: options.rotation ?? 0, scaleX: options.scaleX ?? 1, scaleY: 1 },
        });
        return createScene();
    });
    return { store, text: made };
};

describe('letterAt', () => {
    it('says which letter, where it is in the text and on which line', () => {
        const { text } = level('AB CD');

        expect(letterAt(text, at(14, 24))).toEqual({ index: 0, char: 'A', line: 0 });
        expect(letterAt(text, at(23, 24))).toEqual({ index: 1, char: 'B', line: 0 });
        // After the space, so its index is past it: text.text[3] is the C.
        expect(letterAt(text, at(39, 24))).toEqual({ index: 3, char: 'C', line: 0 });
        expect(text.text[3]).toBe('C');
    });

    it('is null on a space, between two letters, and outside the text', () => {
        const { text } = level('AB CD');

        expect(letterAt(text, at(31, 24))).toBeNull();     // the space
        expect(letterAt(text, at(18.5, 24))).toBeNull();   // between A and B
        expect(letterAt(text, at(5, 24))).toBeNull();      // left of it
        expect(letterAt(text, at(14, 40))).toBeNull();     // below it
    });

    it('counts the lines, the ones a \\n starts and the ones maxWidth breaks', () => {
        const { text } = level('AB\nCD');
        // The second line, 8 down: C is at index 3, after the \n.
        expect(letterAt(text, at(14, 32))).toEqual({ index: 3, char: 'C', line: 1 });

        const { text: wrapped } = level('AB CD', { style: { maxWidth: 20 } });
        // Broken at the space, which is left out: CD starts the second line, and is still index 3.
        expect(letterAt(wrapped, at(14, 32))).toEqual({ index: 3, char: 'C', line: 1 });
    });

    it('follows the text where it is drawn: grown, turned, seen through a camera', () => {
        // Twice as wide: B is at 28–46.
        expect(letterAt(level('AB', { scaleX: 2 }).text, at(37, 24))?.char).toBe('B');

        // A quarter turn about its corner: the line runs down, A from y 20 to 28 and B from 29 to 37.
        expect(letterAt(level('AB', { rotation: Math.PI / 2 }).text, at(6, 33))?.char).toBe('B');

        // Through a camera at x 100 that doubles: A, at 110–118 in the world, is at 20–36 on screen.
        const { store } = createTestGame();
        const font = createTestFont();
        let seen!: TText;
        startTestScene(store, 'Level', () => {
            useCamera2d({ transform: { x: 100, y: 0 }, zoom: 2 });
            seen = createText({ text: 'AB', font, transform: { x: 110, y: 20 } });
            return createScene();
        });
        expect(letterAt(seen, at(28, 48))?.char).toBe('A');
        expect(letterAt(seen, at(14, 24))).toBeNull();
    });

    it('reads a text on the screen\'s own layer by the screen, whatever the camera does', () => {
        const { store } = createTestGame();
        const font = createTestFont();
        let hud!: TText;
        startTestScene(store, 'Level', () => {
            useCamera2d({ transform: { x: 100, y: 0 }, zoom: 2 });
            hud = useSpawn(() => {
                useScreenSpace();
                return createText({ text: 'AB', font, transform: { x: 10, y: 20 } });
            })().api;
            return createScene();
        });
        expect(letterAt(hud, at(14, 24))?.char).toBe('A');
    });

    it('takes a letter of a vector font by its step, not its ink', () => {
        const { store } = createTestGame();
        const font = createTestVectorFont(store);
        let word!: TText;
        startTestScene(store, 'Level', () => {
            word = createText({ text: 'II', font, style: { fontSize: 20 }, transform: { x: 10, y: 20 } });
            return createScene();
        });
        // Past the first I's ink and before the second's: still the first, whose step it is.
        const [first, second] = layoutFontText('II', { fontSize: 20 }, font).placements;
        const between = (first.x + first.width + second.x) / 2;
        expect(between).toBeGreaterThan(first.x + first.width);
        expect(letterAt(word, at(10 + between, 30))).toEqual({ index: 0, char: 'I', line: 0 });
        expect(letterAt(word, at(10 + second.x + 1, 30))).toEqual({ index: 1, char: 'I', line: 0 });
    });

    it('is null for a text that has been destroyed', () => {
        const { text } = level('AB');
        destroy(text);
        expect(letterAt(text, at(14, 24))).toBeNull();
    });
});
