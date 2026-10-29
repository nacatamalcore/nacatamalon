import { ownerOfDrawable } from '../box/drawable_owner';
import { textPointAt } from '../input/pick_targets';
import { layoutOfText } from './measure_text';
import type { TText } from '../gameobjects/text/types/t_text';

/**
 * A letter of a text, as `letterAt` finds it under a point.
 *
 * @category Layout
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TTextLetter = {
    /**
     * Where it is in the text: `text.text[index]` is the letter, the first half of it for a
     * character that takes two (an emoji).
     */
    index: number;
    /**
     * The letter itself, whole.
     */
    char: string;
    /**
     * The line it is on, from 0: one per `\n`, and more where `maxWidth` broke one.
     */
    line: number;
};

/**
 * The letter of a text under a point of the screen: which one was touched, of a word to spell, a
 * line of dialogue with words to pick, a field with a caret to place.
 *
 * Seen as it is drawn: through its scene's camera, a text on the screen's own layer included,
 * turned, grown and placed by its pivot and everything it hangs under. A letter is its whole step
 * along its line and the line's height, so an `o` is touched above and below its ink, and two
 * letters touch. `null` on a space, in the spacing between two letters or two lines, outside the
 * text, or for one destroyed or with nothing drawn yet.
 *
 * @param text The text.
 * @param at A point of the screen: what the pointer gives, `info` itself.
 * @returns The letter there, or `null`.
 *
 * @example
 * ```ts
 * const word = createText({ text: 'NACATAMAL', transform: { x: 40, y: 80 } });
 *
 * listen(word, {
 *     onClick: (info) => {
 *         const letter = letterAt(word, info);
 *         if (letter !== null) console.log(letter.char, letter.index);   // 'T', 4
 *     },
 * });
 * ```
 *
 * @category Layout
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const letterAt = (text: TText, at: { screenX: number; screenY: number }): TTextLetter | null => {
    const store = ownerOfDrawable(text)?.store;
    if (text.destroyed || store === undefined) {
        return null;
    }
    const point = textPointAt(store, text, { x: at.screenX, y: at.screenY });
    if (point === null || point.y < 0) {
        return null;
    }

    const layout = layoutOfText(text);
    const row = layout.lineHeight + layout.lineSpacing;
    const line = row > 0 ? Math.floor(point.y / row) : 0;
    // Below the last line, or in the spacing between two.
    if (line >= layout.lines.length || point.y - line * row > layout.lineHeight) {
        return null;
    }

    for (const placement of layout.placements) {
        if (placement.line === line && point.x >= placement.cellX && point.x < placement.cellX + placement.cellWidth) {
            const char = String.fromCodePoint(text.text.codePointAt(placement.index)!);
            // A font may draw a space as a blank letter of its own: it is still not one.
            return /\s/.test(char) ? null : { index: placement.index, char, line };
        }
    }
    return null;
};
