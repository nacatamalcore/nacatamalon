import { afterEach, beforeEach, describe, expect, it, spyOn } from 'bun:test';
import { createScene } from '../src/scene/create_scene';
import { useSong } from '../src/hooks/audio/use_song';
import { useMusic } from '../src/hooks/audio/use_music';
import { useAudio } from '../src/hooks/audio/use_audio';
import { useLoadSong } from '../src/hooks/loaders/use_load_song';
import { getAudioManager, updateAudio } from '../src/audio';
import { renderSong, SONG_FORMAT } from '../src/audio/synth';
import { parseSceneDoc, sceneFromDoc, serializeScene } from '../src/scene/document';
import { registerScene } from '../src/scene/register_scene';
import { startScene } from '../src/scene/start_scene';
import { whenLoaded } from '../src/loaders';
import { replaceSongDoc } from '../src/loaders/song';
import { createTestGame, startTestScene } from './helpers/test_game';
import { installFakeAudio } from './helpers/test_audio';
import type { TFakeBuffer, TFakeContext, TFakeGain, TFakeParam, TFakeSource } from './helpers/test_audio';
import type { TRuntimeStore } from '../src/store';
import type { TMusicHandle, TSongHandle, TSongOptions } from '../src/audio';
import type { TSongDoc } from '../src/audio/synth';
import type { TSceneDoc } from '../src/scene/document';

/**
 * A song written as notes, played in the game: the tune made into sound when it arrives, its voices
 * played together, and what a recording cannot do, done carrying on from the same beat.
 */

let audio: ReturnType<typeof installFakeAudio>;
let fetchSpy: ReturnType<typeof spyOn> | null = null;
let warn: ReturnType<typeof spyOn> | null = null;

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

beforeEach(() => {
    audio = installFakeAudio();
    fetchSpy = spyOn(globalThis, 'fetch').mockImplementation((async () => ({
        ok: true,
        json: async () => SONG,
        arrayBuffer: async () => new ArrayBuffer(8),
    })) as unknown as typeof fetch);
});

afterEach(() => {
    audio.restore();
    fetchSpy?.mockRestore();
    fetchSpy = null;
    warn?.mockRestore();
    warn = null;
});

const contextOf = (store: TRuntimeStore): TFakeContext => store.get('audio').manager!.context as unknown as TFakeContext;

const started = (context: TFakeContext): TFakeSource[] => context.sources.filter((source) => source.started && !source.stopped);

const lastRamp = (param: TFakeParam) => param.events.filter((event) => event.kind === 'ramp').at(-1);

/**
 * Lets the promises that hand a song over settle.
 */
const settle = async (): Promise<void> => {
    for (let i = 0; i < 5; i += 1) {
        await Promise.resolve();
    }
};

/**
 * What one voice played from `from` on, its stretches put together in the order they start: a song
 * is made as it plays, a stretch at a time, each voice of a stretch a sound of its own, in the order
 * its file lists them.
 */
const playedFrom = (context: TFakeContext, from: number, voice: number, voices: number): Float32Array => {
    const own = context.sources
        // Let go before it began (stopped at once), it was never heard.
        .filter((source) => source.started && source.startAt >= from - 1e-6 && (!source.stopped || source.stopAt > source.startAt))
        .filter((_, index) => index % voices === voice);
    const track = new Float32Array(own.reduce((sum, source) => sum + (source.buffer as TFakeBuffer).length, 0));
    let at = 0;
    for (const source of own) {
        track.set((source.buffer as TFakeBuffer).data, at);
        at += (source.buffer as TFakeBuffer).length;
    }
    return track;
};

/** The first sample two tracks differ at, over the shorter, or `-1`. */
const firstDifference = (a: Float32Array, b: Float32Array): number => {
    for (let i = 0; i < Math.min(a.length, b.length); i += 1) if (a[i] !== b[i]) return i;
    return -1;
};

/** The lanes a song plays through: one gain per voice, every stretch of the voice going into it. */
const lanesOf = (context: TFakeContext): TFakeGain[] => [...new Set(started(context).map((source) => source.connectedTo as unknown as TFakeGain))];

