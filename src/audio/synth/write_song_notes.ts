import { DEFAULT_SLIDE, DEFAULT_VIBRATO, DRUM_PITCH } from './parse_song_notes';
import type { TSongNote, TSongNoteEffects, TSongVoiceName } from './types/t_song';

/**
 * The finest step a note can start or last: a sixty-fourth of a whole note.
 */
const STEPS_PER_WHOLE = 64;

/**
 * The lengths a voice can write, finest last, each as sixty-fourths of a whole note: whole to
 * sixty-fourth, and each of them with a dot (half again as long), which the parser reads the same way.
 */
const PIECES: Array<{ steps: number; length: number; dotted: boolean }> = [1, 2, 4, 8, 16, 32, 64]
    .flatMap((length) => {
        const steps = STEPS_PER_WHOLE / length;
        return Number.isInteger(steps * 1.5)
            ? [{ steps: steps * 1.5, length, dotted: true }, { steps, length, dotted: false }]
            : [{ steps, length, dotted: false }];
    })
    .sort((a, b) => b.steps - a.steps);

const NAMES = ['c', 'c#', 'd', 'd#', 'e', 'f', 'f#', 'g', 'g#', 'a', 'a#', 'b'];

/**
 * Middle C, which is what `c` alone means.
 */
const MIDDLE_C = 60;

/**
 * How many bars go on one line, so a long voice reads as rows of bars.
 */
const BARS_PER_LINE = 4;

/**
 * A pitch the way the notes write it: the letter, a sharp, and an octave mark for each octave away
 * from the one middle C is in.
 */
const pitchText = (pitch: number, voice: TSongVoiceName): string => {
    if ((voice === 'noise' || voice === 'psgNoise') && pitch === DRUM_PITCH) {
        return 'x';
    }
    const fromC = pitch - MIDDLE_C;
    const octave = Math.floor(fromC / 12);
    const name = NAMES[((fromC % 12) + 12) % 12]!;
    return name + (octave > 0 ? "'".repeat(octave) : ','.repeat(-octave));
};

/**
 * What a note does on its own, written in brackets after it the way the notes read it, the
 * defaults left short: `[slide]`, `[vib]`.
 */
const effectsText = (effects: TSongNoteEffects | undefined): string => {
    if (effects === undefined) {
        return '';
    }
    let text = '';
    if (effects.slide !== undefined) {
        text += effects.slide === DEFAULT_SLIDE ? '[slide]' : `[slide:${effects.slide}]`;
    }
    const vibrato = effects.vibrato;
    if (vibrato !== undefined) {
        const plain = vibrato.speed === DEFAULT_VIBRATO.speed && vibrato.depth === DEFAULT_VIBRATO.depth && vibrato.delay === undefined;
        text += plain ? '[vib]' : `[vib:${[vibrato.speed, vibrato.depth, ...(vibrato.delay !== undefined ? [vibrato.delay] : [])].join(',')}]`;
    }
    if (effects.arpeggio !== undefined) {
        text += `[arp:${effects.arpeggio.join(',')}]`;
    }
    if (effects.volume !== undefined) {
        text += `[vol:${effects.volume}]`;
    }
    return text;
};

/**
 * A stretch of time cut into lengths a voice can write, the longest first.
 */
const piecesOf = (steps: number): typeof PIECES => {
    const out: typeof PIECES = [];
    let left = steps;
    while (left > 0) {
        const piece = PIECES.find((p) => p.steps <= left)!;
        out.push(piece);
        left -= piece.steps;
    }
    return out;
};

