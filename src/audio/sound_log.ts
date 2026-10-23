import type { TAudioManager, TVoice } from './types/t_audio';

/**
 * One point of a volume over time: where it is at `at` seconds into the log, reached in a straight
 * line from the point before when `ramp`, else set there.
 *
 * @category Audio
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TSoundLogPoint = { at: number; value: number; ramp: boolean };

/**
 * One sound heard while a log was kept: what it played, when, from where in it, and how loud along
 * the way. Enough to play it again offline, as it was heard.
 *
 * @category Audio
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TLoggedSound = {
    buffer: AudioBuffer;
    /**
     * When it began, in seconds from the start of the log (`0` for one already sounding then).
     */
    at: number;
    /**
     * Where in the sound it began, in seconds.
     */
    offset: number;
    /**
     * How fast it played: `1` as recorded.
     */
    rate: number;
    loop: { start: number; end: number } | null;
    /**
     * The volumes it went through, multiplied together: its own, and its piece's for music in layers.
     */
    volumes: TSoundLogPoint[][];
    /**
     * Its channel's and the general volume, as they were when it began.
     */
    level: number;
    /**
     * When it stopped, in seconds from the start of the log, or `null` if it was still sounding at
     * the end (or ran out on its own).
     */
    end: number | null;
    /**
     * The one sound it is a piece of, when it is heard in pieces (a voice of a song, made as it
     * plays): pieces of the same sound share it, so what was heard is counted by these.
     */
    group?: object;
};

/**
 * What a game sounded like while a log was kept (`TEditorHandle.startSoundLog`): every sound, with
 * its times on the clock the music counts by, so a clip made a frame at a time gets its sound.
 *
 * Where a sound was placed in the world, a channel held down by another sound, and changes of speed
 * along the way are not kept: it is the mix as the ears hear it in the middle of the room.
 *
 * @category Audio
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TSoundLog = { seconds: number; sounds: TLoggedSound[] };

/**
 * A log being kept.
 *
 * @internal
 */
export type TSoundLogger = {
    from: number;
    /**
     * Kept until it is stopped: after that, nothing more goes into what was handed back.
     */
    live: boolean;
    sounds: TLoggedSound[];
    open: Map<TVoice, TLoggedSound>;
};

type TLine = { points: TSoundLogPoint[]; now: () => number; log: TSoundLogger };

/**
 * The volume knobs being followed, each with the lines of points it adds to (one per sound it is
 * in: a piece's volume is in every one of its layers) and the clock they read.
 */
const followed = new WeakMap<AudioParam, TLine[]>();

/**
 * Where a line of points is at `at`.
 */
const valueAt = (points: TSoundLogPoint[], at: number): number => {
    let value = points[0]?.value ?? 1;
    for (let i = 0; i < points.length; i += 1) {
        const point = points[i]!;
        if (point.at > at) {
            if (point.ramp && i > 0) {
                const before = points[i - 1]!;
                const span = point.at - before.at;
                return span <= 0 ? point.value : before.value + (point.value - before.value) * ((at - before.at) / span);
            }
            return value;
        }
        value = point.value;
    }
    return value;
};

/**
 * Keeps a volume change in the log, if the knob is being followed: what `rampTo` tells it of.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const noteRamp = (param: AudioParam, target: number, seconds: number): void => {
    const lines = followed.get(param);
    if (lines === undefined) {
        return;
    }
    const live = lines.filter((line) => line.log.live);
    if (live.length < lines.length) {
        followed.set(param, live);
    }
    for (const line of live) {
        noteOn(line, target, seconds);
    }
};

/**
 * One volume change, into one sound's line of points.
 */
const noteOn = (line: TLine, target: number, seconds: number): void => {
    const at = line.now();
    // Whatever was on its way after now is dropped, as the ramp drops it.
    const from = valueAt(line.points, at);
    while (line.points.length > 0 && line.points[line.points.length - 1]!.at > at) {
        line.points.pop();
    }
    if (seconds <= 0) {
        line.points.push({ at, value: target, ramp: false });
        return;
    }
    line.points.push({ at, value: from, ramp: false }, { at: at + seconds, value: target, ramp: true });
};

/**
 * Keeps a voice in the log from now, if one is being kept: called by what starts voices, right after
 * starting one, and by `startSoundLog` for every voice already sounding.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const logVoice = (audio: TAudioManager, voice: TVoice): void => {
    const log = audio.log;
    const track = voice.track;
    const buffer = voice.node.buffer;
    if (log === null || track === undefined || buffer === null) {
        return;
    }
    const now = (): number => audio.now() - log.from;
    const ahead = track.startsAt !== undefined && track.startsAt > audio.now();
    const at = ahead ? track.startsAt! - log.from : now();
    const volumes = track.gains.map((param) => {
        const points: TSoundLogPoint[] = [{ at, value: param.value, ramp: false }];
        followed.set(param, [...(followed.get(param) ?? []), { points, now, log }]);
        return points;
    });
    const node = voice.node;
    const sound: TLoggedSound = {
        buffer,
        at,
        offset: ahead ? 0 : track.position(),
        rate: node.playbackRate.value,
        loop: node.loop ? { start: node.loopStart, end: node.loopEnd } : null,
        volumes,
        level: audio.channelGain(voice.channel).gain.value * audio.master.gain.value,
        end: null,
        ...(track.group !== undefined ? { group: track.group } : {}),
    };
    log.sounds.push(sound);
    log.open.set(voice, sound);
};

/**
 * The voices of the log that are not sounding any more, marked as stopped now. Once a frame.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const closeEndedVoices = (audio: TAudioManager): void => {
    const log = audio.log;
    if (log === null) {
        return;
    }
    for (const [voice, sound] of log.open) {
        if (!audio.voices.has(voice)) {
            sound.end = audio.now() - log.from;
            log.open.delete(voice);
        }
    }
};

/**
 * Starts a log of what the game sounds like, with what is sounding already, and gives back the way
 * to stop it and have it.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const startSoundLog = (audio: TAudioManager): (() => TSoundLog) => {
    const log: TSoundLogger = { from: audio.now(), live: true, sounds: [], open: new Map() };
    audio.log = log;
    for (const voice of audio.voices) {
        logVoice(audio, voice);
    }
    return () => {
        if (audio.log === log) {
            closeEndedVoices(audio);
            audio.log = null;
        }
        log.live = false;
        return { seconds: audio.now() - log.from, sounds: log.sounds };
    };
};
