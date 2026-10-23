import type { TLoadStatus } from '../../loaders/types/t_load_status';
import type { TSpeechLanguage, TSpeechVoice, TSungNote } from './t_speech';

/**
 * One of the voices that sing a vocal part, and how it sounds.
 *
 * @category Speech
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TVocalSinger = TSpeechVoice & {
    /**
     * How far a held note wavers, in semitones either way. Default `0.25`; `0` sings dead straight.
     */
    vibrato?: number;
    /**
     * Semitones added to every note this singer sings, so several sing one tune each in their own
     * range: a man an octave under it, `-12`. Default `0`.
     */
    transpose?: number;
    /**
     * The language of its lyrics, when it is not the part's.
     */
    language?: TSpeechLanguage;
};

/**
 * A line of a vocal part: its notes, each with its syllable, and who sings it.
 *
 * @category Speech
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TVocalLine = {
    notes: TSungNote[];
    /**
     * The singer, or the singers, by their name in `singers`. Absent, all of them.
     */
    who?: string | string[];
};

/**
 * A vocal part: what a `.vocal` file holds. The notes and the words of a song's voice, written
 * apart from the song and sung over it with `accompany`, so the song itself stays as any other.
 *
 * It has no tempo of its own: it is sung at the song's, and follows it when it changes, and in the
 * song's key.
 *
 * @example
 * ```json
 * {
 *     "format": 1,
 *     "start": 8,
 *     "singers": { "robot": { "throat": 1.15, "vibrato": 0.1 } },
 *     "lines": [
 *         { "notes": [
 *             { "pitch": "E4", "beats": 2, "lyric": "Stay," },
 *             { "pitch": "D4", "beats": 2, "lyric": "stay" }
 *         ] }
 *     ]
 * }
 * ```
 *
 * @category Speech
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TVocalDoc = {
    /**
     * Which version of the format it is written in: `VOCAL_FORMAT`.
     */
    format: number;
    /**
     * The beat of the song where its first line begins, counted from `0`. Default `0`. The
     * consonants of the first syllable are sung just before it, so a part that starts after a rest
     * of the song's (an intro) keeps them; one that starts on the song's very first beat loses them.
     */
    start?: number;
    /**
     * The language its lyrics are read in, by rules, when a note has no phonemes. Default `'es'`.
     */
    language?: TSpeechLanguage;
    /**
     * Who sings, by name. Absent, one voice, `voice`, as it comes.
     */
    singers?: Record<string, TVocalSinger>;
    lines: TVocalLine[];
};

/**
 * A `.vocal` file, as `useLoadVocal` hands it back: there at once, filled in once it has loaded.
 *
 * @category Speech
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TVocalFile = {
    readonly type: 'vocal-file';
    readonly src: string;
    readonly key: string;
    status: TLoadStatus;
    /**
     * The part, once loaded; `null` before, and when it could not be.
     */
    doc: TVocalDoc | null;
};

/**
 * Where a vocal part is at a beat of its song, as `lyricsAt` reads it.
 *
 * @category Speech
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TLyricsAt = {
    /**
     * Which line, counted from `0`.
     */
    line: number;
    /**
     * The line's words up to the syllable being sung, and the whole line: a word broken into
     * syllables (`'moun-'`, `'tain'`) is put back together.
     */
    words: string;
    whole: string;
    /**
     * Who sings the line.
     */
    who: string[];
    /**
     * Whether a syllable is being sung right now, rather than the gap between two: for a mouth that
     * opens and shuts.
     */
    singing: boolean;
};
