import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { getAudioManager, updateAudio } from '../src/audio';
import { createStreamedPlayer, STREAM_AHEAD, STREAM_STRETCH } from '../src/audio/streamed_player';
import { startSoundLog } from '../src/audio/sound_log';
import { createSongStream } from '../src/audio/synth/song_stream';
import { renderSong, SONG_FORMAT } from '../src/audio/synth';
import { createTestGame } from './helpers/test_game';
import { installFakeAudio } from './helpers/test_audio';
import type { TFakeBuffer, TFakeContext } from './helpers/test_audio';
import type { TSongDoc } from '../src/audio/synth';
import type { TRuntimeStore } from '../src/store';

/**
 * A song heard as it is made: half a second of it made ahead of what is heard, a stretch at a time,
 * each stretch starting where the one before ends, and the whole of it, put together, the song made
 * all at once.
 */

// 120 beats a minute in 4/4: a beat is half a second and a bar two. Three bars, looping on the second.
const SONG: TSongDoc = {
    format: SONG_FORMAT,
    tempo: 120,
    meter: [4, 4],
    loop: { bar: 2 },
    voices: {
        pulse1: { notes: 'c4 d e f | g1 | a1 |' },
        triangle: { notes: 'c,1 | g,1 | f,1 |' },
        noise: { notes: 'x4 r x r | x4 r x r | x4 r x r |' },
    },
};

let audio: ReturnType<typeof installFakeAudio>;
beforeEach(() => {
    audio = installFakeAudio();
});
afterEach(() => audio.restore());

const setUp = () => {
    const { store } = createTestGame();
    const manager = getAudioManager(store);
    const context = manager.context as unknown as TFakeContext;
    const player = createStreamedPlayer(manager, { volume: () => 1, channel: 'music', voiceVolume: () => 1, voicePan: () => 0 });
    return { store, manager, context, player, stream: () => createSongStream(SONG, context.sampleRate) };
};

// The clock moved on and a frame run, the way the game's loop runs one.
const frame = (store: TRuntimeStore, context: TFakeContext, seconds: number): void => {
    context.currentTime += seconds;
    updateAudio(store, seconds);
};

// The sounds of one voice, in the order they start, made into one track.
const heard = (context: TFakeContext, from: number, voiceIndex: number, voices: number): Float32Array => {
    const sources = context.sources.filter((source) => source.started).slice(from);
    const own = sources.filter((_, index) => index % voices === voiceIndex);
    const length = own.reduce((sum, source) => sum + (source.buffer as TFakeBuffer).length, 0);
    const track = new Float32Array(length);
    let at = 0;
    for (const source of own) {
        track.set((source.buffer as TFakeBuffer).data, at);
        at += (source.buffer as TFakeBuffer).length;
    }
    return track;
};

const firstDifference = (a: Float32Array, b: Float32Array, length: number): number => {
    for (let i = 0; i < length; i += 1) if (a[i] !== b[i]) return i;
    return -1;
};

