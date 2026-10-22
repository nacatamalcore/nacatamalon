import { fromDpcm } from '../../audio/synth/dpcm';
import { buildTrackerSong, instrumentNameOf } from './build_tracker_song';
import type { TTrackerEvent, TTrackerImport } from './build_tracker_song';
import type { TSongInstrument, TSongNoteEffects, TSongSample, TSongVoiceName } from '../../audio/synth';

/**
 * Reading what FamiStudio writes when it exports a project as text (File, Export, FamiStudio Text).
 *
 * Each line is a thing and its attributes, `Note Time="0" Value="C4" Instrument="Lead"`, inside the
 * thing the line above it with one tab less is: a project holds its samples, its instruments (each
 * with its envelopes) and its songs; a song its channels; a channel its patterns, and which pattern
 * plays where. The console's five channels come over; what has no equal here is said in `warnings`.
 */

type TNode = { kind: string; attrs: Record<string, string>; children: TNode[] };

const CHANNELS: Record<string, TSongVoiceName> = { Square1: 'pulse1', Square2: 'pulse2', Triangle: 'triangle', Noise: 'noise', DPCM: 'dpcm' };

const NOTE_STEPS: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

/** About sixteen steps of the console's timer to a semitone, in the middle of the keyboard. */
const STEPS_PER_SEMITONE = 16;

/** The lines as a tree, by how many tabs each starts with. */
const treeOf = (text: string): TNode => {
    const root: TNode = { kind: 'root', attrs: {}, children: [] };
    const stack: Array<{ depth: number; node: TNode }> = [{ depth: -1, node: root }];
    for (const raw of text.split(/\r?\n/)) {
        if (raw.trim() === '') continue;
        const depth = /^\t*/.exec(raw)![0].length;
        const line = raw.trim();
        const kind = line.split(/\s+/, 1)[0]!;
        const attrs: Record<string, string> = {};
        for (const [, key, value] of line.matchAll(/(\w+)="((?:[^"]|"")*)"/g) as IterableIterator<[string, string, string]>) {
            attrs[key] = value.replace(/""/g, '"');
        }
        while (stack.at(-1)!.depth >= depth) stack.pop();
        const node: TNode = { kind, attrs, children: [] };
        stack.at(-1)!.node.children.push(node);
        stack.push({ depth, node });
    }
    return root;
};

/**
 * A note as FamiStudio names it, `C4`, `C#4`, counted as the triangle sounds it: `C4` is middle C,
 * `60`. FamiStudio names its notes as FamiTracker does, from a lowest C of 32.7 Hz it calls `C0`, so
 * on the pulses, an octave above the triangle at the same note, `C4` sounds at 523 Hz, our `c'`.
 * On the sample voice it is only a key into the samples.
 */
