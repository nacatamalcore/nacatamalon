import { fromDpcm } from '../../audio/synth/dpcm';
import { buildTrackerSong, instrumentNameOf } from './build_tracker_song';
import type { TTrackerEvent, TTrackerImport, TTrackerSong } from './build_tracker_song';
import type { TSongInstrument, TSongNoteEffects, TSongSample, TSongVoiceName } from '../../audio/synth';

/**
 * Reading what FamiTracker writes when it exports a module as text (File, Export text), and what
 * other trackers that kept that format write too.
 *
 * Its five voices of the console are ours, so most of a song comes over as it is: the macros of an
 * instrument are our lists, read a frame at a time the same way; its notes, its volume column and
 * the effects we have ([arp], [vib], [slide]) are written on the notes; its samples are saved as
 * sound files. What has no equal here is said in `warnings`, each once.
 */

/** The console's voices, in the order the tracker lays its channels out. */
const CHANNELS: TSongVoiceName[] = ['pulse1', 'pulse2', 'triangle', 'noise', 'dpcm'];

const NOTE_STEPS: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

/** The kinds of macro, by the number the file gives them. */
const MACRO_KINDS = ['volume', 'arpeggio', 'pitch', 'hipitch', 'duty'] as const;

type TMacro = { values: number[]; loop: number; release: number; setting: number };

/**
 * A note as the tracker writes it, `C-4`, `C#4`, as the pitch it sounds at, a MIDI number; a noise
 * note, `4-#`, as the pitch our noise voice plays at that speed. `null` for anything else.
 *
 * The tracker counts its octaves from the lowest C of its table, 32.7 Hz, which it calls `C-0` and
 * which is C1: on the pulses its `C-4` sounds at 523 Hz, our `c'` (72). The triangle sounds an octave
 * below the pulses at the same note, so there `C-4` is middle C (60). On the sample voice a note is
 * only a key into the instrument's samples, counted as the triangle's.
 */
