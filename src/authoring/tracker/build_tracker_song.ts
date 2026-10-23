import { SONG_FORMAT } from '../../audio/synth/parse_song_doc';
import { writeSongNotes } from '../../audio/synth/write_song_notes';
import type { TSongDoc, TSongInstrument, TSongNote, TSongNoteEffects, TSongSample, TSongVoiceName } from '../../audio/synth';

/**
 * What a tracker's file comes to once read, whichever tracker wrote it: rows in time, what happens
 * on each voice at which row, its instruments as ours, and its samples as sound.
 *
 * @internal
 */
export type TTrackerSong = {
    title: string;
    /**
     * Beats a minute, a beat being `rowsPerBeat` rows.
     */
    bpm: number;
    rowsPerBeat: number;
    /**
     * How many rows the song lasts, to its end.
     */
    rows: number;
    /**
     * The row it goes back to at its end, or `null` for none: it stops.
     */
    loopRow: number | null;
    voices: Partial<Record<TSongVoiceName, TTrackerEvent[]>>;
    instruments: Record<string, TSongInstrument>;
    /**
     * Each sample by a name; an instrument's `sample` says that name, and is given the file's path.
     */
    samples: Array<{ name: string; sample: TSongSample }>;
};

/**
 * Something that happens on a voice at a row: a note starts (with its instrument, how loud and what
 * it does), or the voice stops.
 *
 * @internal
 */
export type TTrackerEvent = {
    row: number;
    /**
     * The voice goes quiet here. Absent, a note starts.
     */
    stop?: true;
    pitch?: number;
    instrument?: string;
    /**
     * `0` to `15`; absent or `15` is as loud as its instrument says.
     */
    volume?: number;
    /**
     * The note sounding goes to `volume` here, rather than a note starting: a tracker's way of
     * writing a note that dies away, a row at a time.
     */
    change?: true;
    effects?: TSongNoteEffects;
};

/**
 * A song read from a tracker's file: the song, the sound files its samples are to be saved as, and
 * what could not be brought over, in words.
 *
 * @category Audio
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TTrackerImport = {
    doc: TSongDoc;
    /**
     * Each sample the song plays, to be saved where its instrument's `sample` says.
     */
    samples: Array<{ path: string; samples: Float32Array; sampleRate: number }>;
    /**
     * What was left out or changed on the way, each said once.
     */
    warnings: string[];
};

/**
 * A name our notes can say, `@name`, made from a tracker's: letters, digits and dashes, starting with
 * a letter, and not one already taken.
 *
 * @internal
 */