const withSong = async (options: TSongOptions = {}, song: TSongDoc = SONG) => {
    const { store } = createTestGame();
    let handle!: TSongHandle;
    startTestScene(store, 'Ballpark', () => {
        handle = useSong(song, options);
        return createScene();
    });
    await settle();
    return { store, song: handle, context: contextOf(store) };
};

describe('a song written as notes', () => {
    it('plays each voice through a lane of its own, together, made as it plays, through the music channel', async () => {
        const { store, song, context } = await withSong({ autoplay: true });

        const lanes = lanesOf(context);
        expect(lanes).toHaveLength(3);
        // The first stretch of every voice starts at once, together.
        expect(started(context).slice(0, 3).every((voice) => voice.startAt < 1 / context.sampleRate)).toBe(true);
        // Its own volume, then where it is between left and right (a voice is mono, so lifted by √2
        // first to stay as loud in the middle), then the whole song.
        const lift = lanes[0]!.connectedTo! as unknown as TFakeGain;
        expect(lift.gain.value).toBeCloseTo(Math.SQRT2, 9);
        expect(lift.connectedTo!.kind).toBe('stereo');
        const piece = lift.connectedTo!.connectedTo!;
        expect(piece.connectedTo).toBe(store.get('audio').manager!.channels.get('music') as unknown as TFakeGain);
        // What it plays is the song made at once, sample for sample.
        const whole = renderSong(SONG, context.sampleRate);
        expect(firstDifference(playedFrom(context, 0, 0, 3), whole.voices.pulse1!)).toBe(-1);
        expect(firstDifference(playedFrom(context, 0, 2, 3), whole.voices.noise!)).toBe(-1);
        expect(song.playing).toBe(true);
        expect(song.errors).toEqual([]);
    });
    it('is sound, not silence', async () => {
        const { context } = await withSong({ autoplay: true });

        for (const voice of started(context)) {
            expect((voice.buffer as TFakeBuffer).data.some((sample) => sample !== 0)).toBe(true);
        }
    });

    it('starts each voice at the volume asked, and moves one without losing its place', async () => {
        const { song, context } = await withSong({ autoplay: true, voices: { noise: 0 } });
        const noise = () => lanesOf(context)[2]!.gain;
        expect(noise().value).toBe(0);

        context.currentTime = 3;
        song.setVoice('noise', 1, 0.5);

        expect(lastRamp(noise())).toEqual({ kind: 'ramp', value: 1, time: 3.5 });
        expect(song.getVoice('noise')).toBe(1);
        expect(lanesOf(context)).toHaveLength(3);
    });
    it('speeds up carrying on from the same beat, a moment after it is asked', async () => {
        const { song, context } = await withSong({ autoplay: true });
        // A second and a half in: the fourth beat.
        context.currentTime = 1.5;

        song.setTempo(240);

        // Taken over 20 ms on, at 1.52: the beat there at 240 is 0.76 seconds in.
        const fast = renderSong({ ...SONG, tempo: 240 }, context.sampleRate);
        expect(firstDifference(playedFrom(context, 1.52, 0, 3), fast.voices.pulse1!.subarray(Math.round(0.76 * context.sampleRate)))).toBe(-1);
        expect(song.tempo).toBe(240);
    });
    it('carries on round its loop when it speeds up just before the end of it', async () => {
        const { song, context } = await withSong({ autoplay: true });
        // Just before the end of three bars that loop back to the second.
        context.currentTime = 5.99;

        song.setTempo(240);

        // Taken over at 6.01, which is 2.01 into the loop: at twice the speed, 1.005.
        const fast = renderSong({ ...SONG, tempo: 240 }, context.sampleRate);
        expect(firstDifference(playedFrom(context, 6.01, 0, 3), fast.voices.pulse1!.subarray(Math.round(1.005 * context.sampleRate)))).toBe(-1);
    });
    it('changes key carrying on from where it was, and leaves the drums alone', async () => {
        const { song, context } = await withSong({ autoplay: true });
        context.currentTime = 1;

        song.setTranspose(12);

        // Taken over at 1.02, the same place in a song as long as before.
        const at = Math.round(1.02 * context.sampleRate);
        const higher = renderSong(SONG, context.sampleRate, { transpose: 12 });
        const before = renderSong(SONG, context.sampleRate);
        expect(firstDifference(playedFrom(context, 1.02, 0, 3), higher.voices.pulse1!.subarray(at))).toBe(-1);
        expect(firstDifference(playedFrom(context, 1.02, 0, 3), before.voices.pulse1!.subarray(at))).not.toBe(-1);
        expect(firstDifference(playedFrom(context, 1.02, 2, 3), before.voices.noise!.subarray(at))).toBe(-1);
    });
    it('says what in its notes it could not read, and plays the rest', async () => {
        warn = spyOn(console, 'warn').mockImplementation(() => {});
        const { song, context } = await withSong({ autoplay: true }, { ...SONG, voices: { pulse1: { notes: 'c4 d e |' } } });

        expect(song.errors).toHaveLength(1);
        expect(warn).toHaveBeenCalledTimes(1);
        expect(lanesOf(context)).toHaveLength(1);
    });

    it('stops with the scene', async () => {
        const { store, context } = await withSong({ autoplay: true });

        const { stopScene } = await import('../src/scene/stop_scene');
        stopScene(store, 'Ballpark');

        expect(started(context)).toHaveLength(0);
    });
});

