import type { TSoundFade } from './t_sound';
import type { TBeatListener } from '../beat_clock';
import type { TSongError, TSongNote, TSongVoiceName } from '../synth/types/t_song';
import type { TSongFile } from '../../loaders/song/types/t_song_file';
import type { TSongDoc } from '../synth/types/t_song';
import type { TSongStream } from '../synth/song_stream';

/**
 * A song with something sung or played over it, made into sound with it as it plays: what
 * `accompany` from `nacatamalon/speech` hands to `useSong`. The song is played as it always is, and
 * what goes over it comes in a voice of its own, at the song's tempo and in its key, following them
 * when they change.
 *
 * @category Audio
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TSongAccompaniment = {
    readonly type: 'song-accompaniment';
    /**
     * The song played under it.
     */
    readonly song: TSongFile | TSongDoc;
    /**
     * Settles once what goes over the song has loaded.
     *
     * @internal
     */
    ready(): Promise<void>;
    /**
     * The song's sound with what goes over it, at the tempo and in the key the song is made at.
     *
     * @internal
     */
    over(stream: TSongStream, how: { tempo: number; transpose: number }): TSongStream;
};

/**
 * How a song written as notes plays.
 *
 * @category Audio
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TSongOptions = {
    /**
     * The same name the saved scene keeps. Made up when nobody says.
     */
    id?: string;
    /**
     * The volume of the whole song. Default `1`.
     */
    volume?: number;
    /**
     * Default `'music'`.
     */
    channel?: string;
    /**
     * Starts as soon as the song is ready, with no `play()`. Default `false`. In a scene coming in with a
     * transition it waits for the swap, when the screen is covered, rather than sounding under the
     * cover over the music of the scene still on screen.
     */
    autoplay?: boolean;
    /**
     * Seconds that `autoplay` takes to come up from silence. Default `0`, at full volume at once.
     * With the `fadeOut` of the music it replaces, two scenes cross their music: the one leaving
     * goes down as this one comes up.
     */
    fadeIn?: number;
    /**
     * Seconds it takes to go down to silence when what asked for it goes away: its scene stops, its
     * object is destroyed. It goes on being heard for that long after. Default `0`, cut at once.
     */
    fadeOut?: number;
    /**
     * How loud each voice starts, `0` to `1`. A voice not named starts at `1`.
     */
    voices?: Partial<Record<TSongVoiceName, number>>;
    /**
     * Where between left (`-1`) and right (`1`) each voice is heard, only those not where the file
     * puts them (the middle, unless it says).
     */
    pan?: Partial<Record<TSongVoiceName, number>>;
    /**
     * Beats per minute, instead of what the file says.
     */
    tempo?: number;
    /**
     * Semitones up, or down below zero, for every voice but the drums. Default `0`.
     */
    transpose?: number;
};

/**
 * A song attached to one object: which file, and how it was asked to play.
 *
 * @category Audio
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TSongAttachment = {
    readonly type: 'song';
    id: string;
    file: TSongFile;
    volume: number;
    channel: string;
    autoplay: boolean;
    /**
     * Seconds, `0` for none: see the options.
     */
    fadeIn: number;
    fadeOut: number;
    voices: Partial<Record<TSongVoiceName, number>>;
    /**
     * Where each voice is heard, left (`-1`) to right (`1`), only those changed from the file's.
     */
    pan: Partial<Record<TSongVoiceName, number>>;
    /**
     * `null` for what the file says.
     */
    tempo: number | null;
    transpose: number;
};

