import { afterEach, beforeEach, describe, expect, it, spyOn } from 'bun:test';
import { createScene } from '../src/scene/create_scene';
import { useSound } from '../src/hooks/audio/use_sound';
import { useMusic } from '../src/hooks/audio/use_music';
import { useAudio } from '../src/hooks/audio/use_audio';
import { updateAudio, startSoundLog } from '../src/audio';
import { whenLoaded } from '../src/loaders';
import { createTestGame, startTestScene } from './helpers/test_game';
import { installFakeAudio } from './helpers/test_audio';
import type { TRuntimeStore } from '../src/store';
import type { TAudioHandle, TMusicHandle, TSoundHandle } from '../src/audio';

/**
 * A log of what a game sounds like, kept while an editor steps it a frame at a time with the audio
 * engine held still: what a clip gets its sound from. Pinned: every sound with when it began and
 * stopped on the frames' clock, from where in it, its fades, and its channel's volume; what was
 * sounding already when the log began; and nothing after the log was handed over.
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

const loaded = async (store: TRuntimeStore): Promise<void> => {
    await Promise.all([...store.get('assets').sounds.values()].map((clip) => whenLoaded(clip)));
};

const withSounds = async () => {
    const { store } = createTestGame();
    let bat!: TSoundHandle;
    let music!: TMusicHandle;
    let volumes!: TAudioHandle;
    startTestScene(store, 'Ballpark', () => {
        bat = useSound({ src: '/sfx/bat.wav' }, { volume: 0.5 });
        music = useMusic({ layers: { theme: { src: '/music/theme.ogg' } }, volume: 0.8 });
        volumes = useAudio();
        return createScene();
    });
    await loaded(store);
    const manager = store.get('audio').manager!;
    manager.setClock('frames');
    // Frames of game time, as an editor steps them.
    const frames = (seconds: number): void => {
        for (let i = 0; i < Math.round(seconds * 60); i += 1) {
            updateAudio(store, 1 / 60);
        }
    };
    return { store, bat, music, volumes, manager, frames };
};

describe('a log of the game\'s sound', () => {
    it('keeps each sound with when it began and stopped, on the frames, and its volume', async () => {
        const { bat, manager, frames, volumes } = await withSounds();
        volumes.setVolume(0.5, 'sfx');
        const stop = startSoundLog(manager);
        frames(1);
        bat.play();
        frames(0.5);
        bat.stop();
        frames(0.5);

        const log = stop();
        expect(log.seconds).toBeCloseTo(2);
        expect(log.sounds).toHaveLength(1);
        const [sound] = log.sounds;
        expect(sound!.at).toBeCloseTo(1);
        expect(sound!.end).toBeCloseTo(1.5, 1);
        expect(sound!.offset).toBe(0);
        expect(sound!.loop).toBeNull();
        expect(sound!.volumes).toEqual([[{ at: sound!.at, value: 0.5, ramp: false }]]);
        // The channel at half, the general volume at full.
        expect(sound!.level).toBeCloseTo(0.5);
    });

    it('keeps what was sounding already, from where it had got to', async () => {
        const { music, manager, frames } = await withSounds();
        music.play();
        frames(1.5);

        const stop = startSoundLog(manager);
        frames(1);
        const log = stop();
        expect(log.sounds).toHaveLength(1);
        expect(log.sounds[0]).toMatchObject({ at: 0, end: null, loop: { start: 0 } });
        expect(log.sounds[0]!.offset).toBeCloseTo(1.5);
        // The piece's volume and the layer's.
        expect(log.sounds[0]!.volumes.map((line) => line[0]!.value)).toEqual([0.8, 1]);
    });

    it('keeps a fade in and a fade out as lines of volume', async () => {
        const { bat, manager, frames } = await withSounds();
        const stop = startSoundLog(manager);
        bat.play({ fade: 0.5 });
        frames(1);
        bat.stop({ fade: 1 });
        frames(2);

        const [line] = stop().sounds[0]!.volumes;
        expect(line!.map(({ value, ramp }) => [value, ramp])).toEqual([[0, false], [0, false], [0.5, true], [0.5, false], [0, true]]);
        expect(line![2]!.at).toBeCloseTo(0.5);
        expect(line![3]!.at).toBeCloseTo(1);
        expect(line![4]!.at).toBeCloseTo(2);
    });

    it('takes nothing more once handed over', async () => {
        const { bat, manager, frames } = await withSounds();
        const stop = startSoundLog(manager);
        bat.play();
        const log = stop();
        bat.stop({ fade: 1 });
        bat.play();
        frames(1);
        expect(log.sounds).toHaveLength(1);
        expect(log.sounds[0]!.volumes[0]).toHaveLength(1);
        expect(manager.log).toBeNull();
    });
});

describe('a sound effect when the editor lets the game play again', () => {
    it('carries on from where the frames got it to, or is gone if it ran out', async () => {
        const { bat, manager, frames, store } = await withSounds();
        bat.play();
        frames(1);
        const context = manager.context as unknown as { sources: Array<{ started: boolean; stopped: boolean; startOffset: number }> };
        manager.setClock('audio');
        const sounding = context.sources.filter((source) => source.started && !source.stopped);
        // The fake sound is four seconds long: a second in, it is started again from there.
        expect(sounding.at(-1)!.startOffset).toBeCloseTo(1);

        manager.setClock('frames');
        frames(5);
        manager.setClock('audio');
        expect(bat.playing).toBe(false);
        expect(store.get('audio').manager!.voices.size).toBe(0);
    });
});
