import { asRecord } from '../../utils';
import { SONG_VOICES } from './render_song';
import type { TSongDoc, TSongVoice, TSongVoiceName } from './types/t_song';

/**
 * The format number a `.song` file written today carries.
 *
 * Bumped only for a change an older reader could not survive. A new optional field does not bump it.
 *
 * @category Audio
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const SONG_FORMAT = 1;

const DUTIES = new Set([0.125, 0.25, 0.5, 0.75]);

/**
 * Every refusal goes through here, so the file always names itself.
 */
const fail = (src: string, message: string): never => {
    throw new Error(`[NacatamalOn] song "${src}": ${message}`);
};

const isCount = (value: unknown): value is number => typeof value === 'number' && Number.isInteger(value) && value > 0;

/**
 * Reads the contents of a `.song` file, already parsed from JSON, into a song.
 *
 * It refuses what it could not play (no tempo, a bar that is not two whole numbers, a voice the
 * console does not have) with an error that names the file. The notes themselves are not checked
 * here: `renderSong` reads them and says where each mistake is, without refusing the song.
 *
 * @param raw - The file's JSON.
 * @param src - Where it came from, for the errors.
 * @returns The song.
 *
 * @category Audio
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const parseSongDoc = (raw: unknown, src = 'song'): TSongDoc => {
    const file = asRecord(raw) ?? fail(src, 'a song is a JSON object, with its tempo, meter and voices.');

    const tempo = file.tempo;
    if (typeof tempo !== 'number' || !Number.isFinite(tempo) || tempo <= 0) {
        fail(src, `"tempo" has to be the beats per minute, a number above 0, and it is ${JSON.stringify(tempo)}.`);
    }

    const meter: unknown = file.meter ?? [4, 4];
    if (!Array.isArray(meter) || meter.length !== 2 || !isCount(meter[0]) || !isCount(meter[1])) {
        fail(src, `"meter" has to be the beats in a bar and the note that is a beat, like [3, 4], and it is ${JSON.stringify(meter)}.`);
    }

    let loop: TSongDoc['loop'];
    if (file.loop !== undefined) {
        const bar = asRecord(file.loop)?.bar;
        if (!isCount(bar)) {
            fail(src, `"loop" has to name the bar it goes back to, counted from 1, like { "bar": 2 }, and it is ${JSON.stringify(file.loop)}.`);
        }
        loop = { bar: bar as number };
    }

    const voicesRaw = asRecord(file.voices) ?? fail(src, `"voices" has to be an object with ${SONG_VOICES.join(', ')}.`);
    const voices: Partial<Record<TSongVoiceName, TSongVoice>> = {};
    for (const [name, value] of Object.entries(voicesRaw)) {
        if (!(SONG_VOICES as readonly string[]).includes(name)) {
            fail(src, `there is no voice called "${name}". The voices are ${SONG_VOICES.join(', ')}.`);
        }
        const voice = asRecord(value);
        if (voice === null || typeof voice.notes !== 'string') {
            fail(src, `the voice "${name}" has to have its "notes", as text.`);
        }
        const written = voice as Record<string, unknown>;
        const read: TSongVoice = { notes: written.notes as string };
        if (written.volume !== undefined) {
            if (typeof written.volume !== 'number' || !Number.isFinite(written.volume)) {
                fail(src, `the "volume" of "${name}" has to be a number from 0 to 1.`);
            }
            read.volume = Math.min(1, Math.max(0, written.volume as number));
        }
        if (written.duty !== undefined) {
            if (!DUTIES.has(written.duty as number)) {
                fail(src, `the "duty" of "${name}" has to be 0.125, 0.25, 0.5 or 0.75, and it is ${JSON.stringify(written.duty)}.`);
            }
            read.duty = written.duty as TSongVoice['duty'];
        }
        voices[name as TSongVoiceName] = read;
    }

    return {
        format: typeof file.format === 'number' ? file.format : SONG_FORMAT,
        tempo: tempo as number,
        meter: [(meter as number[])[0]!, (meter as number[])[1]!],
        ...(loop !== undefined ? { loop } : {}),
        voices,
    };
};