/**
 * Controls a song made with `useSong`.
 *
 * @category Audio
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TSongHandle = {
    /**
     * Plays it from the beginning, intro included. Does nothing until the song is ready.
     */
    play(options?: TSoundFade): void;
    stop(options?: TSoundFade): void;
    pause(): void;
    resume(): void;
    /**
     * The volume of the whole song, over `fade` seconds if given.
     */
    setVolume(volume: number, fade?: number): void;
    /**
     * How loud one voice is, over `fade` seconds if given: the drums in for the last inning, the
     * harmony out under water. `0` silences it without losing its place.
     */
    setVoice(voice: TSongVoiceName, volume: number, fade?: number): void;
    getVoice(voice: TSongVoiceName): number;
    /**
     * Where one voice is heard, from left (`-1`) to right (`1`), over `fade` seconds if given: the
     * bass to one side, the arpeggio to the other.
     */
    setPan(voice: TSongVoiceName, pan: number, fade?: number): void;
    /**
     * Where each voice is heard, left (`-1`) to right (`1`). Written, a voice moves there at once, so
     * a tween can carry it across: `tween({ target: song.pan, to: { pulse2: 1 }, duration: 2 }).play()`.
     */
    readonly pan: Record<TSongVoiceName, number>;
    /**
     * Faster or slower, in beats per minute, carrying on from the same beat it was on.
     */
    setTempo(bpm: number): void;
    /**
     * Higher or lower, in semitones from how it is written, carrying on from where it was. `0` is
     * back in its own key.
     */
    setTranspose(semitones: number): void;
    /**
     * The beats per minute it plays at now.
     */
    readonly tempo: number;
    /**
     * How far into the song the player is hearing now, in seconds, or `null` while it is stopped.
     *
     * Read from the sound card's clock, not the game's, and with the time the sound takes to reach
     * the speaker taken off: what a rhythm game times its notes against, so a press is judged
     * against the beat that was heard. It goes back to the loop's start when the song loops.
     */
    readonly position: number | null;
    /**
     * How far into the song the player is hearing now, in beats from its start, or `null` while it
     * is stopped: `position` counted in beats, with what is left of the beat after the point (`3.5`
     * is half way through the fourth). Right at any tempo, `setTempo` included. It goes back to the
     * loop's start when the song loops.
     *
     * Not the `beat` an `onBeat` listener is given, which is the beat of the bar (`1` to `4` in
     * 4/4) and starts again every bar: this one counts on, and a whole song's notes are written
     * by it, so it is what a note falling towards the line a player hits is placed by:
     * `note.y = LINE - (note.start - song.beat) * SPEED`, a note of `notes`.
     */
    readonly beat: number | null;
    /**
     * How long a sound started now takes to be heard, in seconds: the delay the device reports on
     * its way to the speaker, plus the player's offset (`useAudio().setOffset`). What `position`
     * takes off. A sound meant to land on a beat is started this much before it: the line a
     * character sings over the song. `0` under the frame clock.
     */
    readonly latency: number;
    /**
     * Where the song was being heard at `moment`, a time on the page's clock such as a press gives
     * (`keys.pressedAt`, `pointer.pressedAt`, `pad.pressedAt`, a pointer's `time`): `position` as it
     * was then. `null` while it is stopped.
     *
     * What a rhythm game judges a press against, to the moment of the hand and not of the frame:
     *
     * ```ts
     * const at = keys.pressedAt('Space');
     * if (at !== null) judge(song.positionAt(at));
     * ```
     *
     * Under the frame clock (tests, recordings) a press is as early as its frame: `position`.
     */
    positionAt(moment: number): number | null;
    /**
     * Calls `listener` on every beat while it plays, with the beat of the bar and the bar, both
     * from `1`, on the frame the beat is **heard**: `latency` after it is played. Hands back what
     * stops it; it stops on its own with the song's object.
     */
    onBeat(listener: TBeatListener): () => void;
    /**
     * What in the notes could not be read. Empty until the song is ready, and when it is right.
     */
    readonly errors: readonly TSongError[];
    /**
     * The notes it plays, every voice's, in the order they start: each with its `voice`, its
     * `start` and length (`beats`) in beats from the start of the song, its `pitch` as a MIDI
     * number (a drum hit is `72`), and its `instrument` and `effects` when it has them. Silences are
     * not notes. Empty until the song is ready; there before it plays, to lay out a level from.
     *
     * One pass of the song: when it goes round its loop, `beat` goes back to the loop's start and
     * the same notes come again. Counted in beats, a note stays where it is when `setTempo` changes
     * the tempo; its `pitch` moves with `setTranspose`, as what is heard does, but a drum's.
     *
     * What a rhythm game is built from, without writing the song a second time:
     * ```ts
     * for (const note of song.notes) {
     *     if (note.voice === 'noise') place(note.start);
     * }
     * ```
     */
    readonly notes: readonly TSongNote[];
    readonly playing: boolean;
};