describe('the notes it plays', () => {
    it('lists every voice\'s notes in the order they start, before it plays, without its silences', async () => {
        const { song } = await withSong();

        expect(song.playing).toBe(false);
        expect(song.notes.slice(0, 8)).toEqual([
            { voice: 'pulse1', start: 0, beats: 1, pitch: 60 },
            { voice: 'triangle', start: 0, beats: 4, pitch: 48 },
            { voice: 'noise', start: 0, beats: 1, pitch: 72 },
            { voice: 'pulse1', start: 1, beats: 1, pitch: 62 },
            { voice: 'pulse1', start: 2, beats: 1, pitch: 64 },
            { voice: 'noise', start: 2, beats: 1, pitch: 72 },
            { voice: 'pulse1', start: 3, beats: 1, pitch: 65 },
            { voice: 'pulse1', start: 4, beats: 4, pitch: 67 },
        ]);
        // Six notes of the pulse, three of the triangle, two hits a bar of the noise.
        expect(song.notes).toHaveLength(15);
        expect(song.notes.filter((note) => note.voice === 'noise').map((note) => note.start)).toEqual([0, 2, 4, 6, 8, 10]);
    });

    it('has none until its file is in', async () => {
        const { store } = createTestGame();
        let song!: TSongHandle;
        startTestScene(store, 'Ballpark', () => {
            song = useSong(useLoadSong({ src: '/music/minuet.song' }));
            return createScene();
        });

        expect(song.notes).toEqual([]);
        await whenLoaded(store.get('assets').songs.get('/music/minuet.song')!);
        expect(song.notes).toHaveLength(15);
    });

    it('stays on its beats at another tempo, and moves its pitch with the key but the drums\'', async () => {
        const { song } = await withSong({ autoplay: true });
        const before = song.notes;

        song.setTempo(180);
        expect(song.notes.map((note) => note.start)).toEqual(before.map((note) => note.start));

        song.setTranspose(2);
        expect(song.notes.map((note) => note.pitch)).toEqual(before.map((note) => (note.voice === 'noise' ? 72 : note.pitch + 2)));
    });

    it('is read once, and again when its file is saved again', async () => {
        const { store } = createTestGame();
        let song!: TSongHandle;
        startTestScene(store, 'Ballpark', () => {
            song = useSong(useLoadSong({ src: '/music/minuet.song' }));
            return createScene();
        });
        await whenLoaded(store.get('assets').songs.get('/music/minuet.song')!);
        await settle();
        expect(song.notes).toBe(song.notes);

        replaceSongDoc(store, 'music/minuet.song', { ...SONG, voices: { triangle: SONG.voices.triangle } });
        expect(song.notes.map((note) => note.voice)).toEqual(['triangle', 'triangle', 'triangle']);
    });
});