/**
 * One voice's notes written as text, the way `parseSongNotes` reads it: the inverse of reading, so a
 * tool that changes notes (a click on a piano roll) can give back a voice a person can still read.
 *
 * Every bar is closed with `|`. A note that crosses a bar is split there and held across it with `~`,
 * and so is a note no single length can write (a quarter and a sixteenth). The gaps are rests. A length
 * is only written when it changes, as a person writes it, and the bars go four to a line. The last bar
 * is filled with rests, so it adds up.
 *
 * A voice plays one note at a time: where two overlap, the later one cuts the earlier short. Starts and
 * lengths are rounded to a sixty-fourth of a whole note, the finest the notes can say.
 *
 * A note played with another instrument than the one before it is written after `@name`, or `@-`
 * for none, and what a note does on its own goes in brackets after its first part: `c'2[vib]`.
 *
 * Reading what this writes gives back the same notes.
 *
 * @param notes - What the voice plays. Only those of `voice` are written; the order does not matter.
 * @param voice - Which voice it is. In the noise voice a drum hit is written `x`.
 * @param meter - The song's bar, `[3, 4]` for three quarters.
 * @param options - `first`: the instrument the voice starts with (its `instrument`), which needs no
 * `@` before the notes that use it.
 * @returns The voice's notes as text.
 *
 * @example
 * ```ts
 * import { parseSongNotes, writeSongNotes } from 'nacatamalon/authoring';
 *
 * const { notes } = parseSongNotes('c4 e g | c\'2.', 'pulse1', [3, 4]);
 * notes.push({ voice: 'pulse1', start: 6, beats: 3, pitch: 67 });
 * writeSongNotes(notes, 'pulse1', [3, 4]); // 'c e g | c\'2. | g. |'
 * ```
 *
 * @category Audio
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const writeSongNotes = (
    notes: readonly TSongNote[],
    voice: TSongVoiceName,
    meter: [number, number],
    options: { first?: string } = {},
): string => {
    const [barBeats, beatUnit] = meter;
    const stepsPerBeat = STEPS_PER_WHOLE / beatUnit;
    const barSteps = Math.round(barBeats * stepsPerBeat);
    const toSteps = (beats: number): number => Math.round(beats * stepsPerBeat);

    // Rounded to what can be written, in order, each cut short by the next.
    const played = notes
        .filter((note) => note.voice === voice)
        .map((note) => ({ start: toSteps(note.start), end: toSteps(note.start + note.beats), pitch: note.pitch, instrument: note.instrument, effects: note.effects }))
        .sort((a, b) => a.start - b.start);
    const kept: typeof played = [];
    for (const note of played) {
        const last = kept.at(-1);
        if (last !== undefined && last.end > note.start) {
            last.end = note.start;
            if (last.end <= last.start) {
                kept.pop();
            }
        }
        if (note.end > note.start && note.start >= 0) {
            kept.push({ ...note });
        }
    }

    const words: string[] = [];
    let length = 4;
    let instrument = options.first;
    let at = 0;
    let bars = 0;

    /**
     * A note or a rest from where the voice is to `until`, cut at every bar and into lengths that
     * can be written, the parts of a note held into each other.
     */
    const write = (until: number, pitch: number | null, effects = ''): void => {
        let first = true;
        while (at < until) {
            const barEnd = (Math.floor(at / barSteps) + 1) * barSteps;
            const stop = Math.min(until, barEnd);
            for (const piece of piecesOf(stop - at)) {
                const holds = pitch !== null && at + piece.steps < until;
                const said = piece.length === length ? '' : String(piece.length);
                length = piece.length;
                words.push(`${pitch === null ? 'r' : pitchText(pitch, voice)}${said}${piece.dotted ? '.' : ''}${holds ? '~' : ''}${first ? effects : ''}`);
                first = false;
                at += piece.steps;
            }
            if (at === barEnd) {
                bars += 1;
                words.push(bars % BARS_PER_LINE === 0 ? '|\n' : '|');
            }
        }
    };

    for (const note of kept) {
        write(note.start, null);
        if (note.instrument !== instrument) {
            words.push(note.instrument === undefined ? '@-' : `@${note.instrument}`);
            instrument = note.instrument;
        }
        write(note.end, note.pitch, effectsText(note.effects));
    }
    // The last bar filled, so it adds up.
    if (at % barSteps !== 0) {
        write(Math.ceil(at / barSteps) * barSteps, null);
    }

    return words.join(' ').replace(/ ?\n ?/g, '\n').trim();
};
