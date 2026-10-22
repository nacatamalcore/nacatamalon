import type { TSongError, TSongNote, TSongNoteEffects, TSongVoiceName } from './types/t_song';

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
 * How long `[slide]` takes when it does not say, and what `[vib]` is when it does not say.
 */
export const DEFAULT_SLIDE = 0.06;
export const DEFAULT_VIBRATO = { speed: 6, depth: 0.3 } as const;

/**
 * What follows a note in brackets, read: what it does, or why it cannot be read.
 */
const readEffects = (text: string): { effects: TSongNoteEffects; problem: string | null } => {
    const effects: TSongNoteEffects = {};
    const numbers = (args: string): number[] | null => {
        const values = args.split(',').map(Number);
        return args !== '' && values.every(Number.isFinite) ? values : null;
    };
    for (const [, name, args] of text.matchAll(/\[([a-z]+)(?::([^\]]*))?\]/g) as IterableIterator<[string, string, string | undefined]>) {
        const values = args === undefined ? [] : numbers(args);
        if (values === null) {
            return { effects, problem: `[${name}:${args}] has to be numbers separated by commas.` };
        }
        if (name === 'slide') {
            if (values.length > 1 || (values[0] ?? 0) < 0) return { effects, problem: '[slide] is how many seconds it glides in, one number from 0 up: [slide:0.1].' };
            effects.slide = values[0] ?? DEFAULT_SLIDE;
        } else if (name === 'vib') {
            if ((values.length !== 0 && values.length !== 2 && values.length !== 3) || values.some((value) => value < 0)) {
                return { effects, problem: '[vib] is its speed (times a second) and depth (semitones), maybe a delay (seconds): [vib:6,0.3] or [vib:6,0.3,0.2].' };
            }
            effects.vibrato = values.length === 0
                ? { ...DEFAULT_VIBRATO }
                : { speed: values[0]!, depth: values[1]!, ...(values[2] !== undefined ? { delay: values[2] } : {}) };
        } else if (name === 'arp') {
            if (values.length === 0) return { effects, problem: '[arp] says the semitones of its chord: [arp:0,4,7].' };
            effects.arpeggio = values;
        } else if (name === 'vol') {
            if (values.length !== 1 || values[0]! < 0 || values[0]! > 15) return { effects, problem: '[vol] is how loud, one number from 0 to 15: [vol:8].' };
            effects.volume = values[0]!;
        } else {
            return { effects, problem: `[${name}] is not something a note does. A note can do [slide], [vib], [arp:0,4,7] and [vol:8].` };
        }
    }
    return { effects, problem: null };
};

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
 * @param instruments - `first`: the instrument the voice starts with. `names`: the ones the song
 * has, so an `@name` it does not have is a mistake; left out, any name is taken.
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
    instruments: { first?: string; names?: readonly string[] } = {},
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
    let instrument = instruments.first;

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

        if (word.startsWith('@')) {
            const name = word.slice(1);
            // `@-` goes back to no instrument: each note one flat tone.
            if (name === '-') {
                instrument = undefined;
                continue;
            }
            if (instruments.names !== undefined && !instruments.names.includes(name)) {
                fail(at, col, `'${word}' names an instrument the song does not have. It has ${instruments.names.length === 0 ? 'none' : instruments.names.map((known) => `'${known}'`).join(', ')}.`);
                continue;
            }
            instrument = name;
            continue;
        }

        // What only this note does, in brackets after it.
        const bracketed = /^(.*?)((?:\[[^\]]*\])+)$/.exec(word);
        let effects: TSongNoteEffects | undefined;
        let base = word;
        if (bracketed !== null) {
            base = bracketed[1]!;
            const read = readEffects(bracketed[2]!);
            if (read.problem !== null) {
                fail(at, col, read.problem);
            } else {
                effects = read.effects;
            }
        }

        const match = TOKEN.exec(base);
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
            if (accidentals !== '' || octaves !== '' || tie !== '' || bracketed !== null) {
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
            if (voice !== 'noise' && voice !== 'psgNoise') {
                fail(at, col, `'${word}' is a drum hit, and only the noise voices (noise, psgNoise) play drums.`);
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

        if (instrument === undefined && held === null) {
            if (voice === 'dpcm') {
                fail(at, col, `'${word}' is on the dpcm voice, which plays samples: put @name of an instrument with a sample before it, like @drum-kick.`);
            } else if (/^s[1-8]$/.test(voice)) {
                fail(at, col, `'${word}' is on a SNES voice, which plays samples: put @name of an instrument with a sample before it, like @piano.`);
            } else if (/^fm[1-6]$/.test(voice)) {
                fail(at, col, `'${word}' is on an FM voice, which plays with an instrument's "fm": put @name before it, like @epiano.`);
            }
        }
        const note: TSongNote = {
            voice,
            start: position,
            beats,
            pitch,
            ...(instrument !== undefined ? { instrument } : {}),
            ...(effects !== undefined && Object.keys(effects).length > 0 ? { effects } : {}),
        };
        if (held !== null) {
            if (held.pitch === pitch) {
                held.beats += beats;
                if (effects !== undefined) {
                    fail(at, col, `'${word}' carries on the note held into it, which already started: put what it does on that note.`);
                }
            } else {
                fail(heldAt.line, heldAt.column, `a ~ holds a note into the next one, which has to be the same note, and '${word}' is not.`);
                notes.push(note);
            }
        } else {
            notes.push(note);
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
