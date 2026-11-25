import { TAG, followEmphasis } from './emphasis';
import type { TEmphasis } from './emphasis';

/**
 * A text cut up: its words, with their phonemes, its pauses, and the `¿` a question begins with.
 *
 * @internal
 */
export type TPiece = { text: string; phonemes?: string[]; emphasis?: TEmphasis };

/**
 * How a language is written: its words and marks, as a pattern, what is spelled before it is cut, and
 * a word as phonemes. `leans`, a small word has no stress of its own.
 *
 * @internal
 */
export type TWriting = { pattern: RegExp; spell: (text: string) => string; read: (word: string, leans: boolean) => string[] };

/**
 * The mark a pause is said as, for the ones the voice has no pause of its own for: a colon stops it
 * as a semicolon does, a dash or a parenthesis as a comma.
 */
const MARKS: ReadonlyMap<string, string> = new Map([[':', ';'], ['—', ','], ['–', ','], ['(', ','], [')', ','], ['…', '.']]);

/**
 * Marks by how much they say about how a phrase ends, the least first: of several together, the last
 * of these is kept.
 */
const STRENGTH = ',;.!?';

/**
 * Cuts a text into words, pauses (one for marks that come together, none before the first word) and
 * the `¿` a question begins with, its numbers read as words and its tags as its words' emphasis.
 *
 * @internal
 */
export const cutText = (text: string, writing: TWriting): TPiece[] => {
    const out: TPiece[] = [];
    let emphasis: TEmphasis | undefined;
    let outside: ReadonlySet<TPiece> = new Set();
    // Cut at its tags, the odd ones are tags.
    text.normalize('NFC').split(TAG).forEach((part, i) => {
        if (i % 2 === 0) {
            addPieces(out, part, emphasis, writing);
            return;
        }
        const before = emphasis;
        emphasis = followEmphasis(part, emphasis);
        if (before === undefined) outside = new Set(out);
        else if (before !== 'reduced') stressAlone(out.filter((piece) => !outside.has(piece)), writing);
    });
    if (emphasis !== undefined) throw new Error('[NacatamalOn] speech: an <emphasis> is not closed.');
    return out;
};

/**
 * Small words emphasized with no other have a stress of their own: "mi" in "<emphasis>mi</emphasis>
 * casa".
 */
const stressAlone = (pieces: readonly TPiece[], writing: TWriting): void => {
    if (pieces.some((piece) => piece.phonemes?.some((phoneme) => phoneme.endsWith('1')))) return;
    for (const piece of pieces) if (piece.phonemes) piece.phonemes = writing.read(piece.text, false);
};

/**
 * Adds the pieces of a text with no tags to the ones before it.
 */
const addPieces = (out: TPiece[], text: string, emphasis: TEmphasis | undefined, writing: TWriting): void => {
    for (const piece of writing.spell(text.toLowerCase()).match(writing.pattern) ?? []) {
        const mark = MARKS.get(piece) ?? piece;
        if (mark === '¿') {
            out.push({ text: mark });
            continue;
        }
        if (!STRENGTH.includes(mark)) {
            const phonemes = writing.read(mark, true);
            if (phonemes.length > 0) out.push({ text: mark, phonemes, emphasis });
            continue;
        }
        const last = out[out.length - 1];
        if (last === undefined) continue;
        if (last.text === '¿') {
            // A question with nothing in it is none, and a pause just inside one is not said.
            if (mark === '?') out.pop();
            continue;
        }
        if (last.phonemes) out.push({ text: mark });
        else if (STRENGTH.indexOf(mark) > STRENGTH.indexOf(last.text)) last.text = mark;
    }
};

/**
 * A text's pieces as phonemes, punctuation kept as pauses.
 *
 * @internal
 */
export const phonemesOfPieces = (pieces: readonly TPiece[]): string =>
    pieces.flatMap((piece) => piece.phonemes ?? (piece.text === '¿' ? [] : [piece.text])).join(' ');