describe('a song heard as it is made', () => {
    it('is made half a second ahead of what is heard, and kept that far ahead', () => {
        const { store, context, player, stream } = setUp();
        player.start(stream(), 0, 0);

        const ahead = () => Math.max(...context.sources.filter((source) => !source.stopped).map((source) => source.startAt + (source.buffer as TFakeBuffer).duration));
        expect(ahead()).toBeGreaterThanOrEqual(STREAM_AHEAD);
        expect(ahead()).toBeLessThan(STREAM_AHEAD + 0.1);

        for (let i = 0; i < 30; i += 1) frame(store, context, 1 / 60);
        expect(ahead() - context.currentTime).toBeGreaterThanOrEqual(STREAM_AHEAD);
    });

    it('starts each stretch where the one before ends, in whole samples', () => {
        const { store, context, player, stream } = setUp();
        player.start(stream(), 0, 0);
        for (let i = 0; i < 60; i += 1) frame(store, context, 1 / 60);

        const pulse = context.sources.filter((_, index) => index % 3 === 0);
        for (let i = 1; i < pulse.length; i += 1) {
            const before = pulse[i - 1]!;
            const end = Math.round((before.startAt + (before.buffer as TFakeBuffer).duration) * context.sampleRate);
            expect(Math.floor(pulse[i]!.startAt * context.sampleRate)).toBe(end);
        }
    });

    it('is, put together, the song made all at once, round its loop and on', () => {
        const { store, context, player, stream } = setUp();
        const whole = renderSong(SONG, context.sampleRate);
        player.start(stream(), 0, 0);
        // Eight seconds: the whole song, then round the loop twice more.
        for (let i = 0; i < 8 * 60; i += 1) frame(store, context, 1 / 60);

        const voices = Object.keys(whole.voices);
        voices.forEach((voice, index) => {
            const track = heard(context, 0, index, voices.length);
            const expected = new Float32Array(track.length);
            for (let i = 0; i < track.length; i += 1) {
                expected[i] = whole.voices[voice as 'pulse1']![i < whole.length ? i : whole.loopSample + ((i - whole.length) % (whole.length - whole.loopSample))]!;
            }
            expect({ voice, first: firstDifference(track, expected, track.length) }).toEqual({ voice, first: -1 });
        });
    });

    it('says where it is by the audio clock, round its loop', () => {
        const { store, context, player, stream } = setUp();
        expect(player.position()).toBeNull();
        player.start(stream(), 0, 0);
        frame(store, context, 1.25);
        expect(player.position()).toBeCloseTo(1.25, 6);
        expect(player.position(0.25)).toBeCloseTo(1, 6);
        // Six seconds is the end, back to two: seven is three.
        frame(store, context, 5.75);
        expect(player.position()).toBeCloseTo(3, 6);
    });

    it('starts from a place in the middle', () => {
        const { context, player, stream } = setUp();
        const whole = renderSong(SONG, context.sampleRate);
        player.start(stream(), 2.5, 0);

        expect(player.position()).toBeCloseTo(2.5, 6);
        const track = heard(context, 0, 0, 3);
        expect(firstDifference(track, whole.voices.pulse1!.subarray(Math.round(2.5 * context.sampleRate)), 1000)).toBe(-1);
    });

    it('stops where it is when paused, and goes on from there', () => {
        const { store, context, player, stream } = setUp();
        player.start(stream(), 0, 0);
        frame(store, context, 1);
        player.pause();

        expect(player.playing).toBe(false);
        expect(context.sources.every((source) => source.stopped)).toBe(true);
        frame(store, context, 3);
        expect(player.position()).toBeCloseTo(1, 6);

        player.resume();
        expect(player.playing).toBe(true);
        frame(store, context, 0.5);
        expect(player.position()).toBeCloseTo(1.5, 6);
    });

    it('goes on with a new stream a moment ahead, where it then is in the new one', () => {
        const { store, context, player, stream } = setUp();
        player.start(stream(), 0, 0);
        frame(store, context, 1);
        const before = context.sources.length;

        // Twice as fast: a second at 120 is half a second at 240.
        player.replace(createSongStream({ ...SONG, tempo: 240 }, context.sampleRate), (seconds) => seconds / 2);

        // What was to sound after the switch is let go, and what was sounding across it is cut there.
        const old = context.sources.slice(0, before);
        expect(old.filter((source) => source.startAt > 1.03).every((source) => source.stopped)).toBe(true);
        // The new stretches start there, from where it is in the new song.
        const fresh = context.sources.slice(before);
        expect(Math.min(...fresh.map((source) => source.startAt))).toBeCloseTo(1.02, 3);
        frame(store, context, 0.02);
        expect(player.position()).toBeCloseTo((1.02) / 2, 3);
    });

    it('goes on from where the song is when the game was stopped longer than it made ahead', () => {
        const { store, context, player, stream } = setUp();
        const whole = renderSong(SONG, context.sampleRate);
        player.start(stream(), 0, 0);
        frame(store, context, 0.1);

        // Two seconds with no frame (a page that froze), the sound going on meanwhile.
        context.currentTime += 2;
        const before = context.sources.length;
        frame(store, context, 1 / 60);

        // Nothing made to start in the past, on top of itself: it starts now, where the song is now.
        const now = context.currentTime;
        const fresh = context.sources.slice(before);
        expect(Math.min(...fresh.map((source) => source.startAt))).toBeGreaterThanOrEqual(now - 1e-9);
        expect(player.position()).toBeCloseTo(now, 3);
        const at = Math.ceil(now * context.sampleRate);
        const pulse = fresh.filter((_, index) => index % 3 === 0)[0]!;
        const data = (pulse.buffer as TFakeBuffer).data;
        expect(firstDifference(data, whole.voices.pulse1!.subarray(at), data.length)).toBe(-1);
    });

    it('stops being made once its sounds are stopped from outside', () => {
        const { store, manager, context, player, stream } = setUp();
        player.start(stream(), 0, 0);
        frame(store, context, 0.2);

        // What stopping every sound of the music channel does.
        for (const voice of [...manager.voices]) {
            voice.node.stop();
            manager.voices.delete(voice);
        }
        const count = context.sources.length;
        frame(store, context, 1);

        expect(player.playing).toBe(false);
        expect(context.sources.length).toBe(count);
    });

    it('fades out to its end and stops being made there', () => {
        const { store, context, player, stream } = setUp();
        player.start(stream(), 0, 0);
        player.stop(2);
        expect(player.playing).toBe(false);

        for (let i = 0; i < 60; i += 1) frame(store, context, 1 / 30);
        const last = Math.max(...context.sources.map((source) => source.startAt));
        expect(last).toBeLessThan(2.01);
        expect(last).toBeGreaterThan(1.9);
    });

    it('is logged as its stretches are heard, each from when it starts', () => {
        const { store, manager, context, player, stream } = setUp();
        const stopLog = startSoundLog(manager);
        player.start(stream(), 0, 0);
        frame(store, context, 0.3);
        const log = stopLog();

        const starts = [...new Set(log.sounds.map((sound) => Math.round(sound.at * 1000) / 1000))].sort((a, b) => a - b);
        expect(starts.slice(0, 3)).toEqual([0, STREAM_STRETCH, 2 * STREAM_STRETCH]);
        expect(log.sounds.every((sound) => sound.offset === 0)).toBe(true);
        // Each voice is one sound heard, however many stretches it took.
        expect(log.sounds.length).toBeGreaterThan(3);
        expect(new Set(log.sounds.map((sound) => sound.group)).size).toBe(3);
    });
});

