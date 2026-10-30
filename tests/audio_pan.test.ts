import { afterEach, beforeEach, describe, expect, it, spyOn } from 'bun:test';
import { createScene } from '../src/scene/create_scene';
import { useSound } from '../src/hooks/audio/use_sound';
import { useSong } from '../src/hooks/audio/use_song';
import { useTween } from '../src/hooks/tween/use_tween';
import { runHookUpdates } from '../src/game/loop/runHookUpdates';
import { SONG_FORMAT, parseSongDoc, serializeSongDoc } from '../src/audio/synth';
import { parseSceneDoc, serializeScene } from '../src/scene/document';
import { whenLoaded } from '../src/loaders';
import { createTestGame, startTestScene } from './helpers/test_game';
import { installFakeAudio } from './helpers/test_audio';
import type { TFakeContext, TFakeGain, TFakeSource, TFakeStereoPanner } from './helpers/test_audio';
import type { TRuntimeStore } from '../src/store';
import type { TSongDoc } from '../src/audio/synth';
import type { TSongHandle, TSoundHandle } from '../src/audio';
import type { TTweenStarter } from '../src/hooks/tween/types/t_tween';

/**
 * Where between left and right a sound and each voice of a song are heard: set when made, moved
 * with a fade, written by a tween, and kept in the files.
 */

let audio: ReturnType<typeof installFakeAudio>;
beforeEach(() => { audio = installFakeAudio(); });
afterEach(() => { audio.restore(); });

const contextOf = (store: TRuntimeStore): TFakeContext => store.get('audio').manager!.context as unknown as TFakeContext;

/** The stereo panner a playing source goes through, after its own volume (and, mono, the lift). */
const stereoOf = (source: TFakeSource): TFakeStereoPanner => {
    let at = source.connectedTo;
    while (at !== null && at !== undefined && at.kind !== 'stereo') at = at.connectedTo;
    return at as unknown as TFakeStereoPanner;
};

const settle = async (): Promise<void> => {
    for (let i = 0; i < 5; i += 1) await Promise.resolve();
};

const SONG: TSongDoc = {
    format: SONG_FORMAT,
    tempo: 120,
    meter: [4, 4],
    voices: { pulse1: { notes: "c'1 |", pan: -0.5 }, pulse2: { notes: 'e1 |' }, triangle: { notes: 'c,1 |' } },
};

describe('a sound', () => {
    it('is heard where it is asked between left and right, kept inside -1 and 1', () => {
        const { store } = createTestGame();
        let sound!: TSoundHandle;
        startTestScene(store, 'Pan', () => {
            sound = useSound({ samples: new Float32Array(100), sampleRate: 8000 }, { pan: 0.4 });
            return createScene();
        });
        sound.play();
        const context = contextOf(store);
        const playing = context.sources.find((source) => source.started)!;

        expect(stereoOf(playing).pan.value).toBeCloseTo(0.4, 5);
        sound.pan = 3;
        expect(sound.pan).toBe(1);
        expect(stereoOf(playing).pan.value).toBe(1);
    });

    it('is as loud in the middle as with no pan at all: a mono sound is lifted by √2, a stereo one is not', async () => {
        const fetched = spyOn(globalThis, 'fetch').mockImplementation((async () => ({ ok: true, arrayBuffer: async () => new ArrayBuffer(8) })) as unknown as typeof fetch);
        const { store } = createTestGame();
        let mono!: TSoundHandle;
        let stereo!: TSoundHandle;
        startTestScene(store, 'Pan', () => {
            mono = useSound({ samples: new Float32Array(100), sampleRate: 8000 });
            stereo = useSound({ src: '/sfx/stereo.wav' });
            return createScene();
        });
        await whenLoaded(store.get('assets').sounds.get('/sfx/stereo.wav')!);
        mono.play();
        stereo.play();
        const [first, second] = contextOf(store).sources.filter((source) => source.started);

        // The audio engine shares a mono sound out at a little over 0.7 a side in the middle.
        const lift = first!.connectedTo!.connectedTo as unknown as TFakeGain;
        expect(lift.kind).toBe('gain');
        expect(lift.gain.value).toBeCloseTo(Math.SQRT2, 9);
        expect(lift.connectedTo!.kind).toBe('stereo');
        // A stereo file goes straight into it.
        expect(second!.connectedTo!.connectedTo!.kind).toBe('stereo');
        fetched.mockRestore();
    });

    it('moves with a fade, and a tween carries it across', () => {
        const { store } = createTestGame();
        let sound!: TSoundHandle;
        let tween!: TTweenStarter;
        const root = startTestScene(store, 'Pan', () => {
            sound = useSound({ samples: new Float32Array(100), sampleRate: 8000 }, { loop: true });
            tween = useTween();
            return createScene();
        });
        sound.play();
        const context = contextOf(store);
        const stereo = stereoOf(context.sources.find((source) => source.started)!);

        context.currentTime = 1;
        sound.setPan(-1, 2);
        expect(stereo.pan.events.filter((event) => event.kind === 'ramp').at(-1)).toEqual({ kind: 'ramp', value: -1, time: 3 });

        tween({ target: sound, to: { pan: 1 }, duration: 1 }).play();
        runHookUpdates(root, 0.5);
        expect(sound.pan).toBeCloseTo(0, 1);
        runHookUpdates(root, 0.5);
        expect(sound.pan).toBe(1);
        expect(stereo.pan.value).toBe(1);
    });

    it('is written down in the scene only when it is not in the middle', () => {
        const { store } = createTestGame();
        const root = startTestScene(store, 'Pan', () => {
            useSound({ src: '/sfx/a.wav' }, { pan: -0.25 });
            useSound({ src: '/sfx/b.wav' });
            return createScene();
        });
        const sounds = serializeScene(root).root.components.filter((component) => component.type === 'sound');

        expect(sounds.map((component) => (component as { pan?: number }).pan)).toEqual([-0.25, undefined]);
        expect(parseSceneDoc(serializeScene(root), '/scenes/pan.scene')).toEqual(serializeScene(root));
    });
});

