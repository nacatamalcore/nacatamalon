import { asRecord } from '../../utils';
import { builtinInstrument } from './builtin';
import { SONG_CHIPS, songVoicesOf } from './chips';
import type { TFmOperator, TSongChip, TSongDoc, TSongInstrument, TSongVoice, TSongVoiceName } from './types/t_song';

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
 * An instrument's fields that are lists of numbers written as text.
 */
const INSTRUMENT_LISTS = new Set(['volume', 'duty', 'arpeggio', 'pitch']);

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

    // Their lists are read, and their mistakes said, by `renderSong`, as the notes are: here only
    // what could not be an instrument at all is refused.
    const instruments: Record<string, TSongInstrument> = {};
    if (file.instruments !== undefined) {
        const instrumentsRaw = asRecord(file.instruments) ?? fail(src, '"instruments" has to be an object, each instrument by its name.');
        for (const [name, value] of Object.entries(instrumentsRaw)) {
            if (!/^[A-Za-z][\w-]*$/.test(name)) {
                fail(src, `"${name}" cannot be an instrument's name: a name is a letter, then letters, digits, _ or -, so the notes can say @${name}.`);
            }
            const raw = asRecord(value) ?? fail(src, `the instrument "${name}" has to be an object.`);
            const read: TSongInstrument = {};
            for (const [key, field] of Object.entries(raw)) {
                if (INSTRUMENT_LISTS.has(key)) {
                    if (typeof field !== 'string') {
                        fail(src, `the "${key}" of the instrument "${name}" has to be its numbers as text, like "15 12 9 | 6".`);
                    }
                    read[key as 'volume' | 'duty' | 'arpeggio' | 'pitch'] = field as string;
                } else if (key === 'vibrato') {
                    const vibrato = asRecord(field);
                    if (vibrato === null || typeof vibrato.speed !== 'number' || typeof vibrato.depth !== 'number'
                        || (vibrato.delay !== undefined && typeof vibrato.delay !== 'number')) {
                        fail(src, `the "vibrato" of the instrument "${name}" has to be { "speed", "depth" } and maybe "delay", as numbers.`);
                    }
                    const { speed, depth, delay } = vibrato as { speed: number; depth: number; delay?: number };
                    read.vibrato = { speed, depth, ...(delay !== undefined ? { delay } : {}) };
                } else if (key === 'sample') {
                    if (typeof field !== 'string' || field === '') {
                        fail(src, `the "sample" of the instrument "${name}" has to name a sound: one of the engine's ("nacatamalon:kick") or a file of the game ("/samples/hit.wav").`);
                    }
                    read.sample = field as string;
                } else if (key === 'adsr') {
                    const adsr = asRecord(field);
                    if (adsr === null || Object.entries(adsr).some(([part, value]) => !['attack', 'decay', 'sustain', 'release'].includes(part) || typeof value !== 'number')) {
                        fail(src, `the "adsr" of the instrument "${name}" has to be { "attack", "decay", "sustain", "release" }, each a number.`);
                    }
                    read.adsr = { ...(adsr as Record<string, number>) };
                } else if (key === 'echo') {
                    if (typeof field !== 'boolean') fail(src, `the "echo" of the instrument "${name}" has to be true or false.`);
                    read.echo = field as boolean;
                } else if (key === 'root' || key === 'loop') {
                    if (typeof field !== 'number') fail(src, `the "${key}" of the instrument "${name}" has to be a number.`);
                    read[key] = field as number;
                } else if (key === 'fm') {
                    const fm = asRecord(field);
                    const operators = fm?.operators;
                    if (fm === null || typeof fm.algorithm !== 'number' || (fm.feedback !== undefined && typeof fm.feedback !== 'number')
                        || !Array.isArray(operators) || operators.length !== 4
                        || operators.some((operator) => asRecord(operator) === null || Object.values(asRecord(operator)!).some((value) => typeof value !== 'number'))) {
                        fail(src, `the "fm" of the instrument "${name}" has to be { "algorithm", "feedback", "operators": four of { "multiple", "detune", "level", "attack", "decay", "sustain", "release" } }, as numbers.`);
                    }
                    const patch = fm as { algorithm: number; feedback?: number; operators: TFmOperator[] };
                    read.fm = {
                        algorithm: patch.algorithm,
                        ...(patch.feedback !== undefined ? { feedback: patch.feedback } : {}),
                        operators: patch.operators.map((operator) => ({ ...operator })) as [TFmOperator, TFmOperator, TFmOperator, TFmOperator],
                    };
                } else if (key === 'slide') {
                    if (typeof field !== 'number') {
                        fail(src, `the "slide" of the instrument "${name}" has to be a number of seconds.`);
                    }
                    read.slide = field as number;
                } else {
                    fail(src, `the instrument "${name}" has "${key}", and an instrument has ${[...INSTRUMENT_LISTS, 'vibrato', 'slide', 'sample', 'root', 'loop', 'adsr', 'echo', 'fm'].join(', ')}.`);
                }
            }
            instruments[name] = read;
        }
    }

    let chip: TSongChip | undefined;
    if (file.chip !== undefined) {
        if (!(SONG_CHIPS as unknown[]).includes(file.chip)) {
            fail(src, `"chip" is the console it sounds like, ${SONG_CHIPS.map((known) => `"${known}"`).join(', ')}, and it is ${JSON.stringify(file.chip)}.`);
        }
        chip = file.chip as TSongChip;
    }
    const voicesOfChip = songVoicesOf(chip);

    let echo: TSongDoc['echo'];
    if (file.echo !== undefined) {
        const raw = asRecord(file.echo);
        if (raw === null || Object.entries(raw).some(([part, value]) => (part === 'filter'
            ? !Array.isArray(value) || value.some((step) => typeof step !== 'number')
            : !['delay', 'feedback', 'volume'].includes(part) || typeof value !== 'number'))) {
            fail(src, '"echo" has to be { "delay", "feedback", "volume" } as numbers, and maybe "filter", eight numbers.');
        }
        echo = { ...(raw as TSongDoc['echo']), ...(Array.isArray(raw!.filter) ? { filter: [...(raw!.filter as number[])] } : {}) };
    }

    const voicesRaw = asRecord(file.voices) ?? fail(src, `"voices" has to be an object with ${voicesOfChip.join(', ')}.`);
    const voices: Partial<Record<TSongVoiceName, TSongVoice>> = {};
    for (const [name, value] of Object.entries(voicesRaw)) {
        if (!(voicesOfChip as readonly string[]).includes(name)) {
            fail(src, `there is no voice called "${name}"${chip !== undefined ? ` on the ${chip}` : ''}. The voices are ${voicesOfChip.join(', ')}.`);
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
        if (written.pan !== undefined) {
            if (typeof written.pan !== 'number' || !Number.isFinite(written.pan)) {
                fail(src, `the "pan" of "${name}" has to be a number from -1 (left) to 1 (right).`);
            }
            read.pan = Math.min(1, Math.max(-1, written.pan as number));
        }
        if (written.instrument !== undefined) {
            if (typeof written.instrument !== 'string' || (instruments[written.instrument] === undefined && builtinInstrument(written.instrument) === undefined)) {
                fail(src, `the voice "${name}" starts with the instrument ${JSON.stringify(written.instrument)}, and the song has ${Object.keys(instruments).length === 0 ? 'no instruments' : Object.keys(instruments).map((known) => `"${known}"`).join(', ')}.`);
            }
            read.instrument = written.instrument as string;
        }
        voices[name as TSongVoiceName] = read;
    }

    return {
        format: typeof file.format === 'number' ? file.format : SONG_FORMAT,
        tempo: tempo as number,
        meter: [(meter as number[])[0]!, (meter as number[])[1]!],
        ...(loop !== undefined ? { loop } : {}),
        voices,
        ...(file.instruments !== undefined ? { instruments } : {}),
        ...(chip !== undefined ? { chip } : {}),
        ...(echo !== undefined ? { echo } : {}),
    };
};
