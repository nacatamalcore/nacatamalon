import { SONG_FORMAT } from './parse_song_doc';
import { SONG_VOICES } from './render_song';
import type { TSongDoc, TSongVoice } from './types/t_song';

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
            };
        }
    }
    return `${JSON.stringify({
        format: SONG_FORMAT,
        tempo: doc.tempo,
        meter: doc.meter,
        ...(doc.loop !== undefined ? { loop: { bar: doc.loop.bar } } : {}),
        voices,
    }, null, 4)}\n`;
};