const pitchOf = (note: string, voice: TSongVoiceName): number | null => {
    if (voice === 'noise' && /^[0-9A-F]-#$/.test(note)) {
        // 0 is the slowest of the sixteen, F the fastest, and our noise is four semitones a step.
        return 36 + 4 * parseInt(note[0]!, 16);
    }
    const match = /^([A-G])([-#b])(\d)$/.exec(note);
    if (match === null) return null;
    const [, letter, sign, octave] = match as unknown as [string, string, string, string];
    const pulse = voice === 'pulse1' || voice === 'pulse2';
    return 12 * (Number(octave) + (pulse ? 2 : 1)) + NOTE_STEPS[letter]! + (sign === '#' ? 1 : sign === 'b' ? -1 : 0);
};

/**
 * A macro as one of our lists: its numbers, with `|` before the one it goes back to.
 */
const listOf = (values: number[], loop: number): string =>
    values.map((value, index) => (index === loop ? `| ${value}` : String(value))).join(' ');

/**
 * The tracker's pitch macro adds to where the note is each frame, in steps of the console's timer,
 * and ours says where it is in semitones: the steps added up, about sixteen to a semitone in the
 * middle of the keyboard, and turned the other way (a longer period is a lower note).
 */
const STEPS_PER_SEMITONE = 16;

/**
 * Reads the text FamiTracker exports into one of our songs.
 *
 * @param text - The exported file's text.
 * @param options - `samplesFolder`: where its samples are to be saved, as the game names them.
 * Default `'/samples/'`. `song`: which of its songs, from `0`. Default the first.
 * @returns The song, its samples to save, and what could not be brought over.
 *
 * @example
 * ```ts
 * import { importFamiTrackerText, serializeSongDoc } from 'nacatamalon/authoring';
 *
 * declare const file: File;
 * declare const save: (path: string, text: string) => Promise<void>;
 *
 * const { doc, warnings } = importFamiTrackerText(await file.text());
 * await save('music/theme.song', serializeSongDoc(doc));
 * console.log(warnings);
 * ```
 *
 * @category Audio
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const importFamiTrackerText = (text: string, options: { samplesFolder?: string; song?: number } = {}): TTrackerImport => {
    const warnings: string[] = [];
    const warn = (said: string): void => { warnings.push(said); };
    const lines = text.split(/\r?\n/);
    if (!lines.some((line) => /^#\s*FamiTracker text export/i.test(line) || /^TRACK\s/.test(line))) {
        throw new Error('[NacatamalOn] importFamiTrackerText: this is not a text export of FamiTracker (it has no TRACK). In FamiTracker: File, Export text.');
    }

    let title = '';
    const macros = new Map<string, TMacro>();
    const tracks: Array<{ rows: number; speed: number; tempo: number; name: string; columns: number[]; orders: number[][]; patterns: Map<number, Map<number, string[]>> }> = [];
    const samplesRaw = new Map<number, { name: string; bytes: number[] }>();
    type TInstrumentRaw = { name: string; sequences: number[] };
    const instrumentsRaw = new Map<number, TInstrumentRaw>();
    const keys = new Map<string, { sample: number; rate: number; start: number }>();
    let lastSample: { bytes: number[] } | null = null;
    let pattern: Map<number, string[]> | null = null;

    for (const raw of lines) {
        const line = raw.trim();
        if (line === '' || line.startsWith('#')) continue;
        const word = line.split(/\s+/, 1)[0]!;
        const rest = line.slice(word.length).trim();
        const quoted = /"((?:[^"]|"")*)"/.exec(rest)?.[1]?.replace(/""/g, '"') ?? '';
        switch (word) {
            case 'TITLE': title = quoted; break;
            case 'EXPANSION':
                if (Number(rest) !== 0) warn('it uses the sound chips some cartridges added (VRC6, VRC7, FDS, MMC5, N163, S5B): only the console\'s own five voices are brought over.');
                break;
            case 'MACHINE':
                if (Number(rest) !== 0) warn('it is written for a PAL console: it is played here at the speed of an NTSC one.');
                break;
            case 'MACRO': {
                const [head, values = ''] = rest.split(':');
                const [kind, index, loop, release, setting] = head!.trim().split(/\s+/).map(Number) as [number, number, number, number, number];
                macros.set(`${kind}:${index}`, { values: values.trim().split(/\s+/).filter((v) => v !== '').map(Number), loop, release, setting });
                break;
            }
            case 'DPCMDEF': {
                const [index] = rest.split(/\s+/).map(Number) as [number];
                const sample = { name: quoted, bytes: [] as number[] };
                samplesRaw.set(index, sample);
                lastSample = sample;
                break;
            }
            case 'DPCM':
                if (lastSample !== null) lastSample.bytes.push(...rest.replace(/^:/, '').trim().split(/\s+/).filter((b) => b !== '').map((b) => parseInt(b, 16)));
                break;
            case 'INST2A03': {
                const numbers = rest.replace(/"(?:[^"]|"")*"/, '').trim().split(/\s+/).map(Number);
                instrumentsRaw.set(numbers[0]!, { name: quoted, sequences: numbers.slice(1, 6) });
                break;
            }
            case 'KEYDPCM': {
                const [instrument, octave, note, sample, rate, , , delta] = rest.split(/\s+/).map(Number) as number[];
                keys.set(`${instrument}:${12 * (octave! + 1) + note!}`, { sample: sample!, rate: rate!, start: delta !== undefined && delta >= 0 ? delta : 64 });
                break;
            }
            case 'TRACK': {
                const [rows, speed, tempo] = rest.split(/\s+/).map(Number) as [number, number, number];
                tracks.push({ rows, speed, tempo, name: quoted, columns: [], orders: [], patterns: new Map() });
                break;
            }
            case 'COLUMNS':
                if (tracks.length > 0) tracks.at(-1)!.columns = rest.replace(/^:/, '').trim().split(/\s+/).map(Number);
                break;
            case 'ORDER':
                if (tracks.length > 0) tracks.at(-1)!.orders.push(rest.split(':')[1]!.trim().split(/\s+/).map((v) => parseInt(v, 16)));
                break;
            case 'PATTERN':
                if (tracks.length > 0) {
                    pattern = new Map();
                    tracks.at(-1)!.patterns.set(parseInt(rest, 16), pattern);
                }
                break;
            case 'ROW':
                if (pattern !== null) {
                    const [rowText, ...cells] = rest.split(':');
                    pattern.set(parseInt(rowText!.trim(), 16), cells.map((cell) => cell.trim()));
                }
                break;
            default:
                if (/^INST(VRC6|VRC7|FDS|N163|S5B)$/.test(word)) warn(`it has instruments of the chips some cartridges added (${word.slice(4)}): they are left out.`);
        }
    }

    if (tracks.length === 0) {
        throw new Error('[NacatamalOn] importFamiTrackerText: the file has no song (no TRACK).');
    }
    const which = options.song ?? 0;
    const track = tracks[which];
    if (track === undefined) {
        throw new Error(`[NacatamalOn] importFamiTrackerText: there is no song ${which}; the file has ${tracks.length}, from 0.`);
    }
    if (tracks.length > 1) warn(`the file has ${tracks.length} songs, and this is song ${which}${track.name ? ` ("${track.name}")` : ''}: import each one on its own.`);

    // The instruments, as ours, by a name the notes can say.
    const taken = new Set<string>();
    const instrumentNames = new Map<number, string>();
    const instruments: Record<string, TSongInstrument> = {};
    const triangleQuiet = new Map<number, TSongInstrument>();
    let warnedRelease = false;
    for (const [index, raw] of instrumentsRaw) {
        const name = instrumentNameOf(raw.name, taken, `instrument-${index}`);
        instrumentNames.set(index, name);
        const instrument: TSongInstrument = {};
        raw.sequences.forEach((sequence, kindIndex) => {
            if (sequence < 0) return;
            const macro = macros.get(`${kindIndex}:${sequence}`);
            if (macro === undefined || macro.values.length === 0) return;
            if (macro.release >= 0 && !warnedRelease) {
                warnedRelease = true;
                warn('some macros have a release point: here a list plays on from where it is when the note ends, so what comes after the release is not heard.');
            }
            const kind = MACRO_KINDS[kindIndex];
            if (kind === 'volume') {
                instrument.volume = listOf(macro.values, macro.loop);
            } else if (kind === 'duty') {
                instrument.duty = listOf(macro.values.map((v) => Math.min(3, Math.max(0, v))), macro.loop);
            } else if (kind === 'arpeggio') {
                if (macro.setting === 1) warn(`the arpeggio of "${raw.name}" is fixed (each step a note of its own), and here it is played as steps from the note.`);
                let at = 0;
                const values = macro.setting === 2 ? macro.values.map((v) => (at += v)) : macro.values;
                instrument.arpeggio = listOf(values, macro.loop);
            } else {
                // Pitch and hi-pitch add up, frame by frame, to where the note has gone.
                const scale = kind === 'hipitch' ? 16 : 1;
                let at = 0;
                const values = macro.values.map((v) => Math.round((-(at += v * scale) / STEPS_PER_SEMITONE) * 100) / 100);
                if (macro.loop >= 0) warn(`the ${kind === 'hipitch' ? 'hi-pitch' : 'pitch'} macro of "${raw.name}" goes round, and kept adding each time round; here each time round is the same.`);
                instrument.pitch = listOf(values, macro.loop);
            }
        });
        instruments[name] = instrument;
        // The triangle is either on or off: a volume list on it is heard as full wherever it is not 0.
        if (instrument.volume !== undefined) {
            triangleQuiet.set(index, { ...instrument, volume: instrument.volume.split(' ').map((v) => (v === '|' ? v : Number(v) > 0 ? '15' : '0')).join(' ') });
        }
    }

    // Which notes of the samples voice play which sample at which speed: an instrument each.
    const samples: Array<{ name: string; sample: TSongSample }> = [];
    const sampleInstruments = new Map<string, string>();
    const sampleNames = new Set<string>();
    const sampleInstrumentOf = (key: { sample: number; rate: number; start: number }): string | null => {
        const id = `${key.sample}:${key.rate}:${key.start}`;
        const known = sampleInstruments.get(id);
        if (known !== undefined) return known;
        const raw = samplesRaw.get(key.sample);
        if (raw === undefined) return null;
        const name = instrumentNameOf(`${raw.name || `sample-${key.sample}`}${key.rate === 15 ? '' : `-${key.rate}`}`, taken, `sample-${key.sample}`);
        const file = instrumentNameOf(`${raw.name || `sample-${key.sample}`}${key.rate === 15 ? '' : `-${key.rate}`}`, sampleNames, `sample-${key.sample}`);
        samples.push({ name: file, sample: fromDpcm(Uint8Array.from(raw.bytes), key.rate, key.start) });
        instruments[name] = { sample: file };
        sampleInstruments.set(id, name);
        return name;
    };

    // The song: its frames one after another, each row of each voice.
    const voices: Partial<Record<TSongVoiceName, TTrackerEvent[]>> = {};
    const said = new Set<string>();
    const once = (key: string, words: string): void => {
        if (!said.has(key)) {
            said.add(key);
            warn(words);
        }
    };
    const state = CHANNELS.map(() => ({
        instrument: -1,
        volume: 15,
        arpeggio: undefined as number[] | undefined,
        vibrato: undefined as TSongNoteEffects['vibrato'],
        portamento: 0,
        pitch: null as number | null,
    }));
    let speed = track.speed;
    let tempo = track.tempo;
    let row = 0;
    let loopRow: number | null = 0;
    const frameStarts: number[] = [];

    frames: for (let frame = 0; frame < track.orders.length; frame += 1) {
        frameStarts[frame] = row;
        for (let line = 0; line < track.rows; line += 1) {
            let ends = false;
            let jump: number | null = null;
            CHANNELS.forEach((voice, channel) => {
                const patternIndex = track.orders[frame]![channel];
                const cell = patternIndex === undefined ? undefined : track.patterns.get(patternIndex)?.get(line)?.[channel];
                if (cell === undefined) return;
                const [note = '...', instrumentText = '..', volumeText = '.', ...effectTexts] = cell.split(/\s+/);
                const now = state[channel]!;
                if (instrumentText !== '..') now.instrument = parseInt(instrumentText, 16);
                if (volumeText !== '.') now.volume = parseInt(volumeText, 16);
                for (const effect of effectTexts) {
                    if (effect === '...' || effect.length < 3) continue;
                    const letter = effect[0]!;
                    const value = parseInt(effect.slice(1), 16);
                    const hi = value >> 4;
                    const lo = value & 15;
                    if (letter === 'F') {
                        if (row === 0) {
                            if (value < 32) speed = value; else tempo = value;
                        } else {
                            once('F', 'it changes speed or tempo partway (Fxx): here the whole song keeps the first one.');
                        }
                    } else if (letter === 'B') {
                        jump = value;
                        ends = true;
                    } else if (letter === 'D') {
                        ends = true;
                        if (value !== 0) once('D', 'a pattern breaks into the next at a row other than its first (Dxx with a number): here the next starts at its first row.');
                    } else if (letter === 'C') {
                        jump = -1;
                        ends = true;
                    } else if (letter === '0') {
                        now.arpeggio = value === 0 ? undefined : [0, hi, lo];
                    } else if (letter === '4') {
                        now.vibrato = value === 0 ? undefined : { speed: Math.round(hi * (60 / 64) * 100) / 100, depth: Math.round(lo * 0.1 * 100) / 100 };
                    } else if (letter === '3') {
                        now.portamento = value;
                    } else {
                        const names: Record<string, string> = {
                            1: 'slide up (1xx)', 2: 'slide down (2xx)', Q: 'note slide up (Qxy)', R: 'note slide down (Rxy)', 7: 'tremolo (7xy)',
                            A: 'volume slide (Axy)', G: 'note delay (Gxx)', S: 'note cut (Sxx)', P: 'fine pitch (Pxx)', V: 'duty (Vxx)', H: 'sweep (Hxy)', I: 'sweep (Ixy)',
                        };
                        once(letter, `it uses ${names[letter] ?? `the effect ${letter}xx`}, which has no equal here: left out.`);
                    }
                }
                if (note === '...') {
                    if (effectTexts.some((effect) => /^[04]/.test(effect))) once('mid', 'an arpeggio or a vibrato starts partway through a note (0xy, 4xy on a row with no note): here it starts with the next note.');
                    // The note sounding gets louder or quieter here: how a tracker writes a note dying
                    // away, a row at a time. The triangle has no volume to change, and a sample none
                    // either.
                    if (volumeText !== '.' && now.pitch !== null && voice !== 'triangle' && voice !== 'dpcm') {
                        (voices[voice] ??= []).push({ row, volume: now.volume, change: true });
                    }
                    return;
                }
                const events = (voices[voice] ??= []);
                if (note === '---' || note === '===') {
                    events.push({ row, stop: true });
                    now.pitch = null;
                    return;
                }
                const pitch = pitchOf(note, voice);
                if (pitch === null) {
                    once(`note:${note}`, `'${note}' is not a note it can read: left out.`);
                    return;
                }
                let instrument: string | undefined;
                if (voice === 'dpcm') {
                    const key = keys.get(`${now.instrument}:${pitch}`);
                    const name = key === undefined ? null : sampleInstrumentOf(key);
                    if (name === null) {
                        once(`dpcm:${now.instrument}:${pitch}`, `a sample note (${note}) has no sample for it in its instrument: left out.`);
                        return;
                    }
                    // Its speed is in the sample saved, so every sample note plays as c'.
                    events.push({ row, pitch: 72, instrument: name });
                    return;
                }
                instrument = now.instrument >= 0 ? instrumentNames.get(now.instrument) : undefined;
                if (voice === 'triangle' && triangleQuiet.has(now.instrument)) {
                    const quiet = `${instrument}-triangle`;
                    instruments[quiet] ??= triangleQuiet.get(now.instrument)!;
                    instrument = quiet;
                }
                const effects: TSongNoteEffects = {};
                if (now.arpeggio !== undefined) effects.arpeggio = now.arpeggio;
                if (now.vibrato !== undefined) effects.vibrato = now.vibrato;
                if (now.portamento > 0 && now.pitch !== null && now.pitch !== pitch) {
                    // How long the tracker takes to get there: steps of the timer, a step a frame.
                    const frames = (Math.abs(pitch - now.pitch) * STEPS_PER_SEMITONE) / now.portamento;
                    effects.slide = Math.round((frames / 60) * 1000) / 1000;
                }
                events.push({
                    row,
                    pitch,
                    ...(instrument !== undefined ? { instrument } : {}),
                    ...(voice !== 'triangle' ? { volume: now.volume } : {}),
                    ...(Object.keys(effects).length > 0 ? { effects } : {}),
                });
                now.pitch = pitch;
            });
            row += 1;
            if (ends) {
                if (jump !== null) {
                    loopRow = jump < 0 ? null : frameStarts[jump] ?? 0;
                    if (jump >= 0 && jump > frame) once('B', 'it jumps forward to a later frame (Bxx): here the song ends there and goes back to the start.');
                    break frames;
                }
                continue frames;
            }
        }
    }

    const imported: TTrackerSong = {
        title: title || track.name,
        // A row is `speed` frames, and the tempo stretches them: 150 is one frame a frame.
        bpm: ((tempo * 24) / speed) / 4,
        rowsPerBeat: 4,
        rows: row,
        loopRow,
        voices,
        instruments,
        samples,
    };
    return buildTrackerSong(imported, warnings, options.samplesFolder);
};
