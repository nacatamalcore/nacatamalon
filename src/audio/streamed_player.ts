import { rampTo } from './ramp';
import { clampPan, stereoPannerOf } from './stereo';
import { wrapPosition } from './loop_position';
import { logVoice } from './sound_log';
import type { TAudioManager, TVoice } from './types/t_audio';
import type { TSongStream } from './synth/song_stream';

/**
 * How far ahead of what is heard a song is made, in seconds: what covers a frame that comes late
 * (a picture being decoded, the garbage collected) without the music running out. Made again from
 * where it is heard when its tempo or key changes, so this is not how late a change is heard.
 *
 * @internal
 */
export const STREAM_AHEAD = 0.5;

/**
 * How long each stretch it makes is, in seconds. Short, so what each frame makes is about the same:
 * on a native runtime, where the game's code is interpreted, the Genesis's FM costs a few
 * milliseconds a frame, and stretches three frames long put three frames' cost on one of them.
 * Not shorter, as every stretch is a sound of its own for the audio engine to keep in line.
 *
 * @internal
 */
export const STREAM_STRETCH = 0.02;

/**
 * How soon after it is asked a change of tempo or key is heard, in seconds: what the new stretches
 * need to be in place before the old ones stop.
 */
const SWITCH = 0.02;

/**
 * A quarter of a sample, added to every start: an engine that counts samples rounds down where a
 * stretch starts, and a start a hair under its sample would land one early, over the one before.
 */
const NUDGE = 0.25;

/**
 * One voice of the song as it is heard: its own volume, then where between left and right, kept
 * for as long as the song plays, every stretch of that voice going through it.
 */
type TLane = {
    name: string;
    gain: GainNode;
    stereo: StereoPannerNode | null;
    input: AudioNode;
};

/**
 * One stretch sounding, or waiting to: a sound per voice, from `at` to `until` on the clock the
 * music counts by, and where in the song it starts.
 */
type TStretch = { at: number; until: number; voices: TVoice[] };

/**
 * Where the song is, from a moment on: `sample` of the song (counted on round its loop, never
 * wrapped) at `at` on the clock the music counts by, going on `speed` samples a second until the
 * next one. Always in the samples of the stream playing now: when it is replaced, the marks before
 * are turned into the new one's, so where it is and its beat never mix two tempos.
 */
type TMark = { at: number; sample: number; speed: number };

type TRunning = {
    stream: TSongStream;
    piece: GainNode;
    lanes: TLane[];
    stretches: TStretch[];
    marks: TMark[];
    /**
     * Where on the clock the next stretch starts, and where in the song (on round its loop): kept in
     * whole samples from where it started, so a thousand stretches do not drift.
     */
    origin: number;
    made: number;
    /**
     * When it stops, fading out: nothing is made past it. `null` while it plays on.
     */
    endsAt: number | null;
    paused: boolean;
};

/**
 * Plays a song as it is made: what `useSong` is underneath.
 *
 * @internal
 */
export type TStreamedPlayer = {
    /**
     * Starts making it heard from `offset` seconds in, through its voices at the volumes asked.
     */
    start(stream: TSongStream, offset: number, fade: number): void;
    stop(fade: number): void;
    pause(): void;
    resume(): void;
    setVolume(volume: number, fade: number): void;
    setLayer(name: string, volume: number, fade: number): void;
    setLayerPan(name: string, pan: number, fade: number): void;
    /**
     * Goes on with another stream (the song at a new tempo, in a new key, or changed) from a moment
     * just ahead: where it then is in the old one, in seconds, is handed to `to`, which says where
     * that is in the new one. Staying paused if it was.
     */
    replace(stream: TSongStream, to: (seconds: number) => number): void;
    /**
     * Seconds into the song, wrapped round its loop. `null` when it is not playing.
     *
     * `lateBy` seconds earlier, for where the song is heard rather than played: taken off before it
     * is wrapped, so just after going round it is still at the end of the loop. Before anything of
     * it has been heard it is below `0`.
     */
    position(lateBy?: number): number | null;
    readonly playing: boolean;
};