describe('following the beat', () => {
    it('calls on every beat of the song, by the audio clock, with the beat of the bar and the bar', async () => {
        const { store, song, context } = await withSong({ autoplay: true });
        const heard: Array<[number, number]> = [];
        song.onBeat((beat, bar) => heard.push([beat, bar]));

        for (const time of [0, 0.2, 0.5, 1, 1.6, 2.1]) {
            context.currentTime = time;
            updateAudio(store);
        }

        expect(heard).toEqual([[1, 1], [2, 1], [3, 1], [4, 1], [1, 2]]);
    });

    it('calls on the beat that is heard: as late as the device and the player\'s offset make the sound', async () => {
        const { store } = createTestGame();
        let song!: TSongHandle;
        startTestScene(store, 'Rhythm', () => {
            song = useSong(SONG, { autoplay: true });
            useAudio().setOffset(0.1);
            return createScene();
        });
        await settle();
        const context = contextOf(store);
        (context as unknown as { outputLatency: number }).outputLatency = 0.1;
        const heard: Array<[number, number]> = [];
        song.onBeat((beat, bar) => heard.push([beat, bar]));

        // Played from 0, heard from 0.2: nothing of it reaches the player before then.
        for (const time of [0, 0.1]) {
            context.currentTime = time;
            updateAudio(store);
        }
        expect(heard).toEqual([]);
        for (const time of [0.25, 0.6, 0.75]) {
            context.currentTime = time;
            updateAudio(store);
        }
        expect(heard).toEqual([[1, 1], [2, 1]]);
        expect(song.latency).toBeCloseTo(0.2, 6);
        expect(song.position).toBeCloseTo(0.55, 6);
    });

    it('counts by the frames when a host steps the game, and plays on from there after', async () => {
        const { store, song, context } = await withSong({ autoplay: true });
        const heard: Array<[number, number]> = [];
        song.onBeat((beat, bar) => heard.push([beat, bar]));
        const manager = store.get('audio').manager!;

        manager.setClock('frames');
        expect(context.suspends).toBe(1);
        // The wall clock goes on; the music does not care.
        context.currentTime = 30;
        updateAudio(store, 0);
        for (let i = 0; i < 4; i += 1) {
            updateAudio(store, 0.5);
        }
        // Paused: frames of no game time.
        updateAudio(store, 0);
        updateAudio(store, 0);
        expect(heard).toEqual([[1, 1], [2, 1], [3, 1], [4, 1], [1, 2]]);

        // Heard again from where the frames got it to, and counted by the audio clock from there.
        manager.setClock('audio');
        const whole = renderSong(SONG, context.sampleRate);
        expect(firstDifference(playedFrom(context, 30, 0, 3), whole.voices.pulse1!.subarray(2 * context.sampleRate))).toBe(-1);
        context.currentTime += 0.5;
        updateAudio(store);
        expect(heard.at(-1)).toEqual([2, 2]);
    });

    it('counts every beat once over a long stretch of frames, going round its loop', async () => {
        const { store, song } = await withSong({ autoplay: true }, {
            format: SONG_FORMAT, tempo: 120, meter: [4, 4], voices: { pulse1: { notes: 'c4 e g e |' } },
        });
        const heard: number[] = [];
        song.onBeat((beat) => heard.push(beat));
        store.get('audio').manager!.setClock('frames');
        // 45 seconds a sixtieth at a time: the time added up lands a hair short of each loop's end.
        for (let i = 0; i < 2700; i += 1) {
            updateAudio(store, 1 / 60);
        }
        // Two a second, from the one at 0 to the one at 45 s.
        expect(heard).toHaveLength(91);
        expect(heard.slice(0, 9)).toEqual([1, 2, 3, 4, 1, 2, 3, 4, 1]);
    });

    it('starts on the frames when a host asked before there was any sound', async () => {
        const { store } = createTestGame();
        store.setState('audio', { clock: 'frames' });
        startTestScene(store, 'Ballpark', () => {
            useSong(SONG, { autoplay: true });
            return createScene();
        });
        await settle();
        expect(store.get('audio').manager!.clock).toBe('frames');
        expect(contextOf(store).suspends).toBe(1);
    });

    it('goes back to the bar the loop starts on when it goes round', async () => {
        const { store, song, context } = await withSong({ autoplay: true });
        const heard: Array<[number, number]> = [];
        song.onBeat((beat, bar) => heard.push([beat, bar]));

        // The song is three bars, six seconds; past that it is back in bar 2.
        context.currentTime = 5.6;
        updateAudio(store);
        context.currentTime = 6.1;
        updateAudio(store);

        expect(heard).toEqual([[4, 3], [1, 2]]);
    });

    it('stops when asked, and says nothing while the song is not playing', async () => {
        const { store, song, context } = await withSong();
        const heard: number[] = [];
        const stop = song.onBeat((beat) => heard.push(beat));

        updateAudio(store);
        song.play();
        updateAudio(store);
        stop();
        context.currentTime = 0.5;
        updateAudio(store);

        expect(heard).toEqual([1]);
    });

    it('works for music from files too, once it knows the tempo', async () => {
        const { store } = createTestGame();
        let music!: TMusicHandle;
        startTestScene(store, 'Level', () => {
            music = useMusic({ layers: { main: { src: '/audio/theme.ogg' } }, bpm: 60, beatsPerBar: 3, firstBeat: 0.5 });
            return createScene();
        });
        await Promise.all([...store.get('assets').sounds.values()].map((clip) => whenLoaded(clip)));
        const context = contextOf(store);
        const heard: Array<[number, number]> = [];
        music.onBeat((beat, bar) => heard.push([beat, bar]));

        music.play();
        for (const time of [0, 0.5, 1.5, 3.5]) {
            context.currentTime = time;
            updateAudio(store);
        }

        expect(heard).toEqual([[1, 1], [2, 1], [1, 2]]);
    });

    it('and for music from files, on the beat that is heard', async () => {
        const { store } = createTestGame();
        let music!: TMusicHandle;
        startTestScene(store, 'Level', () => {
            music = useMusic({ layers: { main: { src: '/audio/theme.ogg' } }, bpm: 60 });
            return createScene();
        });
        await Promise.all([...store.get('assets').sounds.values()].map((clip) => whenLoaded(clip)));
        const context = contextOf(store);
        (context as unknown as { outputLatency: number }).outputLatency = 0.3;
        const heard: number[] = [];
        music.onBeat((beat) => heard.push(beat));

        music.play();
        for (const time of [0, 0.2, 0.35, 1.2, 1.35]) {
            context.currentTime = time;
            updateAudio(store);
            heard.push(-time);
        }

        // Each beat comes 0.3 s after it is played: the first at 0.35, the second at 1.35.
        expect(heard).toEqual([-0, -0.2, 1, -0.35, -1.2, 2, -1.35]);
    });

    it('says where music from files is heard, in seconds and in beats from its first, and at a press', async () => {
        const { store } = createTestGame();
        let music!: TMusicHandle;
        let plain!: TMusicHandle;
        startTestScene(store, 'Level', () => {
            music = useMusic({ layers: { main: { src: '/audio/theme.ogg' } }, bpm: 120, firstBeat: 0.5 });
            plain = useMusic({ layers: { main: { src: '/audio/theme.ogg' } } });
            return createScene();
        });
        await Promise.all([...store.get('assets').sounds.values()].map((clip) => whenLoaded(clip)));
        const context = contextOf(store);
        (context as unknown as { outputLatency: number }).outputLatency = 0.1;
        expect([music.position, music.beat]).toEqual([null, null]);

        music.play();
        plain.play();
        context.currentTime += 2.35;
        // Heard: 2.25 s in, 0.1 s late. Its first beat is half a second in, two beats a second.
        expect(music.latency).toBeCloseTo(0.1, 6);
        expect(music.position).toBeCloseTo(2.25, 6);
        expect(music.beat).toBeCloseTo(3.5, 6);
        // Pressed a quarter of a second ago: what was heard then.
        expect(music.positionAt(performance.now() / 1000 - 0.25)!).toBeCloseTo(2, 2);
        // Without a tempo there are no beats to count, only seconds.
        expect(plain.position).toBeCloseTo(2.25, 6);
        expect(plain.beat).toBeNull();

        context.currentTime -= 2.3;
        // Heard before its first beat: below 0.
        expect(music.beat).toBeCloseTo(-1, 6);
    });
});

