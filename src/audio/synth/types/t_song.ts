/**
 * The voices of an 8-bit console: two square waves for the tune and the harmony, a triangle for the
 * bass, noise for the drums, and `dpcm`, which plays short recorded samples (a drum kit, a hit) at
 * the console's own grain.
 *
 * @category Audio
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TSongVoiceName =
    | 'pulse1' | 'pulse2' | 'triangle' | 'noise' | 'dpcm'
    | 's1' | 's2' | 's3' | 's4' | 's5' | 's6' | 's7' | 's8'
    | 'fm1' | 'fm2' | 'fm3' | 'fm4' | 'fm5' | 'fm6' | 'psg1' | 'psg2' | 'psg3' | 'psgNoise';

/**
 * Which console a song sounds like, and so which voices it has:
 *
 * - `'nes'`, the default: `pulse1`, `pulse2`, `triangle`, `noise` and `dpcm`.
 * - `'snes'`: eight voices, `s1` to `s8`, each playing a sample (an instrument's `sample`), with
 *   the console's grain, its envelopes and its echo.
 * - `'genesis'`: six FM voices, `fm1` to `fm6` (an instrument's `fm`), and the three squares and
 *   noise of its second chip, `psg1` to `psg3` and `psgNoise`.
 *
 * @category Audio
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TSongChip = 'nes' | 'snes' | 'genesis';

/**
 * One operator of an FM voice: a sine wave with its own envelope, which either is heard or bends
 * the operators after it, as its voice's `algorithm` says.
 *
 * @category Audio
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TFmOperator = {
    /**
     * Its frequency as a multiple of the note's: `1` the note, `2` an octave up, `0.5` one down.
     * Default `1`.
     */
    multiple?: number;
    /**
     * A hair off its multiple, in cents, for a richer, beating sound. Default `0`.
     */
    detune?: number;
    /**
     * How strong it is, `0` to `1`: how loud when it is heard, how much it bends when it bends
     * another. Default `1`.
     */
    level?: number;
    /**
     * Seconds to come in, seconds to fall to `sustain` (`0` to `1`), and seconds to die away once
     * the note ends. Default `0`, `0`, `1`, `0.05`.
     */
    attack?: number;
    decay?: number;
    sustain?: number;
    release?: number;
};

/**
 * An FM voice of the Genesis: four operators joined one of eight ways.
 *
 * @category Audio
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TFmPatch = {
    /**
     * How the four operators are joined, `0` to `7`, as the console numbers them: `0` each bends the
     * next and only the fourth is heard (the most metallic), `7` all four heard (an organ). `4` is
     * two pairs, each the first bending the second.
     */
    algorithm: number;
    /**
     * How much the first operator bends itself, `0` to `7`: grit, up to a buzz. Default `0`.
     */
    feedback?: number;
    operators: [TFmOperator, TFmOperator, TFmOperator, TFmOperator];
};

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
     * - `@name` plays the notes after it with that instrument of the song's `instruments`, or one the
     *   engine has (`@kick`, `@lead`: see `BUILTIN.MUSIC.INSTRUMENTS`), and `@-` with none.
     * - After a note, in brackets with no spaces, what only that note does: `[slide]` glides in from
     *   the note before (`[slide:0.1]` in that many seconds), `[vib]` wobbles (`[vib:6,0.3]`: times a
     *   second and semitones, `[vib:6,0.3,0.2]` after a delay), `[arp:0,4,7]` plays a chord one note a
     *   frame, `[vol:8]` is quieter (`0` to `15`). Several go together: `c'2[vib][vol:10]`.
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
    /**
     * Where it is heard, from left (`-1`) to right (`1`). Default `0`, the middle. The Genesis put
     * each of its voices left, right or in the middle, and the SNES anywhere between.
     */
    pan?: number;
    /**
     * The instrument its notes start with, by its name in the song's `instruments`. `@name` in the
     * notes changes it from there on.
     */
    instrument?: string;
};

