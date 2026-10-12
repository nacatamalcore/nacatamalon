import { afterEach, beforeEach, describe, expect, it, spyOn } from 'bun:test';
import { createScene } from '../src/scene/create_scene';
import { stopScene } from '../src/scene/stop_scene';
import { useSound } from '../src/hooks/audio/use_sound';
import { useAudio } from '../src/hooks/audio/use_audio';
import { useMusic } from '../src/hooks/audio/use_music';
import { updateAudio, wrapPosition } from '../src/audio';
import { whenLoaded } from '../src/loaders';
import { createTestGame, startTestScene } from './helpers/test_game';
import { FAKE_DURATION, installFakeAudio } from './helpers/test_audio';
import type { TFakeContext, TFakeGain, TFakeParam, TFakeSource } from './helpers/test_audio';
import type { TRuntimeStore } from '../src/store';
import type { TMusicHandle, TSoundHandle, TSoundOptions } from '../src/audio';

/**
 * A sound that holds another channel down while it plays, and a loop with an intro that plays once.
 *
 * What matters about the first is what it must never do: touch the volume an options screen set,
 * or leave the music down after the cheer is over.
 */

let audio: ReturnType<typeof installFakeAudio>;
let fetchSpy: ReturnType<typeof spyOn> | null = null;

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
});

const contextOf = (store: TRuntimeStore): TFakeContext => store.get('audio').manager!.context as unknown as TFakeContext;

const loaded = async (store: TRuntimeStore): Promise<void> => {
    await Promise.all([...store.get('assets').sounds.values()].map((clip) => whenLoaded(clip)));
};

const started = (context: TFakeContext): TFakeSource[] => context.sources.filter((source) => source.started);

const lastRamp = (param: TFakeParam) => param.events.filter((event) => event.kind === 'ramp').at(-1);

/**
 * The second volume behind a channel, the one ducking moves.
 */
const duckOf = (store: TRuntimeStore, channel: string): TFakeGain =>
    store.get('audio').manager!.duckGains.get(channel) as unknown as TFakeGain;

/**
 * A level with music and the sounds asked for, all loaded.
 */
const withSounds = async (sounds: Record<string, TSoundOptions>) => {
    const { store } = createTestGame();
    const handles: Record<string, TSoundHandle> = {};
    let options!: ReturnType<typeof useAudio>;
    startTestScene(store, 'Level', () => {
        useSound({ src: '/audio/theme.ogg' }, { channel: 'music', loop: true, autoplay: true });
        for (const [name, soundOptions] of Object.entries(sounds)) {
            handles[name] = useSound({ src: `/audio/${name}.ogg` }, soundOptions);
        }
        options = useAudio();
        return createScene();
    });
    await loaded(store);
    return { store, handles, options, context: contextOf(store) };
};

