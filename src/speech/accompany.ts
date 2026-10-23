import { whenLoaded } from '../loaders/track_load';
import { createVocalStream, singersOf } from './vocal_stream';
import type { TSongAccompaniment } from '../audio/types/t_song_player';
import type { TSongStream, TSongStretch } from '../audio/synth/song_stream';
import type { TSongDoc } from '../audio/synth/types/t_song';
import type { TSongFile } from '../loaders/song/types/t_song_file';
import type { TVocalStream } from './vocal_stream';
import type { TVocalDoc, TVocalFile, TVocalSinger } from './types/t_vocal';

/**
 * The lane a vocal part is heard in, beside the song's own voices.
 */
const VOCAL_LANE = 'vocal';

/**
 * What `accompany` can change of a part without writing it again.
 *
 * @category Speech
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TAccompanyOptions = {
    /**
     * How its singers sound, by name, over what the part says: the same tune sung by a child,
     * `{ voice: { throat: 1.3 } }`.
     */
    singers?: Record<string, TVocalSinger>;
};

/**
 * A part, from a file or written in code: `null` while its file has not loaded, or when it could not.
 *
 * @internal
 */
export const vocalDocOf = (vocal: TVocalDoc | TVocalFile): TVocalDoc | null => ('type' in vocal && vocal.type === 'vocal-file' ? vocal.doc : (vocal as TVocalDoc));

/**
 * Sings a vocal part over a song: hand what it gives to `useSong`, and the song plays as it always
 * does with the part sung over it, made with it as it plays.
 *
 * The part is sung at the song's tempo and in its key, and follows them when `setTempo` or
 * `setTranspose` change them; it goes round the song's loop with it. It is heard in a voice of its
 * own, `vocal`, beside the song's. The song itself is untouched: a `.song` and a `.vocal` are written
 * apart and come together here, the way a band accompanies a singer.
 *
 * Nothing is made before it plays, so a song sung over starts at once, however long it is. To show
 * the words as they are sung, `lyricsAt(vocal, song.beat)`.
 *
 * @param vocal - The part: from `useLoadVocal`, or a `TVocalDoc` written in code.
 * @param song - The song under it: from `useLoadSong`, or a `TSongDoc` written in code.
 * @param options - Its singers sounding otherwise than the part says.
 * @returns What `useSong` plays.
 *
 * @example
 * ```ts
 * import { createScene, createText, useLoadSong, useSong, useUpdate, type TBitmapFont } from 'nacatamalon';
 * import { accompany, lyricsAt, useLoadVocal } from 'nacatamalon/speech';
 *
 * declare const font: TBitmapFont;
 *
 * const Stage = () => {
 *     const vocal = useLoadVocal({ src: '/music/daisy.vocal' });
 *     const song = useSong(accompany(vocal, useLoadSong({ src: '/music/daisy.song' })), { autoplay: true });
 *     const words = createText({ text: '', font, transform: { x: 20, y: 20 } });
 *     useUpdate(() => {
 *         words.text = lyricsAt(vocal, song.beat)?.words ?? '';
 *     });
 *     return createScene();
 * };
 * ```
 *
 * @category Speech
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const accompany = (vocal: TVocalDoc | TVocalFile, song: TSongFile | TSongDoc, options: TAccompanyOptions = {}): TSongAccompaniment => ({
    type: 'song-accompaniment',
    song,
    ready: () => ('type' in vocal && vocal.type === 'vocal-file' ? whenLoaded(vocal) : Promise.resolve()),
    over: (stream, how) => {
        const doc = vocalDocOf(vocal);
        // A part that could not be loaded leaves the song as it is: it was said when it failed.
        if (doc === null) return stream;
        const singers = singersOf(doc);
        const sung = options.singers === undefined
            ? doc
            : { ...doc, singers: Object.fromEntries(Object.entries(singers).map(([name, singer]) => [name, { ...singer, ...options.singers![name] }])) };
        return withVocal(stream, createVocalStream(sung, { ...how, sampleRate: stream.sampleRate }));
    },
});

/**
 * The song's stream with the part's in a lane of its own. They go together: where the song goes back
 * round its loop, so does the part.
 */
const withVocal = (stream: TSongStream, vocal: TVocalStream): TSongStream => ({
    sampleRate: stream.sampleRate,
    length: stream.length,
    loopSample: stream.loopSample,
    voices: [...stream.voices, VOCAL_LANE],
    hasEcho: stream.hasEcho,
    errors: stream.errors,
    instrumentErrors: stream.instrumentErrors,
    get position() {
        return stream.position;
    },
    seek: (sample) => {
        stream.seek(sample);
        vocal.seek(stream.position);
    },
    render: (count) => {
        const out: TSongStretch = {
            voices: Object.fromEntries(stream.voices.map((voice) => [voice, new Float32Array(count)])),
            echo: stream.hasEcho ? new Float32Array(count) : null,
        };
        const sung = new Float32Array(count);
        let made = 0;
        // A stretch at most up to the end of the loop, so the part goes back with the song.
        while (made < count) {
            const wraps = stream.position >= stream.length;
            if (wraps) vocal.seek(stream.loopSample);
            const at = wraps ? stream.loopSample : stream.position;
            const step = stream.length > at ? Math.min(count - made, stream.length - at) : count - made;
            const part = stream.render(step);
            for (const voice of stream.voices) out.voices[voice]!.set(part.voices[voice]!, made);
            if (out.echo !== null && part.echo !== null) out.echo.set(part.echo, made);
            sung.set(vocal.render(step), made);
            made += step;
        }
        out.voices[VOCAL_LANE] = sung;
        return out;
    },
});
