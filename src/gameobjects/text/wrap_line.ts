import type { TTextStyle } from './types/t_text_style';

/**
 * How far the pen moves for `char` after `previous` (`undefined` at the start of a line), the
 * spacing after it included. Each kind of font measures its own way.
 *
 * @internal
 */
export type TCharStep = (char: string, previous: string | undefined) => number;

/**
 * Breaks one line of a text into the lines that fit in `maxWidth`, the way a paragraph is set: as
 * many words on each as fit, and the spaces it broke at left out.
 *
 * - Only a space is a place to break, and a space never breaks a line by itself: spaces at the end
 *   of a line hang past the edge, as anywhere else text is set.
 * - A word wider than the whole width is broken between two letters, so nothing runs out of the
 *   box. Every line has at least one character, however narrow the width.
 * - The spaces a line starts with are kept: they are the text's own indent, not a break's.
 *
 * `spacing` is the part of every step that goes between characters, which the last one of a line
 * does not add.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const wrapLine = (line: string, maxWidth: number, step: TCharStep, spacing: number): string[] => {
    const chars = Array.from(line);
    const lines: string[] = [];
    let start = 0;

    for (;;) {
        let pen = 0;
        // The last space that follows a word on this line: where it breaks if a word runs over.
        let space = -1;
        let end = chars.length;
        for (let i = start; i < chars.length; i++) {
            const char = chars[i];
            pen += step(char, i > start ? chars[i - 1] : undefined);
            if (char === ' ') {
                if (i > start && chars[i - 1] !== ' ') {
                    space = i;
                }
            } else if (i > start && pen - spacing > maxWidth) {
                end = space !== -1 ? space : i;
                break;
            }
        }

        lines.push(chars.slice(start, end).join(''));
        if (end === chars.length) {
            return lines;
        }
        // Whatever ran over is never only spaces, so there is always a character left to start on.
        start = end;
        while (chars[start] === ' ') {
            start++;
        }
    }
};

/**
 * The lines a text is set in: one per `\n`, each broken again to fit `style.maxWidth` when it has
 * one. Shared by every kind of font, so they all break alike.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const textLines = (text: string, style: TTextStyle, step: TCharStep, spacing: number): string[] => {
    const lines = text.split('\n');
    const maxWidth = style.maxWidth ?? 0;
    return maxWidth > 0 ? lines.flatMap((line) => wrapLine(line, maxWidth, step, spacing)) : lines;
};
