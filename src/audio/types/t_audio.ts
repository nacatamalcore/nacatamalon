import type { TBox } from '../../box/types/t_box';
import type { TSoundAttachment } from './t_sound';
import type { TSoundLogger } from '../sound_log';

/**
 * One sounding voice: the node playing the sound and everything wired after it.
 *
 * A sound is not a thing that plays, it is a thing that **can be played**: every `play` makes one of
 * these and throws it away when it ends, which is why two coins picked up at once are heard twice.
 *
 * @internal
 */
export type TVoice = {
    node: AudioBufferSourceNode;
    /**
     * This voice's own volume, before the channel's.
     */
    gain: GainNode;
    /**
     * Which channel it goes through, so it can be silenced with the rest of its kind.
     */
    channel: string;
    /**
     * Set only for a sound placed at a point in the world. `null` for a plain one.
     */
    panner: PannerNode | null;
    /**
     * Where between left and right it is heard, when it is not placed by its object: absent where
     * the audio engine has no way to do it.
     */
    stereo?: StereoPannerNode | null;
    /**
     * Set only for a sound that fills an area: how loud it is where the listener stands.
     */
    area: GainNode | null;
    /**
     * The object a placed sound belongs to, and what it asked for, both read every frame: the
     * object for where it is now, the sound for its shape and its distances. `null` for a plain one.
     */
    box: TBox | null;
    sound: TSoundAttachment | null;
    /**
     * The sound this voice came from, read every frame for the channel it holds down while it plays.
     * `null` for a voice that holds nothing down, like a layer of music.
     */
    from: TSoundAttachment | null;
    /**
     * What a log of the game's sound (`startSoundLog`) needs of it: where in its sound it is now, in
     * seconds, and the volumes it goes through after its node. Left out by a voice nobody logs.
     * `startsAt`, on the clock the music counts by, for a voice started ahead of when it is heard (a
     * stretch of a song made as it plays): logged as starting then, from its beginning. `group`, the
     * one sound it is a piece of (a voice of a song, heard a stretch at a time): logged with it, so a
     * count of what was heard counts the voice once.
     */
    track?: { position(): number; gains: AudioParam[]; startsAt?: number; group?: object };
};

/**
 * What a game's music counts time by: `'audio'`, the audio engine's own clock, what the ears hear
 * (always, in a game as shipped); or `'frames'`, the game's frames, for a host that runs the game a
 * frame at a time (an editor stepping it), where the music has to move with the frames and not with
 * the wall clock. On `'frames'` the audio engine is held still, so nothing is heard.
 *
 * @internal
 */
export type TAudioClock = 'audio' | 'frames';

/**
 * Everything one game's sound runs through: the browser's audio engine, the master volume, a volume
 * per channel, and the voices sounding right now.
 *
 * One per game, and made only when a game first asks for sound: a game with no audio never opens an
 * audio engine at all.
 *
 * @internal
 */