/**
 * Builds the player for one song.
 *
 * @param audio - The game's audio.
 * @param options - The piece's `volume` and `channel`, and each voice's volume and place, read when
 * it starts.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const createStreamedPlayer = (
    audio: TAudioManager,
    options: { volume: () => number; channel: string; voiceVolume: (name: string) => number; voicePan: (name: string) => number },
): TStreamedPlayer => {
    let running: TRunning | null = null;
    // Where it stopped, while paused: seconds into the song, on round its loop.
    let pausedAt = 0;

    // The clock the music counts by turned into the audio engine's, for a sound to start on.
    const engineTime = (at: number): number => audio.context.currentTime + Math.max(0, at - audio.now());

    // Where the song is at `at`, on round its loop, in samples.
    const sampleAt = (current: TRunning, at: number): number => {
        let mark = current.marks[0]!;
        for (const next of current.marks) {
            if (next.at > at) break;
            mark = next;
        }
        return mark.sample + (at - mark.at) * mark.speed;
    };

    // Samples on round the loop as seconds into the song, wrapped round it.
    const wrapped = (stream: TSongStream, samples: number): number => {
        const r = stream.sampleRate;
        return wrapPosition(samples / r, stream.length / r, stream.loopSample / r, 0);
    };

    const laneNames = (stream: TSongStream): string[] => [...stream.voices, ...(stream.hasEcho ? ['echo'] : [])];

    const laneOf = (current: TRunning, name: string): TLane | undefined => current.lanes.find((lane) => lane.name === name);

    const buildLane = (name: string, piece: GainNode): TLane => {
        const gain = audio.context.createGain();
        gain.gain.value = name === 'echo' ? 1 : options.voiceVolume(name);
        // A voice is one channel: lifted a little as it is placed, to stay as loud in the middle.
        const pans = stereoPannerOf(audio.context, name === 'echo' ? 0 : options.voicePan(name), true);
        if (pans !== null) {
            gain.connect(pans.input);
            pans.stereo.connect(piece);
        } else {
            gain.connect(piece);
        }
        return { name, gain, stereo: pans?.stereo ?? null, input: gain };
    };

    // A stretch's sounds let go: at once, or cut at `from` and let go once it has passed.
    const drop = (stretch: TStretch, from?: number): void => {
        for (const voice of stretch.voices) {
            voice.node.onended = null;
            try {
                voice.node.stop(from === undefined ? undefined : engineTime(from));
            } catch { /* never started */ }
            if (from === undefined) {
                voice.node.disconnect();
                audio.voices.delete(voice);
            }
        }
        if (from !== undefined) stretch.until = from;
    };

    // Makes the next stretch and puts its sounds on the clock.
    const makeStretch = (current: TRunning): void => {
        const r = current.stream.sampleRate;
        const count = Math.max(1, Math.round(STREAM_STRETCH * r));
        const at = current.origin + current.made / r;
        const made = current.stream.render(count);
        const tracks: Array<[string, Float32Array]> = Object.entries(made.voices).map(([name, track]) => [name, track!]);
        if (made.echo !== null) tracks.push(['echo', made.echo]);
        const voices = tracks.flatMap(([name, track]): TVoice[] => {
            const lane = laneOf(current, name);
            if (lane === undefined) return [];
            const buffer = audio.context.createBuffer(1, track.length, r);
            buffer.copyToChannel(track as Float32Array<ArrayBuffer>, 0);
            const node = audio.context.createBufferSource();
            node.buffer = buffer;
            node.connect(lane.input);
            node.start(engineTime(at + NUDGE / r));
            const voice: TVoice = {
                node, gain: lane.gain, channel: options.channel, panner: null, stereo: lane.stereo, area: null, box: null, sound: null, from: null,
                track: { position: () => Math.max(0, audio.now() - at), gains: [current.piece.gain, lane.gain.gain], startsAt: at, group: lane },
            };
            audio.voices.add(voice);
            logVoice(audio, voice);
            return [voice];
        });
        current.stretches.push({ at, until: at + count / r, voices });
        current.made += count;
    };

    // Lets go of what has been heard and makes on up to `STREAM_AHEAD` past now, or to where it
    // stops fading out. `false` once it is over: stopped from outside, or faded all the way.
    const feed = (current: TRunning): boolean => {
        const now = audio.now();
        // Stopped from outside (every sound of its channel, say): it is not playing any more.
        if (current.stretches.some((stretch) => stretch.voices.some((voice) => !audio.voices.has(voice)))) {
            halt(current);
            return false;
        }
        while (current.stretches.length > 0 && current.stretches[0]!.until <= now) {
            drop(current.stretches.shift()!);
        }
        if (current.endsAt !== null && current.endsAt <= now) {
            halt(current);
            return false;
        }
        const r = current.stream.sampleRate;
        // Fallen behind: the game stopped for longer than what was made ahead (a frame of seconds, a
        // page that froze) while the sound went on. What it missed is not made late, all at once on
        // top of itself: it goes on from where the song is now, the gap a silence.
        const behind = now - (current.origin + current.made / r);
        if (behind > 0) {
            current.made += Math.ceil(behind * r);
            const sample = sampleAt(current, current.origin + current.made / r);
            current.stream.seek(Math.round(wrapped(current.stream, sample) * r));
        }
        const horizon = current.endsAt ?? now + STREAM_AHEAD;
        while (current.origin + current.made / r < horizon) {
            makeStretch(current);
        }
        // Where it was a moment ago is still asked, for where it is heard: a second is kept.
        while (current.marks.length > 1 && current.marks[1]!.at <= now - 1) current.marks.shift();
        return true;
    };

    const tick = (): void => {
        const current = running;
        if (current !== null && !current.paused && !feed(current)) running = null;
    };

    // Every voice of it silenced at once and let go, and it stops being made.
    const halt = (current: TRunning): void => {
        for (const stretch of current.stretches) drop(stretch);
        current.stretches = [];
        current.piece.disconnect();
        audio.tickers.delete(tick);
        audio.resyncs.delete(resync);
    };

    // The clock going back to the audio engine (after an editor ran the game a frame at a time):
    // made again from where the frames had got it to, so what is heard is where the game is.
    const resync = (): (() => void) => {
        const current = running;
        if (current === null || current.paused) return () => {};
        const seconds = sampleAt(current, audio.now()) / current.stream.sampleRate;
        return () => {
            if (running === current) {
                halt(current);
                running = null;
                begin(current.stream, seconds, 0, current.piece.gain.value);
            }
        };
    };

    // Starts it from `offset` seconds in (on round its loop), `fade` seconds to come in.
    const begin = (stream: TSongStream, offset: number, fade: number, volume = options.volume()): void => {
        const piece = audio.context.createGain();
        piece.gain.value = fade > 0 ? 0 : volume;
        piece.connect(audio.channelGain(options.channel));
        const r = stream.sampleRate;
        const sample = Math.round(offset * r);
        stream.seek(Math.round(wrapped(stream, sample) * r));
        const at = audio.now();
        const current: TRunning = {
            stream, piece, lanes: laneNames(stream).map((name) => buildLane(name, piece)), stretches: [], marks: [{ at, sample, speed: r }],
            origin: at, made: 0, endsAt: null, paused: false,
        };
        running = current;
        audio.tickers.add(tick);
        audio.resyncs.add(resync);
        feed(current);
        if (fade > 0) rampTo(piece.gain, volume, audio.context.currentTime, fade);
    };

    return {
        start: (stream, offset, fade) => {
            if (running !== null) {
                halt(running);
                running = null;
            }
            begin(stream, offset, fade);
        },
        stop: (fade) => {
            const current = running;
            if (current === null) return;
            running = null;
            if (fade <= 0 || current.paused) {
                halt(current);
                return;
            }
            // Let go of at once as far as anyone asking is concerned, and made on to the end of the
            // fade: playing again while this fades out is a new song over its tail.
            audio.tickers.delete(tick);
            current.endsAt = audio.now() + fade;
            rampTo(current.piece.gain, 0, audio.context.currentTime, fade);
            const fading = (): void => {
                if (!feed(current)) audio.tickers.delete(fading);
            };
            audio.tickers.add(fading);
            fading();
        },
        pause: () => {
            const current = running;
            if (current === null || current.paused) return;
            pausedAt = sampleAt(current, audio.now()) / current.stream.sampleRate;
            for (const stretch of current.stretches) drop(stretch);
            current.stretches = [];
            current.paused = true;
            audio.tickers.delete(tick);
        },
        resume: () => {
            const current = running;
            if (current === null || !current.paused) return;
            halt(current);
            running = null;
            begin(current.stream, pausedAt, 0, current.piece.gain.value);
        },
        setVolume: (volume, fade) => {
            if (running !== null && !running.paused) rampTo(running.piece.gain, volume, audio.context.currentTime, fade);
        },
        setLayer: (name, volume, fade) => {
            const current = running;
            const lane = current !== null && !current.paused ? laneOf(current, name) : undefined;
            if (lane !== undefined) rampTo(lane.gain.gain, volume, audio.context.currentTime, fade);
        },
        setLayerPan: (name, pan, fade) => {
            const current = running;
            const lane = current !== null && !current.paused ? laneOf(current, name) : undefined;
            if (lane !== undefined && lane.stereo !== null) rampTo(lane.stereo.pan, clampPan(pan), audio.context.currentTime, fade);
        },
        replace: (stream, to) => {
            const current = running;
            if (current === null) return;
            const names = laneNames(stream);
            for (const lane of current.lanes) {
                if (!names.includes(lane.name)) lane.gain.disconnect();
            }
            current.lanes = names.map((name) => laneOf(current, name) ?? buildLane(name, current.piece));
            if (current.paused) {
                pausedAt = to(pausedAt);
                current.stream = stream;
                return;
            }
            // The old stretches stop a moment ahead, where the new ones take over.
            const switchAt = audio.now() + SWITCH;
            const seconds = to(sampleAt(current, switchAt) / current.stream.sampleRate);
            for (const stretch of current.stretches) {
                if (stretch.at >= switchAt) drop(stretch);
                else if (stretch.until > switchAt) drop(stretch, switchAt);
            }
            current.stretches = current.stretches.filter((stretch) => stretch.at < switchAt);
            const oldRate = current.stream.sampleRate;
            const r = stream.sampleRate;
            const sample = Math.round(seconds * r);
            stream.seek(Math.round(wrapped(stream, sample) * r));
            // What was before the switch, said in the new stream's samples.
            const turned = current.marks.filter((mark) => mark.at < switchAt).map((mark): TMark => {
                const from = mark.sample / oldRate;
                return { at: mark.at, sample: to(from) * r, speed: (to(from + mark.speed / oldRate) - to(from)) * r };
            });
            current.stream = stream;
            current.origin = switchAt;
            current.made = 0;
            current.marks = [...turned, { at: switchAt, sample, speed: r }];
            feed(current);
        },
        position: (lateBy = 0) => {
            const current = running;
            if (current === null) return null;
            if (current.paused) return wrapped(current.stream, pausedAt * current.stream.sampleRate);
            const samples = sampleAt(current, audio.now() - lateBy);
            return samples < 0 ? samples / current.stream.sampleRate : wrapped(current.stream, samples);
        },
        get playing() {
            return running !== null && !running.paused;
        },
    };
};
