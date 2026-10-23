import type { TVocalDoc } from './types/t_vocal';

/**
 * The version of the `.vocal` format this engine writes and reads.
 *
 * @category Speech
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const VOCAL_FORMAT = 1;

/**
 * Every refusal goes through here, so the file always names itself.
 */
const fail = (src: string, message: string): never => {
    throw new Error(`[NacatamalOn] vocal "${src}": ${message}`);
};

const isObject = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);

/**
 * Reads the contents of a `.vocal` file, already parsed from JSON, into a vocal part.
 *
 * It refuses what it could not sing (no lines, a note that is not one, a line sung by a singer the
 * part does not have) with an error that names the file. A syllable the voice cannot read is said
 * when it is sung.
 *
 * @param raw - The file's JSON.
 * @param src - Where it came from, for the errors.
 * @returns The part.
 *
 * @category Speech
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const parseVocalDoc = (raw: unknown, src = 'vocal'): TVocalDoc => {
    if (!isObject(raw)) return fail(src, 'it is not a JSON object');
    if (typeof raw.format !== 'number') return fail(src, 'it has no "format"');
    if (raw.format > VOCAL_FORMAT) return fail(src, `it is format ${raw.format}, newer than this engine reads (${VOCAL_FORMAT})`);
    if (raw.start !== undefined && !(typeof raw.start === 'number' && raw.start >= 0)) return fail(src, '"start" is a beat, a number from 0');
    if (raw.singers !== undefined && !isObject(raw.singers)) return fail(src, '"singers" is an object of voices by name');
    const singers = raw.singers === undefined ? ['voice'] : Object.keys(raw.singers);
    if (!Array.isArray(raw.lines)) return fail(src, 'it has no "lines"');
    raw.lines.forEach((line: unknown, l) => {
        if (!isObject(line) || !Array.isArray(line.notes)) return fail(src, `line ${l + 1} has no "notes"`);
        const who = line.who === undefined ? [] : Array.isArray(line.who) ? line.who : [line.who];
        for (const name of who) {
            if (typeof name !== 'string' || !singers.includes(name)) fail(src, `line ${l + 1} is sung by "${String(name)}", who is not in "singers"`);
        }
        line.notes.forEach((note: unknown, n) => {
            const where = `line ${l + 1}, note ${n + 1}`;
            if (!isObject(note)) return fail(src, `${where} is not a note`);
            if (note.pitch !== undefined && typeof note.pitch !== 'number' && typeof note.pitch !== 'string') fail(src, `${where}: "pitch" is a MIDI number or a name, like "C4"`);
            if (note.beats !== undefined && !(typeof note.beats === 'number' && note.beats >= 0)) fail(src, `${where}: "beats" is a number from 0`);
            for (const key of ['lyric', 'phonemes'] as const) {
                if (note[key] !== undefined && typeof note[key] !== 'string') fail(src, `${where}: "${key}" is text`);
            }
        });
    });
    return raw as TVocalDoc;
};
