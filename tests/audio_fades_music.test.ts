import { afterEach, beforeEach, describe, expect, it, spyOn } from 'bun:test';
import { createScene } from '../src/scene/create_scene';
import { stopScene } from '../src/scene/stop_scene';
import { useSound } from '../src/hooks/audio/use_sound';
import { useAudio } from '../src/hooks/audio/use_audio';
import { useMusic } from '../src/hooks/audio/use_music';
import { whenLoaded } from '../src/loaders';
import { createTestGame, startTestScene } from './helpers/test_game';
import { FAKE_DURATION, installFakeAudio } from './helpers/test_audio';
import type { TFakeContext, TFakeGain, TFakeParam, TFakeSource } from './helpers/test_audio';
import type { TRuntimeStore } from '../src/store';
import type { TMusicHandle, TSoundHandle } from '../src/audio';

/**
 * The parts of a sound scene that happen over time: sounds that come in and go out, and music whose
 * layers move while it keeps its place.
 */

let audio: ReturnType<typeof installFakeAudio>;
let fetchSpy: ReturnType<typeof spyOn> | null = null;
let warn: ReturnType<typeof spyOn> | null = null;

beforeEach(() => {
    audio = installFakeAudio();
    fetchSpy = spyOn(globalThis, 'fetch').mockImplementation((async () => ({
        ok: true,
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

const loaded = async (store: TRuntimeStore): Promise<void> => {
    await Promise.all([...store.get('assets').sounds.values()].map((clip) => whenLoaded(clip)));
};

const started = (context: TFakeContext): TFakeSource[] => context.sources.filter((source) => source.started);

/**
 * The last ramp asked of a knob: where to, and by when.
 */
const lastRamp = (param: TFakeParam) => param.events.filter((event) => event.kind === 'ramp').at(-1);

const withSound = async (options: Parameters<typeof useSound>[1] = {}) => {
    const { store } = createTestGame();
    let sound!: TSoundHandle;
    startTestScene(store, 'Level', () => {
        sound = useSound({ src: '/audio/theme.mp3' }, options);
        return createScene();
    });
    await loaded(store);
    return { store, sound, context: contextOf(store) };
};

describe('fading a sound', () => {
    it('comes in from silence to its volume over the time asked', async () => {
        const { sound, context } = await withSound({ volume: 0.8, loop: true });
        context.currentTime = 5;

        sound.play({ fade: 2 });

        const gain = (started(context)[0].connectedTo as unknown as TFakeGain).gain;
        expect(gain.events[0]).toMatchObject({ kind: 'cancel' });
        expect(gain.events.find((event) => event.kind === 'set')).toEqual({ kind: 'set', value: 0, time: 5 });
        expect(lastRamp(gain)).toEqual({ kind: 'ramp', value: 0.8, time: 7 });
    });

    it('goes out to silence, and is stopped by the browser when the fade ends', async () => {
        const { store, sound, context } = await withSound({ loop: true });
        sound.play();
        context.currentTime = 3;

        sound.stop({ fade: 1 });

        const source = started(context)[0];
        expect(lastRamp((source.connectedTo as unknown as TFakeGain).gain)).toEqual({ kind: 'ramp', value: 0, time: 4 });
        expect(source.stopAt).toBe(4);
        // The browser said it ended, and it was let go.
        expect(sound.playing).toBe(false);
        expect(store.get('audio').manager!.voices.size).toBe(0);
    });

    it('stops at once when no fade is asked for', async () => {
        const { sound, context } = await withSound({ loop: true });
        sound.play();
        context.currentTime = 3;

        sound.stop();

        expect(started(context)[0].stopAt).toBe(0);
    });

    it('moves the volume of what is sounding over time', async () => {
        const { sound, context } = await withSound({ loop: true });
        sound.play();
        context.currentTime = 1;

        sound.setVolume(0.2, 0.5);

        expect(lastRamp((started(context)[0].connectedTo as unknown as TFakeGain).gain)).toEqual({ kind: 'ramp', value: 0.2, time: 1.5 });
    });

    it('moves a channel over time too', async () => {
        const { store, context } = await withSound();
        let handle!: ReturnType<typeof useAudio>;
        startTestScene(store, 'Options', () => { handle = useAudio(); return createScene(); });
        context.currentTime = 10;

        handle.setVolume(0.3, 'music', 2);

        // gains[2] is 'music'.
        expect(lastRamp(context.gains[2].gain)).toEqual({ kind: 'ramp', value: 0.3, time: 12 });
        expect(handle.getVolume('music')).toBe(0.3);
    });
});

/**
 * A level with music in two layers, loaded and ready.
 */
const withMusic = async (options: Partial<Parameters<typeof useMusic>[0]> = {}) => {
    const { store } = createTestGame();
    let music!: TMusicHandle;
    startTestScene(store, 'Level', () => {
        music = useMusic({
            layers: {
                land: { src: '/audio/land.ogg' },
                water: { src: '/audio/water.ogg', volume: 0 },
            },
            ...options,
        });
        return createScene();
    });
    await loaded(store);
    return { store, music, context: contextOf(store) };
};

/**
 * A layer's own volume knob: the one straight after its sound.
 */
const layerGain = (source: TFakeSource): TFakeParam => (source.connectedTo as unknown as TFakeGain).gain;

describe('music in layers', () => {
    it('starts every layer at the same moment, looping, each at its own volume, through the music channel', async () => {
        const { music, context } = await withMusic();
        context.currentTime = 2.5;

        music.play();

        const [land, water] = started(context);
        expect([land.startAt, water.startAt]).toEqual([2.5, 2.5]);
        expect([land.loop, water.loop]).toEqual([true, true]);
        expect([layerGain(land).value, layerGain(water).value]).toEqual([1, 0]);
        // Layer, then the piece, then the channel: gains[2] is 'music'.
        const piece = land.connectedTo!.connectedTo!;
        expect(water.connectedTo!.connectedTo).toBe(piece);
        expect(piece.connectedTo).toBe(context.gains[2]);
        expect(music.playing).toBe(true);
    });

    it('moves one layer over time and leaves the other alone', async () => {
        const { music, context } = await withMusic();
        music.play();
        context.currentTime = 4;

        music.setLayer('water', 1, 0.5);

        const [land, water] = started(context);
        expect(lastRamp(layerGain(water))).toEqual({ kind: 'ramp', value: 1, time: 4.5 });
        expect(layerGain(land).events).toHaveLength(0);
        expect(music.getLayer('water')).toBe(1);
    });

    it('says once about a layer it does not have, and carries on', async () => {
        warn = spyOn(console, 'warn').mockImplementation(() => {});
        const { music } = await withMusic();
        music.play();

        music.setLayer('drums', 1);
        music.setLayer('drums', 0);

        expect(warn).toHaveBeenCalledTimes(1);
        expect(String(warn.mock.calls[0][0])).toContain("'drums'");
        expect(music.getLayer('drums')).toBe(0);
        expect(music.playing).toBe(true);
    });

    it('keeps its layers in time across a pause', async () => {
        const { music, context } = await withMusic();
        context.currentTime = 1;
        music.play();
        context.currentTime = 1 + FAKE_DURATION + 1.5;

        music.pause();
        expect(music.playing).toBe(false);
        context.currentTime = 20;
        music.resume();

        const [, , land, water] = started(context);
        // Both come back at the same point of the tune, wrapped round the loop, at the same moment.
        expect([land.startAt, water.startAt]).toEqual([20, 20]);
        expect(land.startOffset).toBeCloseTo(1.5, 5);
        expect(water.startOffset).toBeCloseTo(1.5, 5);
    });

    it('fades the whole piece out and lets it go', async () => {
        const { store, music, context } = await withMusic();
        music.play();
        context.currentTime = 6;

        music.stop({ fade: 3 });

        const [land, water] = started(context);
        expect(lastRamp((land.connectedTo!.connectedTo as unknown as TFakeGain).gain)).toEqual({ kind: 'ramp', value: 0, time: 9 });
        expect([land.stopAt, water.stopAt]).toEqual([9, 9]);
        expect(music.playing).toBe(false);
        expect(store.get('audio').manager!.voices.size).toBe(0);
    });

    it('starts on its own once every layer is there', async () => {
        const { store, context } = await withMusic({ autoplay: true });
        await Promise.resolve();

        expect(started(context)).toHaveLength(2);
        stopScene(store, 'Level');
        expect(started(context).every((source) => source.stopped)).toBe(true);
    });
});
