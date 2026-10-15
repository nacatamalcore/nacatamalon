import { afterEach, beforeEach, describe, expect, it, spyOn } from 'bun:test';
import { createScene } from '../src/scene/create_scene';
import { useSong } from '../src/hooks/audio/use_song';
import { useMusic } from '../src/hooks/audio/use_music';
import { useLoadSong } from '../src/hooks/loaders/use_load_song';
import { updateAudio } from '../src/audio';
import { SONG_FORMAT } from '../src/audio/synth';
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
    it('plays one voice per track, together, looping on the bar it says, through the music channel', async () => {
        const { store, song, context } = await withSong({ autoplay: true });

        const voices = started(context);
        expect(voices).toHaveLength(3);
        expect(voices.every((voice) => voice.loop && voice.startAt === 0)).toBe(true);
        // The second bar starts two seconds in.
        expect(voices.map((voice) => voice.loopStart)).toEqual([2, 2, 2]);
        // Three whole bars, every track the same length.
        expect(voices.map((voice) => (voice.buffer as TFakeBuffer).duration)).toEqual([6, 6, 6]);
        const piece = voices[0]!.connectedTo!.connectedTo!;
        expect(piece.connectedTo).toBe(store.get('audio').manager!.channels.get('music') as unknown as TFakeGain);
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
        const gainOf = (index: number) => (started(context)[index]!.connectedTo as unknown as TFakeGain).gain;
        expect(gainOf(2).value).toBe(0);

        context.currentTime = 3;
        song.setVoice('noise', 1, 0.5);

        expect(lastRamp(gainOf(2))).toEqual({ kind: 'ramp', value: 1, time: 3.5 });
        expect(song.getVoice('noise')).toBe(1);
        expect(started(context)).toHaveLength(3);
    });

    it('speeds up carrying on from the same beat', async () => {
        const { song, context } = await withSong({ autoplay: true });
        // A second and a half in: the fourth beat.
        context.currentTime = 1.5;

        song.setTempo(240);

        const voices = started(context);
        expect(voices).toHaveLength(3);
        // The fourth beat at 240 is three quarters of a second in, and the tracks are half as long.
        expect(voices.map((voice) => voice.startOffset)).toEqual([0.75, 0.75, 0.75]);
        expect(voices.map((voice) => (voice.buffer as TFakeBuffer).duration)).toEqual([3, 3, 3]);
        expect(song.tempo).toBe(240);
    });

    it('changes key carrying on from where it was, and leaves the drums alone', async () => {
        const { song, context } = await withSong({ autoplay: true });
        const before = started(context).map((voice) => (voice.buffer as TFakeBuffer).data);
        context.currentTime = 1;

        song.setTranspose(12);

        const after = started(context);
        expect(after.map((voice) => voice.startOffset)).toEqual([1, 1, 1]);
        expect(after[0]!.buffer).not.toBe(before[0]);
        expect((after[0]!.buffer as TFakeBuffer).data).not.toEqual(before[0]!);
        expect((after[2]!.buffer as TFakeBuffer).data).toEqual(before[2]!);
    });

    it('says what in its notes it could not read, and plays the rest', async () => {
        warn = spyOn(console, 'warn').mockImplementation(() => {});
        const { song, context } = await withSong({ autoplay: true }, { ...SONG, voices: { pulse1: { notes: 'c4 d e |' } } });

        expect(song.errors).toHaveLength(1);
        expect(warn).toHaveBeenCalledTimes(1);
        expect(started(context)).toHaveLength(1);
    });

    it('stops with the scene', async () => {
        const { store, context } = await withSong({ autoplay: true });

        const { stopScene } = await import('../src/scene/stop_scene');
        stopScene(store, 'Ballpark');

        expect(started(context)).toHaveLength(0);
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
        expect(started(context).map((voice) => voice.startOffset)).toEqual([2, 2, 2]);
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

        const voices = started(context);
        expect(voices).toHaveLength(2);
        // The same fourth beat, at the new tempo.
        expect(voices.map((voice) => voice.startOffset)).toEqual([0.75, 0.75]);
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
