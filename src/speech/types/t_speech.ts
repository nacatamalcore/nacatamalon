import type { TSampledSound } from '../../audio/types/t_sound';

/**
 * The languages whose writing the speech voice can read on its own, by rules. Any other language
 * can still be spoken or sung, written as phonemes.
 *
 * @category Speech
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TSpeechLanguage = 'es';

/**
 * How the voice sounds, whether it speaks or sings.
 *
 * @category Speech
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TSpeechVoice = {
    /**
     * Samples per second. Default `22050`: the era's machines spoke at 8000 to 11025, and the s
     * loses its hiss below 16000.
     */
    sampleRate?: number;
    /**
     * How long the throat is: `1` a man's, `1.15` a woman's, `1.3` a child's. It moves every formant
     * by that much. Default `1`.
     */
    throat?: number;
    /**
     * How breathy it is, `0` to `1`: air heard over the voice. Default `0.1`.
     */
    breath?: number;
    /**
     * The loudest it gets, `0` to `1`. Default `0.8`.
     */
    volume?: number;
    /**
     * Seeds the noise of the s and the breath, so a take is the same every time. Default `1`.
     */
    seed?: number;
};

/**
 * What to say and how.
 *
 * @category Speech
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TSpeechOptions = TSpeechVoice & {
    /**
     * Words to read, by the rules of `language`.
     */
    text?: string;
    /**
     * Or the sounds themselves, when the rules read a word wrong or the language has none: phonemes
     * separated by spaces, a vowel's stress as a digit (`1` stressed, `0` not), and `,` `.` `?` `!`
     * for pauses. `'HH AH0 L OW1 .'` is "hello". Wins over `text`.
     */
    phonemes?: string;
    /**
     * Default `'es'`.
     */
    language?: TSpeechLanguage;
    /**
     * The note it speaks around, as a MIDI pitch. Default `45`, 110 Hz, a man's voice.
     */
    pitch?: number;
    /**
     * How fast: `2` twice as fast. Default `1`.
     */
    speed?: number;
    /**
     * How much the pitch rises on a stressed syllable, in semitones. `0` is the flat voice of a
     * robot. Default `2.5`.
     */
    melody?: number;
};

/**
 * One note of a song sung.
 *
 * @category Speech
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TSungNote = {
    /**
     * A MIDI pitch (`60` middle C) or a name (`'C4'`, `'F#5'`, `'Bb3'`). Absent, a rest.
     */
    pitch?: number | string;
    /**
     * How long, in beats. Default `1`.
     */
    beats?: number;
    /**
     * The syllable sung on it, read by the rules of the language. Absent on a note with a pitch, the
     * syllable before is held over onto it. A hyphen at its end (`'can-'`) says the word goes on in
     * the next syllable: it is not sung, and `lyricsAt` joins the two without a space.
     */
    lyric?: string;
    /**
     * Or the syllable as phonemes (`'D EY1'`). Wins over `lyric` for what is sung; `lyric` is still
     * what `lyricsAt` shows.
     */
    phonemes?: string;
};

/**
 * A sung line: a sound for `useSound`, and where in it the first beat lands, in seconds. The
 * consonants of the first syllable come before it, so it is not `0`: an accompaniment that starts
 * there keeps time with the voice.
 *
 * @category Speech
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TSungSound = TSampledSound & { start: number };

/**
 * A song for the voice to sing.
 *
 * @category Speech
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TSingingOptions = TSpeechVoice & {
    notes: TSungNote[];
    /**
     * Beats a minute. Default `120`.
     */
    tempo?: number;
    /**
     * The language of the notes' `lyric`. Default `'es'`.
     */
    language?: TSpeechLanguage;
    /**
     * How far a held note wavers, in semitones either way. Default `0.25`; `0` sings dead straight.
     */
    vibrato?: number;
    /**
     * Semitones added to every note, to put a song in the voice's range. Default `0`.
     */
    transpose?: number;
};