describe('where the song is heard', () => {
    it('says it in beats too, counting on from the start, right after a change of tempo', async () => {
        const { song, context } = await withSong();
        expect(song.beat).toBeNull();

        // 120 beats a minute: a beat each half second.
        song.play();
        context.currentTime += 1.75;
        expect(song.beat).toBeCloseTo(3.5, 6);

        // Twice as fast from here: on from the same beat, four beats a second once it is heard,
        // 20 ms on. Half a second later it has gone 0.02 s at two beats a second and 0.48 at four.
        song.setTempo(240);
        expect(song.beat).toBeCloseTo(3.5, 6);
        context.currentTime += 0.5;
        expect(song.beat).toBeCloseTo(3.5 + 0.02 * 2 + 0.48 * 4, 6);
    });

    it('says how far into the song it is, by the audio clock, and null while stopped', async () => {
        const { song, context } = await withSong();
        expect(song.position).toBeNull();

        song.play();
        context.currentTime += 1.25;
        expect(song.position).toBeCloseTo(1.25, 6);

        song.stop();
        expect(song.position).toBeNull();
    });

    it('takes off the time the sound takes to reach the speaker, and says how long that is', async () => {
        const { song, context } = await withSong();
        const late = context as unknown as { outputLatency: number; baseLatency: number };
        late.outputLatency = 0.15;
        late.baseLatency = 0.01;

        song.play();
        context.currentTime += 1;
        expect(song.latency).toBeCloseTo(0.16, 6);
        expect(song.position).toBeCloseTo(0.84, 6);
        // Right after it starts nothing has been heard yet: never before the beginning.
        context.currentTime -= 0.9;
        expect(song.position).toBe(0);
    });

    it('counts the player\'s offset, which can take off what a device reports and is not there', async () => {
        const { store } = createTestGame();
        let song!: TSongHandle;
        let offset!: () => number;
        startTestScene(store, 'Rhythm', () => {
            song = useSong(SONG);
            const audio = useAudio();
            audio.setOffset(-0.05);
            offset = () => audio.getOffset();
            return createScene();
        });
        await settle();
        const context = contextOf(store);
        (context as unknown as { outputLatency: number }).outputLatency = 0.2;
        song.play();
        context.currentTime += 1;
        expect(offset()).toBe(-0.05);
        expect(song.latency).toBeCloseTo(0.15, 6);
        expect(song.position).toBeCloseTo(0.85, 6);
    });

    it('is not late under the frame clock, where nothing reaches a speaker', async () => {
        const { store, song, context } = await withSong({ autoplay: true });
        (context as unknown as { outputLatency: number }).outputLatency = 0.2;
        store.get('audio').manager!.setClock('frames');
        updateAudio(store, 0);
        updateAudio(store, 0.5);
        expect(song.latency).toBe(0);
        expect(song.position).toBeCloseTo(0.5, 6);
    });

    it('goes back to the loop when the song goes round', async () => {
        const { song, context } = await withSong();
        song.play();
        // Six seconds long and going back to bar two, at two seconds: seven seconds in is a second into bar two again.
        context.currentTime += 7;
        expect(song.position).toBeCloseTo(3, 6);
    });

    it('just after going round, is still at the end of the loop, where the sound heard is', async () => {
        const { song, context } = await withSong();
        (context as unknown as { outputLatency: number }).outputLatency = 0.16;
        song.play();
        // Played: 0.05 s back into bar two. Heard: the last 0.11 s of bar three, not the intro.
        context.currentTime += 6.05;
        expect(song.position).toBeCloseTo(5.89, 6);
    });

    it('says where it was heard at the moment of a press, taking off how long ago that was', async () => {
        const { song, context } = await withSong();
        (context as unknown as { outputLatency: number }).outputLatency = 0.1;
        expect(song.positionAt(performance.now() / 1000)).toBeNull();

        song.play();
        context.currentTime += 6.05;
        // Pressed 0.2 s ago: heard then, 0.1 s late, was 0.3 s before what plays now, across the loop.
        const pressed = performance.now() / 1000 - 0.2;
        expect(song.positionAt(pressed)!).toBeCloseTo(5.75, 2);
        // A moment still to come is now: never ahead of what is heard.
        expect(song.positionAt(performance.now() / 1000 + 5)).toBeCloseTo(song.position!, 6);
    });

    it('under the frame clock, a press is as early as its frame', async () => {
        const { store, song } = await withSong({ autoplay: true });
        store.get('audio').manager!.setClock('frames');
        updateAudio(store, 0);
        updateAudio(store, 0.5);
        expect(song.positionAt(performance.now() / 1000 - 0.2)).toBeCloseTo(song.position!, 6);
    });
});