export type TAudioManager = {
    context: AudioContext;
    /**
     * Everything ends here, and this is the general volume.
     */
    master: GainNode;
    /**
     * The volume of each channel, made the first time the channel is named.
     */
    channels: Map<string, GainNode>;
    /**
     * A second volume behind a channel, the one sounds that hold the channel down move. Kept apart
     * so it never touches what an options screen set, and made only for channels that get held down.
     */
    duckGains: Map<string, GainNode>;
    /**
     * The channels held down right now: how low, so a ramp is only asked for when that changes, and
     * how long they take to come back up once let go.
     */
    duckTargets: Map<string, { to: number; release: number }>;
    /**
     * Every voice sounding right now, so they can be followed, silenced and stopped.
     */
    voices: Set<TVoice>;
    /**
     * What has to look at the audio clock once a frame: the tunes somebody is counting beats of.
     */
    tickers: Set<() => void>;
    /**
     * Seconds the game says sound reaches the player later than the device does, measured on the
     * player's own speakers or headphones: see `TAudioHandle.setOffset`. `0` until it says.
     */
    offset: number;
    /**
     * How long a sound started now takes to be heard, in seconds: the delay the device reports on
     * its way to the speaker, plus `offset`, never below `0`. What a tune's `position` and its beats
     * take off, so they are what the player hears. `0` under the frames' clock, where nothing
     * reaches a speaker.
     */
    heardDelay(): number;
    /**
     * The objects that carry ears, in the order they got them. The first one switched on is used.
     */
    listeners: TBox[];
    /**
     * Whether two sets of ears on at once has been reported already, so it is said once.
     */
    warnedListeners: boolean;
    /**
     * The sounds whose area has a shape of the other dimension, reported once each.
     */
    warnedZones: WeakSet<TSoundAttachment>;
    /**
     * The time the music counts by, in seconds: the audio engine's clock, or the frames' (see
     * {@link TAudioClock}). What a tune's position and its beats are measured on. Scheduling a node
     * or a ramp still goes by `context.currentTime`, which is what the audio engine understands.
     */
    now(): number;
    /**
     * The clock `now` counts by right now.
     */
    readonly clock: TAudioClock;
    /**
     * Counts by the other clock. Going to `'frames'` holds the audio engine still, and the frames'
     * time carries on from where the engine's was; coming back lets it go, and every tune playing
     * starts again from where the frames had got it to.
     */
    setClock(clock: TAudioClock): void;
    /**
     * Moves the frames' clock on by one frame's game time. Nothing on the audio clock.
     */
    advance(dt: number): void;
    /**
     * The page hidden, for a game whose sound stops while it cannot be seen (`pauseOnBlur`): the
     * audio engine is held still, every sound where it is, and runs on from there when the page is
     * seen again. Held still for the frames' clock or before the page is touched, it stays so.
     */
    setHidden(hidden: boolean): void;
    /**
     * The log of what the game sounds like being kept, or `null`: what a clip made a frame at a time
     * gets its sound from. See `startSoundLog`.
     */
    log: TSoundLogger | null;
    /**
     * What has to be put right when the clock goes back to the audio engine: each one reads where it
     * is first (on the frames' clock), and is handed back what to do once the clock has changed.
     */
    resyncs: Set<() => () => void>;
    /**
     * The channel's volume, made on the spot if this is the first time it is asked for.
     */
    channelGain(name: string): GainNode;
    /**
     * The channel's second volume, put in behind it the first time it is asked for.
     */
    duckGain(name: string): GainNode;
    /**
     * Stops everything and closes the audio engine.
     */
    destroy(): void;
};

/**
 * The volumes of a game, and the way to silence it. Returned by `useAudio`.
 *
 * A channel is a group of sounds that share a volume: `'sfx'` and `'music'` are there from the
 * start, and any other name works the moment a sound uses it. This is what an options screen with a
 * slider per kind of sound is made of, and what a game saves in its store.
 *
 * @category Audio
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TAudioHandle = {
    /**
     * Sets a volume, from `0` (silent) to `1` (as recorded). Louder than `1` is allowed and can
     * distort. With no channel it is the general one, which multiplies every channel. With `fade`
     * it gets there over that many seconds, which is how music ducks under a cutscene.
     */
    setVolume(volume: number, channel?: string, fade?: number): void;
    /**
     * The volume of a channel, or the general one. `1` for a channel nobody has used yet.
     */
    getVolume(channel?: string): number;
    /**
     * Stops every sound of a channel, or every sound of the game.
     */
    stopAll(channel?: string): void;
    /**
     * How much later than the device says the player hears sound, in seconds: what a calibration
     * screen measures (the player taps along to a beat) and the game keeps, as it keeps a volume.
     * Bluetooth headphones are often past 0.15; a device that reports more delay than there is
     * takes a negative number.
     *
     * Every song's `position`, `positionAt` and `latency` count it, and every beat (`onBeat`) comes
     * that much later, on the beat the player hears.
     */
    setOffset(seconds: number): void;
    /**
     * The offset set, `0` until one is.
     */
    getOffset(): number;
};