/**
 * How a note sounds over its life, the way an 8-bit tracker describes it: lists of numbers read one
 * a frame (a sixtieth of a second), from the moment the note starts.
 *
 * Each list is numbers separated by spaces. Past its end it keeps its last number, unless a `|`
 * marks where it starts again: `'15 12 | 9 8'` falls to 9 and then goes 8 9 8 9…, `'| 0 4 7'`
 * repeats from the start for as long as the note lasts.
 *
 * @category Audio
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TSongInstrument = {
    /**
     * How loud, `0` to `15` a frame: `'15 12 9 6 3 0'` is a pluck, `'15 14 13 12 | 11'` a note
     * that settles.
     */
    volume?: string;
    /**
     * The colour of a square wave a frame: `0` 12.5 %, `1` 25 %, `2` 50 %, `3` 75 %. Square voices
     * only.
     */
    duty?: string;
    /**
     * Semitones added a frame, for the chords an 8-bit console plays one note at a time:
     * `'| 0 4 7'` is a major chord, `'| 0 3 7'` a minor one.
     */
    arpeggio?: string;
    /**
     * Semitones added a frame, fractions allowed, for a note that bends as it starts: a kick that
     * drops, a laser that falls.
     */
    pitch?: string;
    /**
     * A wobble in pitch: how many times a second, how far in semitones, and how long the note is
     * held before it starts, in seconds.
     */
    vibrato?: { speed: number; depth: number; delay?: number };
    /**
     * How long, in seconds, each note takes to glide from the note before it in its voice.
     */
    slide?: number;
    /**
     * How a sample or an FM voice comes in and goes out: seconds to full, seconds to fall to
     * `sustain` (`0` to `1`), and seconds to die away once the note ends. SNES voices only.
     */
    adsr?: { attack?: number; decay?: number; sustain?: number; release?: number };
    /**
     * Whether its notes go into the song's `echo`. SNES voices only.
     */
    echo?: boolean;
    /**
     * The note a sample of the game sounds as it was recorded, on a SNES voice: `60` is middle C,
     * which is what it is when not said. The engine's samples know their own.
     */
    root?: number;
    /**
     * Where, in seconds, a sample of the game starts again once it reaches its end, on a SNES voice,
     * so a note can be held. Absent, it plays once. The engine's samples know their own.
     */
    loop?: number;
    /**
     * The four operators of a Genesis FM voice.
     */
    fm?: TFmPatch;
    /**
     * The recording the `dpcm` voice plays: a sample the engine has (`'nacatamalon:kick'`: see
     * `BUILTIN.MUSIC.SAMPLES`) or a sound file of the game (`'/samples/hit.wav'`). It is played at the console's
     * grain, one bit at a time, and the note's pitch chooses how fast: `c'` as it was recorded, lower
     * notes slower and deeper.
     */
    sample?: string;
};

/**
 * What one note does on its own, written after it in brackets.
 *
 * @category Audio
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TSongNoteEffects = {
    /**
     * Seconds it takes to glide in from the note before it in its voice.
     */
    slide?: number;
    vibrato?: { speed: number; depth: number; delay?: number };
    /**
     * Semitones played one a frame, round and round.
     */
    arpeggio?: number[];
    /**
     * How loud, `0` to `15`, on top of what its instrument says.
     */
    volume?: number;
};

/**
 * A recording, as its samples, for the `dpcm` voice.
 *
 * @category Audio
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TSongSample = {
    samples: Float32Array;
    sampleRate: number;
    /**
     * The note it sounds as it is, on a SNES voice. Default `60`, middle C.
     */
    root?: number;
    /**
     * Where, in samples, it starts again once it reaches its end, so a note can be held. Absent, it
     * plays once.
     */
    loopStart?: number;
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
    /**
     * The instruments its voices play with, by name.
     */
    instruments?: Record<string, TSongInstrument>;
    /**
     * Which console it sounds like, and so which voices it has. Default `'nes'`.
     */
    chip?: TSongChip;
    /**
     * The SNES's echo, which the instruments with `echo` go into: how far behind it comes (seconds,
     * up to `0.24`), how much of it comes round again (`-1` to `1`), how loud it is (`0` to `1`), and
     * the eight steps it is filtered by, each `-1` to `1`. Default `0.12`, `0.4`, `0.25`, and a
     * filter that leaves it as it is.
     */
    echo?: { delay?: number; feedback?: number; volume?: number; filter?: number[] };
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
     * The instrument it is played with, by name, when it has one.
     */
    instrument?: string;
    /**
     * What it does on its own, written after it in brackets.
     */
    effects?: TSongNoteEffects;
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
 * The lists of an instrument, by the name its field has.
 *
 * @category Audio
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TSongInstrumentList = 'volume' | 'duty' | 'arpeggio' | 'pitch';

/**
 * Something wrong in an instrument, and where: which instrument, which of its fields, and for a
 * list, which of its words, counted from `1`.
 *
 * @category Audio
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TSongInstrumentError = {
    instrument: string;
    field: TSongInstrumentList | 'vibrato' | 'slide' | 'sample' | 'adsr' | 'fm' | 'root' | 'loop';
    /**
     * The word of the list, from `1`. Absent for a field that is not a list.
     */
    position?: number;
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
     * The SNES's echo, a track of its own beside the voices, for a song that has it.
     */
    echo?: Float32Array;
    /**
     * Every note, in the order the voices were read, for whoever wants to draw them.
     */
    notes: TSongNote[];
    /**
     * Whatever could not be read. What could is still played.
     */
    errors: TSongError[];
    /**
     * Whatever in its instruments could not be read. The rest of each instrument is still used.
     */
    instrumentErrors: TSongInstrumentError[];
};

/**
 * The kinds of sound effect `renderSfx` makes: `coin`, `jump`, `hit`, `explosion`; `crowd` (people
 * murmuring), `cheer` (an ovation with clapping), `whistle` (a referee's) and `bat` (wood on a ball).
 *
 * @category Audio
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TSfxPreset = 'coin' | 'jump' | 'hit' | 'explosion' | 'crowd' | 'cheer' | 'whistle' | 'bat';

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