describe('a song in a scene document', () => {
    it('is loaded from its file, written down with its file in the manifest, and read back the same', async () => {
        const { store } = createTestGame();
        const root = startTestScene(store, 'Ballpark', () => {
            const song = useSong(useLoadSong({ src: '/music/minuet.song' }), { id: 'theme', autoplay: true, voices: { noise: 0.5 } });
            song.setTranspose(-2);
            return createScene();
        });
        await whenLoaded(store.get('assets').songs.get('/music/minuet.song')!);
        await settle();

        const doc = serializeScene(root);
        expect(doc.assets).toContainEqual({ type: 'song', key: '/music/minuet.song', src: '/music/minuet.song' });
        expect(doc.root.components).toEqual([
            { type: 'song', id: 'theme', song: '/music/minuet.song', autoplay: true, voices: { noise: 0.5 }, transpose: -2 },
        ]);
        expect(parseSceneDoc(doc, '/scenes/ballpark.scene')).toEqual(doc);

        const again = createTestGame().store;
        registerScene(again, doc.name, sceneFromDoc(doc as TSceneDoc));
        expect(serializeScene(startScene(again, doc.name))).toEqual(doc);
    });

    it('is ready only once the sound files its instruments name are read, and plays them', async () => {
        const WITH_SAMPLE: TSongDoc = {
            ...SONG,
            instruments: { hit: { sample: '/samples/hit.wav' } },
            voices: { ...SONG.voices, dpcm: { notes: "@hit c'4 r r r | c'4 r r r | c'4 r r r |" } },
        };
        fetchSpy!.mockImplementation((async (url: string) => ({
            ok: true,
            json: async () => WITH_SAMPLE,
            arrayBuffer: async () => new ArrayBuffer(String(url).length),
        })) as unknown as typeof fetch);
        const { store } = createTestGame();
        const tone = new Float32Array(11025).map((_, i) => Math.sin(i / 4) * 0.8);
        (getAudioManager(store).context as unknown as { decodeAudioData: unknown }).decodeAudioData = async () => ({
            length: tone.length, sampleRate: 22050, numberOfChannels: 1, getChannelData: () => tone,
        });
        let song!: TSongHandle;
        startTestScene(store, 'Ballpark', () => {
            song = useSong(useLoadSong({ src: '/music/drums.song' }), { autoplay: true });
            return createScene();
        });
        const file = store.get('assets').songs.get('/music/drums.song')!;
        await whenLoaded(file);
        await settle();

        expect(fetchSpy!.mock.calls.map((call: unknown[]) => String(call[0]))).toContain('/samples/hit.wav');
        expect(file.samples.get('/samples/hit.wav')?.sampleRate).toBe(22050);
        expect(song.playing).toBe(true);
        // pulse1, triangle, noise and the samples, each through its own lane, and each heard.
        const context = contextOf(store);
        expect(lanesOf(context)).toHaveLength(4);
        for (let voice = 0; voice < 4; voice += 1) {
            expect(playedFrom(context, 0, voice, 4).some((value) => value !== 0)).toBe(true);
        }
    });

    it('takes its file saved again while it plays, carrying on from the same beat', async () => {
        const { store } = createTestGame();
        let song!: TSongHandle;
        const root = startTestScene(store, 'Ballpark', () => {
            song = useSong(useLoadSong({ src: '/music/minuet.song' }), { autoplay: true });
            return createScene();
        });
        await whenLoaded(store.get('assets').songs.get('/music/minuet.song')!);
        await settle();
        const context = contextOf(store);
        // The fourth beat, a second and a half in.
        context.currentTime = 1.5;

        // Saved again in the editor: twice as fast, and the noise left out.
        const faster: TSongDoc = { ...SONG, tempo: 240, voices: { pulse1: SONG.voices.pulse1, triangle: SONG.voices.triangle } };
        expect(replaceSongDoc(store, 'music/minuet.song', faster)).toBe(1);
        expect(replaceSongDoc(store, '/music/other.song', faster)).toBe(0);
        for (const update of root.updateCallbacks) update(1 / 60, 0);

        // Taken over 20 ms on, at 1.52, through the two voices it has now: the same place at the new
        // tempo is 0.76 seconds in.
        const after = context.sources.filter((source) => source.startAt >= 1.52 - 1e-6);
        expect(new Set(after.map((source) => source.connectedTo)).size).toBe(2);
        const whole = renderSong(faster, context.sampleRate);
        expect(firstDifference(playedFrom(context, 1.52, 0, 2), whole.voices.pulse1!.subarray(Math.round(0.76 * context.sampleRate)))).toBe(-1);
        expect(song.tempo).toBe(240);

        // Nothing new: nothing made again.
        const before = context.sources.length;
        for (const update of root.updateCallbacks) update(1 / 60, 0);
        expect(context.sources.length).toBe(before);
    });

    it('is not written down when it was written in code, since there is no file to name', async () => {
        const { store } = createTestGame();
        const root = startTestScene(store, 'Ballpark', () => {
            useSong(SONG);
            return createScene();
        });

        expect(serializeScene(root).root.components).toEqual([]);
    });
});

