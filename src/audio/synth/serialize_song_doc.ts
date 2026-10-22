import { SONG_FORMAT } from './parse_song_doc';
import { SONG_VOICES } from './render_song';
import type { TSongDoc, TSongInstrument, TSongVoice } from './types/t_song';

/**
 * Writes a song back out as the text of a `.song` file, for a tool that saves one.
 *
 * The voices go in the console's order whatever order they were given in, and what is not there is
 * not written, so saving a song nobody changed leaves nothing to review.
 *
 * @param doc - The song.
 * @returns The file's text.
 *
 * @category Audio
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const serializeSongDoc = (doc: TSongDoc): string => {
    const voices: Record<string, TSongVoice> = {};
    for (const name of SONG_VOICES) {
        const voice = doc.voices[name];
        if (voice !== undefined) {
            voices[name] = {
                notes: voice.notes,
                ...(voice.volume !== undefined ? { volume: voice.volume } : {}),
                ...(voice.duty !== undefined ? { duty: voice.duty } : {}),
                ...(voice.pan !== undefined ? { pan: voice.pan } : {}),
                ...(voice.instrument !== undefined ? { instrument: voice.instrument } : {}),
            };
        }
    }
    // In the order they were given, each with its fields in one order, so a file saved twice is the
    // same file.
    let instruments: Record<string, TSongInstrument> | undefined;
    if (doc.instruments !== undefined) {
        instruments = {};
        for (const [name, instrument] of Object.entries(doc.instruments)) {
            instruments[name] = {
                ...(instrument.volume !== undefined ? { volume: instrument.volume } : {}),
                ...(instrument.duty !== undefined ? { duty: instrument.duty } : {}),
                ...(instrument.arpeggio !== undefined ? { arpeggio: instrument.arpeggio } : {}),
                ...(instrument.pitch !== undefined ? { pitch: instrument.pitch } : {}),
                ...(instrument.vibrato !== undefined ? { vibrato: { ...instrument.vibrato } } : {}),
                ...(instrument.slide !== undefined ? { slide: instrument.slide } : {}),
                ...(instrument.sample !== undefined ? { sample: instrument.sample } : {}),
                ...(instrument.root !== undefined ? { root: instrument.root } : {}),
                ...(instrument.loop !== undefined ? { loop: instrument.loop } : {}),
                ...(instrument.adsr !== undefined ? { adsr: { ...instrument.adsr } } : {}),
                ...(instrument.echo !== undefined ? { echo: instrument.echo } : {}),
                ...(instrument.fm !== undefined ? { fm: { ...instrument.fm, operators: instrument.fm.operators.map((operator) => ({ ...operator })) as typeof instrument.fm.operators } } : {}),
            };
        }
    }
    return `${JSON.stringify({
        format: SONG_FORMAT,
        ...(doc.chip !== undefined ? { chip: doc.chip } : {}),
        tempo: doc.tempo,
        meter: doc.meter,
        ...(doc.loop !== undefined ? { loop: { bar: doc.loop.bar } } : {}),
        ...(doc.echo !== undefined ? { echo: { ...doc.echo } } : {}),
        ...(instruments !== undefined ? { instruments } : {}),
        voices,
    }, null, 4)}\n`;
};
