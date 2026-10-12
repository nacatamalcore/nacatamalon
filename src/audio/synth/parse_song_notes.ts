import type { TSongError, TSongNote, TSongVoiceName } from './types/t_song';

/**
 * Semitones above C of each letter.
 */
const STEPS: Record<string, number> = { c: 0, d: 2, e: 4, f: 5, g: 7, a: 9, b: 11 };

/**
 * Middle C, which is what `c` alone means.
 */
const MIDDLE_C = 60;

/**
 * The pitch a drum hit carries, so it lands in the middle of what the noise voice can do.
 */
export const DRUM_PITCH = 72;

/**
 * The note lengths a voice can ask for, by the number that names them.
 */
const LENGTHS = new Set([1, 2, 4, 8, 16, 32, 64]);

/**
 * A letter, then how it is raised or lowered, then octaves, then how long, then dots, then a tie.
 * A drum hit and a rest take only the length and what follows it.
 */
const TOKEN = /^([a-gxr])([#b]*)([',]*)(\d+)?(\.*)(~?)$/;

/**
 * A count of beats as a person writes it: `2.5`, not `2.5000000001`.
 */
const beatsText = (beats: number): string => String(Math.round(beats * 1000) / 1000);

/**
 * What one voice's text says, read: the notes it plays, where its last note ends, and everything
 * wrong with it, each with the line and column it was found at.
 *
 * Reading never stops at the first mistake. A note it cannot read is left out and the rest are still
 * read, so one wrong note does not cost a whole song, and every mistake in it is found in one go.
 *
 * @param text - What the voice plays. See `TSongVoice.notes`.
 * @param voice - Which voice it is, for the notes and the errors, and because only the noise voice
 * plays drums.
 * @param meter - The song's bar, which every `|` is checked against.
 * @returns The notes, where the voice ends (in beats), and the errors.
 *
 * @category Audio
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const parseSongNotes = (
    text: string,
    voice: TSongVoiceName,
    meter: [number, number],
): { notes: TSongNote[]; end: number; errors: TSongError[] } => {
    const notes: TSongNote[] = [];
    const errors: TSongError[] = [];
    const [barBeats, beatUnit] = meter;

    let position = 0;
    let lastBar = 0;
    let bar = 1;
    let length = 4;
    let held: TSongNote | null = null;
    let heldAt = { line: 1, column: 1 };

    const fail = (line: number, column: number, message: string): void => {
        errors.push({ voice, line, column, message });
    };

    // Words separated by spaces, with a bar line always a word of its own even written against a note.
    const words: Array<{ word: string; line: number; column: number }> = [];
    let line = 1;
    let column = 1;
    let current = '';
    let startedAt = { line, column };
    const flush = (): void => {
        if (current !== '') {
            words.push({ word: current, ...startedAt });
            current = '';
        }
    };
    for (const char of text) {
        if (char === '\n') {
            flush();
            line += 1;
            column = 1;
            continue;
        }
        if (/\s/.test(char)) {
            flush();
        } else if (char === '|') {
            flush();
            words.push({ word: '|', line, column });
        } else {
            if (current === '') {
                startedAt = { line, column };
            }
            current += char;
        }
        column += 1;
    }
    flush();

    for (const { word, line: at, column: col } of words) {
        if (word === '|') {
            const counted = position - lastBar;
            if (Math.abs(counted - barBeats) > 1e-9) {
                fail(at, col, `bar ${bar} adds up to ${beatsText(counted)} beats, and a bar of ${barBeats}/${beatUnit} has ${barBeats}.`);
            }
            lastBar = position;
            bar += 1;
            continue;
        }

        const match = TOKEN.exec(word);
        if (match === null) {
            fail(at, col, `'${word}' is not a note. A note is a letter from a to g, then # or b, then ' or , for the octave, then its length (4 is a quarter), like c#'8.`);
            continue;
        }
        const [, letter, accidentals, octaves, digits, dots, tie] = match as unknown as [string, string, string, string, string | undefined, string, string];

        if (digits !== undefined) {
            const asked = Number(digits);
            if (!LENGTHS.has(asked)) {
                fail(at, col, `'${word}' asks for a length of ${asked}, and a length is 1, 2, 4, 8, 16, 32 or 64.`);
                continue;
            }
            length = asked;
        }
        const beats = (beatUnit / length) * (2 - 0.5 ** dots.length);

        if (letter === 'r') {
            if (accidentals !== '' || octaves !== '' || tie !== '') {
                fail(at, col, `'${word}' is a rest, which has a length and nothing else.`);
            }
            if (held !== null) {
                fail(heldAt.line, heldAt.column, 'a ~ holds a note into the next one, and the next one is a rest.');
                held = null;
            }
            position += beats;
            continue;
        }

        let pitch: number;
        if (letter === 'x') {
            if (voice !== 'noise') {
                fail(at, col, `'${word}' is a drum hit, and only the noise voice plays drums.`);
                position += beats;
                continue;
            }
            if (accidentals !== '' || octaves !== '') {
                fail(at, col, `'${word}' is a drum hit, which has a length and nothing else.`);
            }
            pitch = DRUM_PITCH;
        } else {
            let shift = 0;
            for (const sign of accidentals) {
                shift += sign === '#' ? 1 : -1;
            }
            for (const mark of octaves) {
                shift += mark === "'" ? 12 : -12;
            }
            pitch = MIDDLE_C + STEPS[letter]! + shift;
        }

        if (held !== null) {
            if (held.pitch === pitch) {
                held.beats += beats;
            } else {
                fail(heldAt.line, heldAt.column, `a ~ holds a note into the next one, which has to be the same note, and '${word}' is not.`);
                notes.push({ voice, start: position, beats, pitch });
            }
        } else {
            notes.push({ voice, start: position, beats, pitch });
        }
        held = tie === '~' ? notes.at(-1)! : null;
        heldAt = { line: at, column: col };
        position += beats;
    }

    if (held !== null) {
        fail(heldAt.line, heldAt.column, 'a ~ holds a note into the next one, and there is no next one.');
    }

    return { notes, end: position, errors };
};