export const instrumentNameOf = (raw: string, taken: Set<string>, fallback: string): string => {
    let name = raw.trim().toLowerCase().replace(/[^a-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '');
    if (name === '') name = fallback;
    if (!/^[a-z]/.test(name)) name = `i-${name}`;
    let unique = name;
    for (let n = 2; taken.has(unique); n += 1) unique = `${name}-${n}`;
    taken.add(unique);
    return unique;
};

/**
 * An instrument's `volume` list, read as the synthesizer reads it: its numbers, and where it goes
 * round again from (`-1`: the last held for ever).
 */
const readVolumes = (text: string | undefined): { values: number[]; loop: number } | null => {
    if (text === undefined) return null;
    const values: number[] = [];
    let loop = -1;
    for (const word of text.trim().split(/\s+/)) {
        if (word === '|') {
            loop = values.length;
            continue;
        }
        const value = Number(word);
        if (Number.isFinite(value)) values.push(value);
    }
    return values.length === 0 ? null : { values, loop: loop >= values.length ? -1 : loop };
};

/** What a list says at a frame: its own while it lasts, then round from its `|`, or its last. */
const volumeAt = (list: { values: number[]; loop: number }, frame: number): number => {
    if (frame < list.values.length) return list.values[frame]!;
    if (list.loop < 0) return list.values[list.values.length - 1]!;
    return list.values[list.loop + ((frame - list.values.length) % (list.values.length - list.loop))]!;
};

/**
 * A tracker's song written as ours: a note lasts from its row to the next thing on its voice, the
 * rows are counted in beats, a note quieter than full says `[vol:n]`, and the loop goes back to the
 * bar its row starts.
 *
 * A note whose volume moves while it sounds (a tracker writing it dying away, a row at a time) plays
 * with an instrument of its own whose `volume` list says the same a frame at a time, its
 * instrument's own list taken along, as the tracker does: the two together.
 *
 * @internal
 */
export const buildTrackerSong = (
    song: TTrackerSong,
    warnings: string[],
    samplesFolder = '/samples/',
): TTrackerImport => {
    const meter: [number, number] = [4, 4];
    const barRows = song.rowsPerBeat * meter[0];
    if (![1, 2, 4, 8, 16].includes(song.rowsPerBeat)) {
        warnings.push(`a beat here is ${song.rowsPerBeat} rows, which notes cannot always say exactly: each note is rounded to the nearest sixty-fourth.`);
    }

    // How many of the synthesizer's frames (sixty a second) a row lasts.
    const framesPerRow = (60 * 60) / (song.bpm * song.rowsPerBeat);
    // The instruments a note dying away plays with, one for each way of dying away, by what they say.
    const fading = new Map<string, string>();
    const fadingInstruments: Record<string, TSongInstrument> = {};
    const taken = new Set(Object.keys(song.instruments));
    const played = new Set<string>();

    const voices: TSongDoc['voices'] = {};
    for (const [voice, events] of Object.entries(song.voices) as Array<[TSongVoiceName, TTrackerEvent[]]>) {
        const sorted = [...events].sort((a, b) => a.row - b.row);
        // What ends a note: the next note on its voice, or the voice stopping. A change of volume
        // does not; it goes into the note.
        const starts = sorted.filter((event) => event.change !== true);
        const changes = sorted.filter((event) => event.change === true);
        const notes: TSongNote[] = [];
        starts.forEach((event, index) => {
            if (event.stop || event.pitch === undefined) return;
            const end = starts[index + 1]?.row ?? song.rows;
            if (end <= event.row) return;
            const effects: TSongNoteEffects = { ...event.effects };
            let instrument = event.instrument;
            const moves = changes.filter((change) => change.row > event.row && change.row < end);
            if (moves.length > 0) {
                // A frame at a time, the volume the row it falls in says, times the instrument's own.
                const own = readVolumes(instrument === undefined ? undefined : song.instruments[instrument]?.volume);
                const frames = Math.max(1, Math.round((end - event.row) * framesPerRow));
                const list: number[] = [];
                let at = 0;
                let volume = event.volume ?? 15;
                for (let frame = 0; frame < frames; frame += 1) {
                    const row = event.row + Math.floor(frame / framesPerRow + 1e-9);
                    while (at < moves.length && moves[at]!.row <= row) volume = moves[at++]!.volume ?? volume;
                    const value = own === null ? volume : (volumeAt(own, frame) * volume) / 15;
                    list.push(Math.round(value * 100) / 100);
                }
                // The last held for ever, as a list's last is: what repeats it is left off.
                while (list.length > 1 && list[list.length - 1] === list[list.length - 2]) list.pop();
                const says = list.join(' ');
                const key = `${instrument ?? ''}|${says}`;
                let name = fading.get(key);
                if (name === undefined) {
                    name = instrumentNameOf(`${instrument ?? voice}-fade`, taken, 'fade');
                    fading.set(key, name);
                    const base = instrument === undefined ? {} : song.instruments[instrument] ?? {};
                    fadingInstruments[name] = { ...base, volume: says };
                }
                instrument = name;
            } else if (event.volume !== undefined && event.volume < 15) {
                effects.volume = event.volume;
            }
            if (instrument !== undefined) played.add(instrument);
            notes.push({
                voice,
                start: event.row / song.rowsPerBeat,
                beats: (end - event.row) / song.rowsPerBeat,
                pitch: event.pitch,
                ...(instrument !== undefined ? { instrument } : {}),
                ...(Object.keys(effects).length > 0 ? { effects } : {}),
            });
        });
        if (notes.length > 0) voices[voice] = { notes: writeSongNotes(notes, voice, meter) };
    }

    let loop: TSongDoc['loop'];
    if (song.loopRow !== null && song.loopRow > 0) {
        if (song.loopRow % barRows === 0) {
            loop = { bar: song.loopRow / barRows + 1 };
        } else {
            warnings.push(`it goes back to row ${song.loopRow}, which is not where a bar starts, so here it goes back to the start.`);
        }
    }
    if (song.loopRow === null) {
        warnings.push('it stops at its end, and a song here always goes round: it goes back to the start.');
    }

    // An instrument names its sample by the sample's name: here, by the file it will be saved as.
    const paths = new Map(song.samples.map(({ name }) => [name, `${samplesFolder}${name}.wav`]));
    // Only those a note plays with: a tracker's instrument can be there just to say which sample
    // a note means.
    const instruments: Record<string, TSongInstrument> = {};
    for (const [name, instrument] of [...Object.entries(song.instruments), ...Object.entries(fadingInstruments)]) {
        if (!played.has(name)) continue;
        const path = instrument.sample === undefined ? undefined : paths.get(instrument.sample);
        instruments[name] = path === undefined ? instrument : { ...instrument, sample: path };
    }

    const bpm = Math.round(song.bpm * 100) / 100;
    const doc: TSongDoc = {
        format: SONG_FORMAT,
        tempo: bpm,
        meter,
        ...(loop !== undefined ? { loop } : {}),
        ...(Object.keys(instruments).length > 0 ? { instruments } : {}),
        voices,
    };
    const samples = song.samples.map(({ name, sample }) => ({ path: paths.get(name)!, samples: sample.samples, sampleRate: sample.sampleRate }));
    return { doc, samples, warnings: [...new Set(warnings)] };
};