const pitchOf = (value: string): number | null => {
    const match = /^([A-G])([#b]?)(-?\d)$/.exec(value);
    if (match === null) return null;
    const [, letter, sign, octave] = match as unknown as [string, string, string, string];
    return 12 * (Number(octave) + 1) + NOTE_STEPS[letter]! + (sign === '#' ? 1 : sign === 'b' ? -1 : 0);
};

const numbersOf = (text: string | undefined): number[] =>
    (text ?? '').split(',').map((v) => v.trim()).filter((v) => v !== '').map(Number).filter(Number.isFinite);

const listOf = (values: number[], loop: number): string =>
    values.map((value, index) => (index === loop ? `| ${value}` : String(value))).join(' ');

const loopOf = (attrs: Record<string, string>): number => (attrs.Loop === undefined || attrs.Loop === '' ? -1 : Number(attrs.Loop));

/**
 * Reads the text FamiStudio exports into one of our songs.
 *
 * @param text - The exported file's text.
 * @param options - `samplesFolder`: where its samples are to be saved, as the game names them.
 * Default `'/samples/'`. `song`: which of its songs, from `0`. Default the first.
 * @returns The song, its samples to save, and what could not be brought over.
 *
 * @category Audio
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const importFamiStudioText = (text: string, options: { samplesFolder?: string; song?: number } = {}): TTrackerImport => {
    const warnings: string[] = [];
    const said = new Set<string>();
    const once = (key: string, words: string): void => {
        if (!said.has(key)) {
            said.add(key);
            warnings.push(words);
        }
    };
    const project = treeOf(text).children.find((node) => node.kind === 'Project');
    if (project === undefined) {
        throw new Error('[NacatamalOn] importFamiStudioText: this is not a text export of FamiStudio (it has no Project). In FamiStudio: File, Export, FamiStudio Text.');
    }
    const expansion = project.attrs.Expansions ?? project.attrs.Expansion ?? '';
    if (expansion !== '' && expansion !== 'None') {
        once('expansion', `it uses the sound chips some cartridges added (${expansion}): only the console's own five voices are brought over.`);
    }
    const tempoMode = project.attrs.TempoMode ?? 'FamiStudio';
    if ((project.attrs.PAL ?? '') === 'True') once('pal', 'it is written for a PAL console: it is played here at the speed of an NTSC one.');

    // The samples, by name, as the console stores them.
    const samplesRaw = new Map<string, Uint8Array>();
    for (const node of project.children.filter((child) => child.kind === 'DPCMSample')) {
        const hex = (node.attrs.Data ?? '').replace(/[^0-9a-fA-F]/g, '');
        samplesRaw.set(node.attrs.Name ?? '', Uint8Array.from(hex.match(/../g) ?? [], (byte) => parseInt(byte, 16)));
    }
    const mappingsOf = (nodes: TNode[]): Map<number, { sample: string; rate: number }> => {
        const out = new Map<number, { sample: string; rate: number }>();
        for (const node of nodes.filter((child) => child.kind === 'DPCMMapping')) {
            const pitch = pitchOf(node.attrs.Note ?? '');
            if (pitch !== null) out.set(pitch, { sample: node.attrs.Sample ?? '', rate: Number(node.attrs.Pitch ?? 15) });
        }
        return out;
    };
    const projectMappings = mappingsOf(project.children);

    // The arpeggios a note can name.
    const arpeggios = new Map<string, number[]>();
    for (const node of project.children.filter((child) => child.kind === 'Arpeggio')) {
        const envelope = node.children.find((child) => child.kind === 'Envelope') ?? node;
        arpeggios.set(node.attrs.Name ?? '', numbersOf(envelope.attrs.Values));
    }

    // The instruments, as ours.
    const taken = new Set<string>();
    const instruments: Record<string, TSongInstrument> = {};
    const names = new Map<string, string>();
    const instrumentMappings = new Map<string, Map<number, { sample: string; rate: number }>>();
    for (const node of project.children.filter((child) => child.kind === 'Instrument')) {
        const raw = node.attrs.Name ?? '';
        const type = node.attrs.Type ?? node.attrs.Expansion ?? '';
        if (type !== '' && type !== 'Regular' && type !== 'None' && type !== '2A03') {
            once(`inst:${type}`, `it has instruments of the chips some cartridges added (${type}): they are left out.`);
            continue;
        }
        const name = instrumentNameOf(raw, taken, `instrument-${names.size}`);
        names.set(raw, name);
        const instrument: TSongInstrument = {};
        for (const envelope of node.children.filter((child) => child.kind === 'Envelope')) {
            const values = numbersOf(envelope.attrs.Values);
            if (values.length === 0) continue;
            const loop = loopOf(envelope.attrs);
            if ((envelope.attrs.Release ?? '') !== '' && Number(envelope.attrs.Release) >= 0) {
                once('release', 'some envelopes have a release point: here a list plays on from where it is when the note ends, so what comes after the release is not heard.');
            }
            switch (envelope.attrs.Type) {
                case 'Volume': instrument.volume = listOf(values, loop); break;
                case 'DutyCycle': instrument.duty = listOf(values.map((v) => Math.min(3, Math.max(0, v))), loop); break;
                case 'Arpeggio': instrument.arpeggio = listOf(values, loop); break;
                case 'Pitch': {
                    let at = 0;
                    const relative = envelope.attrs.Relative === 'True';
                    const semitones = values.map((v) => Math.round((-(relative ? (at += v) : v) / STEPS_PER_SEMITONE) * 100) / 100);
                    if (relative && loop >= 0) once(`pitch:${raw}`, `the pitch envelope of "${raw}" goes round, and kept adding each time round; here each time round is the same.`);
                    instrument.pitch = listOf(semitones, loop);
                    break;
                }
                default: once(`env:${envelope.attrs.Type}`, `envelopes of the kind "${envelope.attrs.Type}" have no equal here: left out.`);
            }
        }
        instruments[name] = instrument;
        const own = mappingsOf(node.children);
        if (own.size > 0) instrumentMappings.set(raw, own);
    }

    const songs = project.children.filter((child) => child.kind === 'Song');
    if (songs.length === 0) throw new Error('[NacatamalOn] importFamiStudioText: the project has no song.');
    const which = options.song ?? 0;
    const song = songs[which];
    if (song === undefined) throw new Error(`[NacatamalOn] importFamiStudioText: there is no song ${which}; the project has ${songs.length}, from 0.`);
    if (songs.length > 1) once('songs', `the project has ${songs.length} songs, and this is song ${which} ("${song.attrs.Name ?? ''}"): import each one on its own.`);

    // Time: a row is a note of the song's grid; a beat is BeatLength of them.
    const beatLength = Number(song.attrs.BeatLength ?? 4);
    const patternLength = Number(song.attrs.PatternLength ?? 16);
    const noteLength = Number(song.attrs.NoteLength ?? 1);
    const length = Number(song.attrs.Length ?? 1);
    const bpm = tempoMode === 'FamiTracker'
        ? (Number(song.attrs.Tempo ?? 150) * 24) / Number(song.attrs.Speed ?? 6) / beatLength
        : 3600 / (noteLength * beatLength);
    const custom = new Map<number, number>();
    for (const node of song.children.filter((child) => child.kind === 'PatternCustomSettings')) {
        custom.set(Number(node.attrs.Time), Number(node.attrs.Length ?? patternLength));
    }
    const starts: number[] = [];
    let total = 0;
    for (let i = 0; i < length; i += 1) {
        starts.push(total);
        total += custom.get(i) ?? patternLength;
    }

    // In FamiStudio's own tempo the notes are placed by the frame, NoteLength of them a row; a time
    // past the pattern's length can only be frames.
    const allNotes = song.children.flatMap((channel) => channel.children.flatMap((pattern) => pattern.children.filter((node) => node.kind === 'Note')));
    const inFrames = tempoMode !== 'FamiTracker' && noteLength > 1 && allNotes.some((note) => Number(note.attrs.Time) >= patternLength);
    const rowOf = (time: number): number => (inFrames ? time / noteLength : time);

    const samples: Array<{ name: string; sample: TSongSample }> = [];
    const sampleInstruments = new Map<string, string>();
    const sampleFiles = new Set<string>();
    const sampleInstrumentOf = (mapping: { sample: string; rate: number }): string | null => {
        const id = `${mapping.sample}:${mapping.rate}`;
        const known = sampleInstruments.get(id);
        if (known !== undefined) return known;
        const bytes = samplesRaw.get(mapping.sample);
        if (bytes === undefined) return null;
        const name = instrumentNameOf(`${mapping.sample || 'sample'}${mapping.rate === 15 ? '' : `-${mapping.rate}`}`, taken, 'sample');
        const file = instrumentNameOf(`${mapping.sample || 'sample'}${mapping.rate === 15 ? '' : `-${mapping.rate}`}`, sampleFiles, 'sample');
        samples.push({ name: file, sample: fromDpcm(bytes, mapping.rate) });
        instruments[name] = { sample: file };
        sampleInstruments.set(id, name);
        return name;
    };

    const voices: Partial<Record<TSongVoiceName, TTrackerEvent[]>> = {};
    for (const channel of song.children.filter((child) => child.kind === 'Channel')) {
        const voice = CHANNELS[channel.attrs.Type ?? ''];
        if (voice === undefined) {
            once(`channel:${channel.attrs.Type}`, `the channel ${channel.attrs.Type} belongs to a chip some cartridges added: left out.`);
            continue;
        }
        const patterns = new Map(channel.children.filter((child) => child.kind === 'Pattern').map((pattern) => [pattern.attrs.Name ?? '', pattern]));
        const events: TTrackerEvent[] = [];
        // Where a note with a length of its own goes quiet, by the row it starts.
        const ends = new Map<number, number>();
        let volume = 15;
        let vibrato: TSongNoteEffects['vibrato'];
        let instrumentRaw = '';
        const placed = channel.children
            .filter((child) => child.kind === 'PatternInstance')
            .map((instance) => ({ at: starts[Number(instance.attrs.Time)] ?? 0, pattern: patterns.get(instance.attrs.Pattern ?? '') }))
            .sort((a, b) => a.at - b.at);
        for (const { at, pattern } of placed) {
            for (const note of pattern?.children.filter((child) => child.kind === 'Note') ?? []) {
                const row = at + rowOf(Number(note.attrs.Time));
                const value = note.attrs.Value;
                if (note.attrs.Volume !== undefined) volume = Number(note.attrs.Volume);
                if (note.attrs.VibratoSpeed !== undefined || note.attrs.VibratoDepth !== undefined) {
                    const speedRaw = Number(note.attrs.VibratoSpeed ?? 0);
                    const depthRaw = Number(note.attrs.VibratoDepth ?? 0);
                    vibrato = speedRaw === 0 || depthRaw === 0 ? undefined : { speed: Math.round(speedRaw * (60 / 64) * 100) / 100, depth: Math.round(depthRaw * 0.1 * 100) / 100 };
                }
                if (note.attrs.Instrument !== undefined) instrumentRaw = note.attrs.Instrument;
                if (note.attrs.SlideTarget !== undefined) once('slide', 'some notes slide to another note (slide notes): here each plays its own note.');
                if (note.attrs.FinePitch !== undefined) once('fine', 'some notes have a fine pitch: left out.');
                if (note.attrs.DutyCycle !== undefined) once('duty', 'some notes set the duty of their own: here the instrument\'s is played.');
                if (value === undefined) continue;
                if (value === 'Stop' || value === 'Release') {
                    events.push({ row, stop: true });
                    continue;
                }
                const pitch = pitchOf(value);
                if (pitch === null) {
                    once(`note:${value}`, `'${value}' is not a note it can read: left out.`);
                    continue;
                }
                if (voice === 'dpcm') {
                    const mapping = instrumentMappings.get(instrumentRaw)?.get(pitch) ?? projectMappings.get(pitch);
                    const name = mapping === undefined ? null : sampleInstrumentOf(mapping);
                    if (name === null) {
                        once(`dpcm:${value}`, `a sample note (${value}) has no sample mapped to it: left out.`);
                        continue;
                    }
                    events.push({ row, pitch: 72, instrument: name });
                } else {
                    const effects: TSongNoteEffects = {};
                    const arpeggio = note.attrs.Arpeggio === undefined ? undefined : arpeggios.get(note.attrs.Arpeggio);
                    if (arpeggio !== undefined && arpeggio.length > 0) effects.arpeggio = arpeggio;
                    if (vibrato !== undefined) effects.vibrato = vibrato;
                    const instrument = names.get(instrumentRaw);
                    events.push({
                        row,
                        // Our noise is four semitones a step of the sixteen it has; the pulses sound
                        // an octave above the note's name (see `pitchOf`).
                        pitch: voice === 'noise' ? 36 + 4 * (((pitch % 16) + 16) % 16) : voice === 'pulse1' || voice === 'pulse2' ? pitch + 12 : pitch,
                        ...(instrument !== undefined ? { instrument } : {}),
                        ...(voice !== 'triangle' ? { volume } : {}),
                        ...(Object.keys(effects).length > 0 ? { effects } : {}),
                    });
                }
                if (note.attrs.Duration !== undefined) ends.set(row, row + rowOf(Number(note.attrs.Duration)));
            }
        }
        // A note with a length of its own goes quiet when it is over, unless the next one starts first.
        events.sort((a, b) => a.row - b.row);
        const kept: TTrackerEvent[] = [];
        events.forEach((event, i) => {
            kept.push(event);
            const end = event.stop ? undefined : ends.get(event.row);
            const next = events[i + 1]?.row ?? Infinity;
            if (end !== undefined && end < next) kept.push({ row: end, stop: true });
        });
        if (kept.length > 0) voices[voice] = kept;
    }

    const loopPoint = song.attrs.LoopPoint === undefined ? 0 : Number(song.attrs.LoopPoint);
    return buildTrackerSong({
        title: song.attrs.Name ?? project.attrs.Name ?? '',
        bpm,
        rowsPerBeat: beatLength,
        rows: total,
        loopRow: loopPoint < 0 ? null : starts[loopPoint] ?? 0,
        voices,
        instruments,
        samples,
    }, warnings, options.samplesFolder);
};