describe('a sound effect made from a preset', () => {
    it('plays like any sound, and is not written down, since there is no file to name', async () => {
        const { useSound } = await import('../src/hooks/audio/use_sound');
        const { store } = createTestGame();
        let coin!: ReturnType<typeof useSound>;
        const root = startTestScene(store, 'Level', () => {
            coin = useSound({ sfx: { preset: 'coin', seed: 2 } }, { volume: 0.5 });
            return createScene();
        });
        const context = contextOf(store);

        coin.play();

        const source = started(context)[0]!;
        expect((source.buffer as TFakeBuffer).data.some((sample) => sample !== 0)).toBe(true);
        expect((source.buffer as TFakeBuffer).sampleRate).toBe(context.sampleRate);
        expect(serializeScene(root).root.components).toEqual([]);
    });
});

describe('a sound made in code, sample by sample', () => {
    it('plays the samples at their own rate, copied, and is not written down', async () => {
        const { useSound } = await import('../src/hooks/audio/use_sound');
        const { store } = createTestGame();
        const samples = new Float32Array([0, 0.5, -0.5, 0.25]);
        let motor!: ReturnType<typeof useSound>;
        const root = startTestScene(store, 'Level', () => {
            motor = useSound({ samples, sampleRate: 22050, key: 'motor' }, { loop: true });
            return createScene();
        });
        const context = contextOf(store);

        // Changed after the sound was made: what plays is what it was made from.
        samples[1] = 1;
        motor.play();

        const buffer = started(context)[0]!.buffer as TFakeBuffer;
        expect(Array.from(buffer.data)).toEqual([0, 0.5, -0.5, 0.25]);
        expect(buffer.sampleRate).toBe(22050);
        expect((root.sounds[0] as { clip: { key: string } }).clip.key).toBe('motor');
        expect(serializeScene(root).root.components).toEqual([]);
    });

    it('refuses a rate no audio engine plays, saying which', async () => {
        const { useSound } = await import('../src/hooks/audio/use_sound');
        const { store } = createTestGame();
        expect(() => startTestScene(store, 'Level', () => {
            useSound({ samples: new Float32Array(8), sampleRate: 100 });
            return createScene();
        })).toThrow('[NacatamalOn] useSound: a sampleRate of 100');
    });
});