describe('a song', () => {
    const withSong = async () => {
        const { store } = createTestGame();
        let song!: TSongHandle;
        let tween!: TTweenStarter;
        const root = startTestScene(store, 'Pan', () => {
            song = useSong(SONG, { pan: { triangle: 0.8 } });
            tween = useTween();
            return createScene();
        });
        await settle();
        song.play();
        const context = contextOf(store);
        // The voices start in the song's order: pulse1, pulse2, triangle.
        const [pulse1, pulse2, triangle] = context.sources.filter((source) => source.started).map(stereoOf);
        return { song, tween, root, context, pulse1: pulse1!, pulse2: pulse2!, triangle: triangle! };
    };

    it('puts each voice where its file says, or where it is asked', async () => {
        const { song, pulse1, pulse2, triangle } = await withSong();

        expect([pulse1.pan.value, pulse2.pan.value, triangle.pan.value]).toEqual([-0.5, 0, 0.8]);
        expect([song.pan.pulse1, song.pan.pulse2, song.pan.triangle]).toEqual([-0.5, 0, 0.8]);
    });

    it('moves a voice with a fade, and a tween carries one across', async () => {
        const { song, tween, root, context, pulse2 } = await withSong();

        context.currentTime = 2;
        song.setPan('pulse2', 1, 0.5);
        expect(pulse2.pan.events.filter((event) => event.kind === 'ramp').at(-1)).toEqual({ kind: 'ramp', value: 1, time: 2.5 });

        tween({ target: song.pan, to: { pulse2: -1 }, duration: 1 }).play();
        runHookUpdates(root, 1);
        expect(song.pan.pulse2).toBe(-1);
        expect(pulse2.pan.value).toBe(-1);
    });

    it('is written down in the scene with only the voices moved from the file', () => {
        const { store } = createTestGame();
        const root = startTestScene(store, 'Pan', () => {
            const song = useSong({ ...SONG }, { id: 'theme' });
            song.setPan('pulse2', 0.6);
            return createScene();
        });

        // A song written in code is not written down; what it carries is.
        expect(root.sounds.find((attachment) => attachment.type === 'song')).toMatchObject({ pan: { pulse2: 0.6 } });
    });
});

describe('a .song file', () => {
    it('keeps where each voice is, and refuses a pan that is not a number', () => {
        expect(parseSongDoc(JSON.parse(serializeSongDoc(SONG)), 'pan.song')).toEqual(SONG);
        expect(parseSongDoc({ tempo: 120, voices: { pulse1: { notes: 'c', pan: 4 } } }, 'pan.song').voices.pulse1!.pan).toBe(1);
        expect(() => parseSongDoc({ tempo: 120, voices: { pulse1: { notes: 'c', pan: 'left' } } }, 'pan.song')).toThrow(/"pan" of "pulse1"/);
    });
});
