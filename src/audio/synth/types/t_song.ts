/**
 * The four voices of an 8-bit console: two square waves for the tune and the harmony, a triangle for
 * the bass, and noise for the drums.
 *
 * @category Audio
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TSongVoiceName = 'pulse1' | 'pulse2' | 'triangle' | 'noise';

/**
 * One voice of a song: what it plays, written as text, and how.
 *
 * @category Audio
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TSongVoice = {
    /**
     * The notes, separated by spaces, read left to right:
     *
     * - `c d e f g a b`, then `#` or `b` to raise or lower it, then `'` (an octave up) or `,` (an
     *   octave down) as many times as needed. `c` alone is middle C, so `a` is the A of 440 Hz.
     * - Then how long: `1` a whole note, `2` a half, `4` a quarter, `8`, `16`, `32`. A `.` after it
     *   adds half as much again. With no number, it lasts what the note before it lasted.
     * - `~` at the end holds it into the next note, which must be the same one.
     * - `r` is a rest, and in the noise voice `x` is a drum hit.
     * - `|` marks where a bar ends, and it is checked: a bar that does not add up is an error.
     *
     * In the noise voice a note's pitch chooses how the noise sounds: higher, more of a hiss.
     */
    notes: string;
    /**
     * `0` silent, `1` as loud as this voice goes. Default `1`. The four voices are mixed so that all
     * of them at full volume never go past what a speaker takes.
     */
    volume?: number;
    /**
     * How much of each cycle a square wave spends up, which is its colour: `0.125` thin and
     * nasal, `0.5` round and hollow. Square voices only. Default `0.5`.
     */
    duty?: 0.125 | 0.25 | 0.5 | 0.75;
};

/**
 * A song as the text of a `.song` file: the tempo, the bar, where it loops, and what each voice plays.
 *
 * Small enough to write by hand and to read back, and played the same in the editor, in a browser
 * and on the desktop runtime, because it is turned into sound by the same function everywhere.
 *
 * @category Audio
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TSongDoc = {
    format: number;
    /**
     * Beats per minute, a beat being the note the bar counts in (a quarter in 3/4).
     */
    tempo: number;
    /**
     * How many beats a bar has, and which note is a beat: `[3, 4]` is a minuet's three quarters.
     */
    meter: [number, number];
    /**
     * The bar the song goes back to when it reaches the end, counted from `1`. Everything before it
     * is an intro that plays once. Absent, it loops from the start.
     */
    loop?: { bar: number };
    voices: Partial<Record<TSongVoiceName, TSongVoice>>;
};

/**
 * One note a voice plays, worked out from its text: when, for how long, and which.
 *
 * @category Audio
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TSongNote = {
    voice: TSongVoiceName;
    /**
     * Counted in beats from the start of the song.
     */
    start: number;
    beats: number;
    /**
     * As a MIDI number: `60` is middle C, `69` the A of 440 Hz. A drum hit is `72`.
     */
    pitch: number;
};

/**
 * Something wrong in the text of a voice, and where: the line and column inside that voice's
 * `notes`, both counted from `1`.
 *
 * @category Audio
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TSongError = {
    voice: TSongVoiceName;
    line: number;
    column: number;
    message: string;
};

/**
 * A song turned into sound: one track per voice, all the same length so they can play together.
 *
 * @category Audio
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TRenderedSong = {
    sampleRate: number;
    /**
     * In samples, every voice's track this long. Rounded up to whole bars, so a loop lands on one.
     */
    length: number;
    /**
     * In seconds.
     */
    duration: number;
    /**
     * Where the loop goes back to, in samples and in seconds: what `loopStart` wants.
     */
    loopSample: number;
    loopStart: number;
    voices: Partial<Record<TSongVoiceName, Float32Array>>;
    /**
     * Every note, in the order the voices were read, for whoever wants to draw them.
     */
    notes: TSongNote[];
    /**
     * Whatever could not be read. What could is still played.
     */
    errors: TSongError[];
};

/**
 * The kinds of sound effect `renderSfx` makes.
 *
 * @category Audio
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TSfxPreset = 'coin' | 'jump' | 'hit' | 'explosion';

/**
 * What sound effect to make, and how it differs from the preset as it comes.
 *
 * @category Audio
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TSfxOptions = {
    preset: TSfxPreset;
    /**
     * Each seed is a slightly different take on the same preset: the same seed, the same sound.
     * Default `1`.
     */
    seed?: number;
    /**
     * Higher or lower than the preset, as a multiple: `2` is an octave up. Default `1`.
     */
    pitch?: number;
    /**
     * How long it lasts, in seconds. Default, what the preset lasts.
     */
    length?: number;
    /**
     * How loud it peaks, `0` to `1`. Default `0.8`.
     */
    volume?: number;
};

/**
 * What a piece of sound measures: what tells you, without hearing it, whether it is too loud, too
 * quiet, or broken.
 *
 * @category Audio
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TAudioMeasure = {
    /**
     * In seconds.
     */
    duration: number;
    /**
     * The loudest sample, `0` to `1`, and the same in decibels below full scale.
     */
    peak: number;
    peakDb: number;
    /**
     * How loud it is on average, `0` to `1`, and in decibels.
     */
    rms: number;
    rmsDb: number;
    /**
     * How many samples reached full scale, where a speaker can go no further and the sound distorts.
     */
    clipped: number;
};