describe('a sound that holds a channel down', () => {
    it('takes the music down the moment it starts, over its fade', async () => {
        const { store, handles, context } = await withSounds({ ovation: { duck: { channel: 'music', to: 0.3, fade: 0.2 } } });
        context.currentTime = 10;

        handles.ovation.play();

        expect(lastRamp(duckOf(store, 'music').gain)).toEqual({ kind: 'ramp', value: 0.3, time: 10.2 });
    });

    it('sits between the channel and the master, and leaves the options volume alone', async () => {
        const { store, handles, options } = await withSounds({ ovation: { duck: { channel: 'music', to: 0.3 } } });
        options.setVolume(0.5, 'music');
        const manager = store.get('audio').manager!;

        handles.ovation.play();

        const channel = manager.channels.get('music') as unknown as TFakeGain;
        expect(channel.connectedTo).toBe(duckOf(store, 'music'));
        expect(duckOf(store, 'music').connectedTo).toBe(manager.master as unknown as TFakeGain);
        expect(options.getVolume('music')).toBe(0.5);
    });

    it('lets the music back up once it ends, over its release', async () => {
        const { store, handles, context } = await withSounds({ ovation: { duck: { channel: 'music', to: 0.3, release: 1 } } });
        handles.ovation.play();
        context.currentTime = 4;

        // A one-off that runs out: the browser says so, and the next frame notices.
        started(context).at(-1)!.onended?.();
        updateAudio(store);

        expect(lastRamp(duckOf(store, 'music').gain)).toEqual({ kind: 'ramp', value: 1, time: 5 });
    });

    it('lets it back up when it is stopped, and when its object leaves', async () => {
        const { store, handles } = await withSounds({ alarm: { loop: true, duck: { channel: 'music', to: 0.2 } } });
        handles.alarm.play();
        handles.alarm.stop();
        expect(lastRamp(duckOf(store, 'music').gain)?.value).toBe(1);

        handles.alarm.play();
        expect(lastRamp(duckOf(store, 'music').gain)?.value).toBe(0.2);
        stopScene(store, 'Level');
        updateAudio(store);
        expect(lastRamp(duckOf(store, 'music').gain)?.value).toBe(1);
    });

    it('keeps the quietest when two hold the same channel down', async () => {
        const { store, handles } = await withSounds({
            cheer: { duck: { channel: 'music', to: 0.5 } },
            voice: { duck: { channel: 'music', to: 0.2 } },
        });

        handles.cheer.play();
        handles.voice.play();
        expect(lastRamp(duckOf(store, 'music').gain)?.value).toBe(0.2);

        handles.voice.stop();
        expect(lastRamp(duckOf(store, 'music').gain)?.value).toBe(0.5);
    });

    it('asks for nothing new while nothing changes', async () => {
        const { store, handles } = await withSounds({ ovation: { duck: { channel: 'music', to: 0.3 } } });
        handles.ovation.play();
        const before = duckOf(store, 'music').gain.events.length;

        updateAudio(store);
        updateAudio(store);

        expect(duckOf(store, 'music').gain.events.length).toBe(before);
    });

    it('adds no node to a game that never ducks', async () => {
        const { store, handles } = await withSounds({ coin: {} });
        handles.coin.play();
        updateAudio(store);

        expect(store.get('audio').manager!.duckGains.size).toBe(0);
    });
});

describe('a loop with an intro', () => {
    it('goes round between the two points once past the end, never back to the intro', () => {
        expect(wrapPosition(1, 10, 2, 8)).toBe(1);
        expect(wrapPosition(7, 10, 2, 8)).toBe(7);
        expect(wrapPosition(8, 10, 2, 8)).toBe(2);
        expect(wrapPosition(15, 10, 2, 8)).toBe(3);
        // No end is the end of the file.
        expect(wrapPosition(12, 10, 2, 0)).toBe(4);
        // Nonsense is the whole file, as the browser takes it.
        expect(wrapPosition(12, 10, 9, 3)).toBe(2);
    });

    it('tells the sound node where to go round, and resumes a paused sound inside the loop', async () => {
        const { handles, context } = await withSounds({ rain: { loop: true, loopStart: 1, loopEnd: 3 } });
        context.currentTime = 0;
        handles.rain.play();
        const first = started(context).at(-1)!;
        expect([first.loopStart, first.loopEnd]).toEqual([1, 3]);

        context.currentTime = 3.5;
        handles.rain.pause();
        handles.rain.resume();

        expect(started(context).at(-1)!.startOffset).toBe(1.5);
    });

    it('does the same for music in layers, every layer at the same place', async () => {
        const { store } = createTestGame();
        let music!: TMusicHandle;
        startTestScene(store, 'Level', () => {
            music = useMusic({ layers: { a: { src: '/audio/a.ogg' }, b: { src: '/audio/b.ogg' } }, loopStart: 1 });
            return createScene();
        });
        await loaded(store);
        const context = contextOf(store);

        music.play();
        context.currentTime = FAKE_DURATION + 0.5;
        music.pause();
        music.resume();

        const layers = started(context).slice(-2);
        expect(layers.map((layer) => layer.loopStart)).toEqual([1, 1]);
        expect(layers.map((layer) => layer.startOffset)).toEqual([1.5, 1.5]);
    });
});
