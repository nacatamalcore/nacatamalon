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
 * A tracker's song written as ours: a note lasts from its row to the next thing on its voice, the
 * rows are counted in beats, a note quieter than full says `[vol:n]`, and the loop goes back to the
 * bar its row starts.
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

    const voices: TSongDoc['voices'] = {};
    for (const [voice, events] of Object.entries(song.voices) as Array<[TSongVoiceName, TTrackerEvent[]]>) {
        const sorted = [...events].sort((a, b) => a.row - b.row);
        const notes: TSongNote[] = [];
        sorted.forEach((event, index) => {
            if (event.stop || event.pitch === undefined) return;
            const end = sorted[index + 1]?.row ?? song.rows;
            if (end <= event.row) return;
            const effects: TSongNoteEffects = { ...event.effects };
            if (event.volume !== undefined && event.volume < 15) effects.volume = event.volume;
            notes.push({
                voice,
                start: event.row / song.rowsPerBeat,
                beats: (end - event.row) / song.rowsPerBeat,
                pitch: event.pitch,
                ...(event.instrument !== undefined ? { instrument: event.instrument } : {}),
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
    const used = new Set(Object.values(song.voices).flatMap((events) => events.flatMap((event) => (event.instrument === undefined ? [] : [event.instrument]))));
    const instruments: Record<string, TSongInstrument> = {};
    for (const [name, instrument] of Object.entries(song.instruments)) {
        if (!used.has(name)) continue;
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
