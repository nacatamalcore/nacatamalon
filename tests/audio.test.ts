import { afterEach, beforeEach, describe, expect, it, spyOn } from 'bun:test';
import { createScene } from '../src/scene/create_scene';
import { stopScene } from '../src/scene/stop_scene';
import { setScenePaused } from '../src/scene/pause_scene';
import { createSprite } from '../src/gameobjects/sprite/create_sprite';
import { useSpawn } from '../src/hooks/spawn/use_spawn';
import { useCamera2d } from '../src/hooks/camera/use_camera_2d';
import { useLoadAudio } from '../src/hooks/loaders/use_load_audio';
import { useLoader } from '../src/hooks/loaders/use_loader';
import { useSound } from '../src/hooks/audio/use_sound';
import { useAudio } from '../src/hooks/audio/use_audio';
import { updateAudio } from '../src/audio';
import { destroy, flushDestroyed } from '../src/destroy';
import { createGameHandle } from '../src/game/handle/create_game_handle';
import { gamePaused, gameResumed, scenePaused, sceneResumed } from '../src/signal/engine_signals';
import { whenLoaded } from '../src/loaders';
import { createTestGame, startTestScene } from './helpers/test_game';
import { FAKE_DURATION, installFakeAudio } from './helpers/test_audio';
import type { TFakeContext, TFakeGain, TFakeSource } from './helpers/test_audio';
import type { TRuntimeStore } from '../src/store';
import type { TSoundHandle } from '../src/audio';

let audio: ReturnType<typeof installFakeAudio>;
let fetchSpy: ReturnType<typeof spyOn> | null = null;

/**
 * Answers every fetch with the same bytes, so a clip decodes.
 */
const serveAudio = (): void => {
    fetchSpy = spyOn(globalThis, 'fetch').mockImplementation((async () => ({
        ok: true,
        arrayBuffer: async () => new ArrayBuffer(8),
    })) as unknown as typeof fetch);
};

/**
 * The context of the game under test, once something has opened one.
 */
const contextOf = (store: TRuntimeStore): TFakeContext => store.get('audio').manager!.context as unknown as TFakeContext;

/**
 * The voices that really started, in order.
 */
const startedSources = (context: TFakeContext): TFakeSource[] => context.sources.filter((source) => source.started);

beforeEach(() => {
    audio = installFakeAudio();
    serveAudio();
});

afterEach(() => {
    audio.restore();
    fetchSpy?.mockRestore();
    fetchSpy = null;
    (console.warn as { mockRestore?: () => void }).mockRestore?.();
});

/**
 * A scene with one sound in it, already loaded and ready to play.
 */
const withSound = async (options: Parameters<typeof useSound>[1] = {}) => {
    const { store } = createTestGame();
    let sound!: TSoundHandle;
    startTestScene(store, 'Level', () => {
        const clip = useLoadAudio({ src: '/audio/coin.mp3' });
        sound = useSound(clip, options);
        return createScene();
    });
    await whenLoaded(store.get('assets').sounds.get('/audio/coin.mp3')!);
    return { store, sound, context: contextOf(store) };
};

describe('useLoadAudio', () => {
    it('fills the clip in place and counts as loaded for useLoader', async () => {
        const { store } = createTestGame();
        let loader!: ReturnType<typeof useLoader>;
        startTestScene(store, 'Level', () => {
            useLoadAudio({ src: '/audio/coin.mp3', key: 'coin' });
            loader = useLoader();
            return createScene();
        });

        const clip = store.get('assets').sounds.get('coin')!;
        expect(clip.status).toBe('loading');
        expect(loader.total).toBe(1);

        await whenLoaded(clip);
        // The loader recounts on its own turn of the queue, after the load settles.
        await new Promise((resolve) => setTimeout(resolve, 0));

        expect(clip.status).toBe('ready');
        expect(clip.duration).toBe(FAKE_DURATION);
        expect(loader.loaded).toBe(1);
    });

    it('gives the same clip back for the same key, without loading it twice', async () => {
        const { store } = createTestGame();
        startTestScene(store, 'Level', () => {
            useLoadAudio({ src: '/audio/coin.mp3', key: 'coin' });
            useLoadAudio({ src: '/audio/coin.mp3', key: 'coin' });
            return createScene();
        });

        expect(store.get('assets').sounds.size).toBe(1);
        expect(fetchSpy).toHaveBeenCalledTimes(1);
    });

    it('ends as an error, with a warning, when the file is not there', async () => {
        const warn = spyOn(console, 'warn').mockImplementation(() => {});
        warn.mockClear();
        fetchSpy!.mockImplementation((async () => ({ ok: false, status: 404 })) as unknown as typeof fetch);
        const { store } = createTestGame();
        startTestScene(store, 'Level', () => { useLoadAudio({ src: '/audio/missing.mp3' }); return createScene(); });

        const clip = store.get('assets').sounds.get('/audio/missing.mp3')!;
        await whenLoaded(clip);

        expect(clip.status).toBe('error');
        expect(warn).toHaveBeenCalledTimes(1);
    });

    it('does not open an audio engine in a game that never asks for sound', () => {
        const { store } = createTestGame();
        startTestScene(store, 'Level', () => { createSprite({ width: 8, height: 8 }); return createScene(); });

        expect(store.get('audio').manager).toBeNull();
        expect(audio.contexts.length).toBe(0);
    });
});

describe('useSound', () => {
    it('refuses to be called outside a scene body', () => {
        expect(() => useSound({ src: '/audio/coin.mp3' })).toThrow('[NacatamalOn] useSound');
    });

    it('plays with its volume, looping and speed, through its channel', async () => {
        const { sound, context } = await withSound({ volume: 0.5, rate: 1.5, channel: 'music' });

        sound.play();

        const [source] = startedSources(context);
        expect(source.loop).toBe(false);
        expect(source.playbackRate.value).toBe(1.5);
        const gain = source.connectedTo!;
        expect(gain.kind).toBe('gain');
        expect((gain as unknown as TFakeGain).gain.value).toBe(0.5);
        // The voice goes through its channel, and the channel through the master.
        // gains[0] is the master, [1] is 'sfx' and [2] is 'music': this sound asked for music.
        const channel = gain.connectedTo!;
        expect(channel).toBe(context.gains[2]);
        expect(channel.connectedTo).toBe(context.gains[0]);
    });

    it('does nothing while the file is still loading', () => {
        const { store } = createTestGame();
        let sound!: TSoundHandle;
        startTestScene(store, 'Level', () => { sound = useSound({ src: '/audio/coin.mp3' }); return createScene(); });

        sound.play();

        expect(startedSources(contextOf(store)).length).toBe(0);
        expect(sound.playing).toBe(false);
    });

    it('lets a one-off sound overlap itself, and keeps a looping one single', async () => {
        const effect = await withSound();
        effect.sound.play();
        effect.sound.play();
        expect(startedSources(effect.context).length).toBe(2);

        const music = await withSound({ loop: true });
        music.sound.play();
        music.sound.play();
        const started = startedSources(music.context);
        expect(started.length).toBe(2);
        // The second play replaced the first rather than doubling it.
        expect(started[0].stopped).toBe(true);
        expect(started[1].stopped).toBe(false);
        expect(started[1].loop).toBe(true);
    });

    it('forgets a one-off sound when it ends', async () => {
        const { store, sound, context } = await withSound();
        sound.play();
        expect(sound.playing).toBe(true);

        // What the browser does when the sound runs out.
        startedSources(context)[0].onended!();

        expect(sound.playing).toBe(false);
        expect(store.get('audio').manager!.voices.size).toBe(0);
    });

    it('carries on from where pause left it', async () => {
        const { sound, context } = await withSound({ loop: true });
        sound.play();
        context.currentTime = 1.25;

        sound.pause();
        expect(sound.playing).toBe(false);
        expect(startedSources(context)[0].stopped).toBe(true);

        sound.resume();
        const started = startedSources(context);
        expect(started.length).toBe(2);
        expect(started[1].startOffset).toBeCloseTo(1.25, 5);
        expect(sound.playing).toBe(true);
    });

    it('changes volume, looping and speed of what is already sounding', async () => {
        const { sound, context } = await withSound();
        sound.play();
        const source = startedSources(context)[0];

        sound.setVolume(0.25);
        sound.setLoop(true);
        sound.setRate(0.5);

        expect((source.connectedTo as unknown as TFakeGain).gain.value).toBe(0.25);
        expect(source.loop).toBe(true);
        expect(source.playbackRate.value).toBe(0.5);
    });

    it('starts on its own with autoplay, once the file is there', async () => {
        const { store } = createTestGame();
        startTestScene(store, 'Level', () => {
            useSound({ src: '/audio/theme.mp3' }, { loop: true, autoplay: true });
            return createScene();
        });
        const context = contextOf(store);
        expect(startedSources(context).length).toBe(0);

        await whenLoaded(store.get('assets').sounds.get('/audio/theme.mp3')!);
        // The autoplay waits on the load, so it starts on the next turn of the queue.
        await Promise.resolve();

        expect(startedSources(context).length).toBe(1);
    });

    it('stops when its scene stops', async () => {
        const { store, sound, context } = await withSound({ loop: true });
        sound.play();

        stopScene(store, 'Level');

        expect(startedSources(context)[0].stopped).toBe(true);
        expect(store.get('audio').manager!.voices.size).toBe(0);
    });

    it('stops when the object that asked for it is destroyed', async () => {
        const { store } = createTestGame();
        const Noisy = () => {
            const sound = useSound({ src: '/audio/coin.mp3' }, { loop: true, autoplay: true });
            return sound;
        };
        let noisy!: ReturnType<ReturnType<typeof useSpawn>>;
        startTestScene(store, 'Level', () => { noisy = useSpawn(Noisy)(); return createScene(); });
        await whenLoaded(store.get('assets').sounds.get('/audio/coin.mp3')!);
        await Promise.resolve();
        const context = contextOf(store);
        expect(startedSources(context).length).toBe(1);

        destroy(noisy);
        flushDestroyed(store);

        expect(startedSources(context)[0].stopped).toBe(true);
    });

    it('keeps sounding while its scene is paused: what stops is the game\'s decision', async () => {
        const { store, sound } = await withSound({ loop: true });
        sound.play();

        setScenePaused(store, 'Level', true);

        expect(sound.playing).toBe(true);
    });
});

describe('useAudio', () => {
    it('moves the general volume and a channel of its own', async () => {
        const { store, context } = await withSound();
        let handle!: ReturnType<typeof useAudio>;
        startTestScene(store, 'Options', () => { handle = useAudio(); return createScene(); });

        handle.setVolume(0.8);
        handle.setVolume(0.3, 'music');

        expect(context.gains[0].gain.value).toBe(0.8);
        expect(handle.getVolume()).toBe(0.8);
        expect(handle.getVolume('music')).toBe(0.3);
        // Untouched channels stay where they were.
        expect(handle.getVolume('sfx')).toBe(1);
    });

    it('makes a channel the first time it is named', async () => {
        const { store, context } = await withSound();
        let handle!: ReturnType<typeof useAudio>;
        startTestScene(store, 'Options', () => { handle = useAudio(); return createScene(); });
        const before = context.gains.length;

        handle.setVolume(0.5, 'voices');

        expect(context.gains.length).toBe(before + 1);
        expect(handle.getVolume('voices')).toBe(0.5);
    });

    it('stops one channel, or everything', async () => {
        const { store } = createTestGame();
        let effect!: TSoundHandle;
        let music!: TSoundHandle;
        let handle!: ReturnType<typeof useAudio>;
        startTestScene(store, 'Level', () => {
            effect = useSound({ src: '/audio/coin.mp3' }, { loop: true });
            music = useSound({ src: '/audio/theme.mp3' }, { loop: true, channel: 'music' });
            handle = useAudio();
            return createScene();
        });
        await whenLoaded(store.get('assets').sounds.get('/audio/coin.mp3')!);
        await whenLoaded(store.get('assets').sounds.get('/audio/theme.mp3')!);
        effect.play();
        music.play();
        const manager = store.get('audio').manager!;
        expect(manager.voices.size).toBe(2);

        handle.stopAll('sfx');
        expect(manager.voices.size).toBe(1);

        handle.stopAll();
        expect(manager.voices.size).toBe(0);
    });
});

describe('sound placed in the world', () => {
    it('is wired through a panner with its distances, and follows what makes it', async () => {
        const { store } = createTestGame();
        let sound!: TSoundHandle;
        let emitter!: ReturnType<typeof createSprite>;
        startTestScene(store, 'Level', () => {
            emitter = createSprite({ width: 8, height: 8, transform: { x: 300, y: 120, rotation: 0, scaleX: 1, scaleY: 1 } });
            sound = useSound({ src: '/audio/bird.mp3' }, { spatial: true, refDistance: 150, maxDistance: 900, loop: true });
            return createScene();
        });
        await whenLoaded(store.get('assets').sounds.get('/audio/bird.mp3')!);
        sound.play();
        const context = contextOf(store);

        const [panner] = context.panners;
        expect(panner.refDistance).toBe(150);
        expect(panner.maxDistance).toBe(900);
        expect(startedSources(context)[0].connectedTo).toBe(panner);

        updateAudio(store);
        expect(panner.positionX.value).toBe(300);
        // The game's y grows downwards and WebAudio's upwards.
        expect(panner.positionY.value).toBe(-120);

        emitter.transform.x = 20;
        updateAudio(store);
        expect(panner.positionX.value).toBe(20);
    });

    it('puts the listener in the middle of what is on screen', async () => {
        const { store } = createTestGame();
        let camera!: ReturnType<typeof useCamera2d>;
        startTestScene(store, 'Level', () => {
            camera = useCamera2d({ x: 1000, y: 500 });
            useSound({ src: '/audio/bird.mp3' }, { spatial: true });
            return createScene();
        });
        const context = contextOf(store);

        updateAudio(store);
        // The camera is the top-left corner, so the listener is half a screen further in.
        expect(context.listener.positionX.value).toBe(1000 + 160);
        expect(context.listener.positionY.value).toBe(-(500 + 112));

        camera.zoom = 2;
        updateAudio(store);
        // Zoomed in, half a screen is half as much world.
        expect(context.listener.positionX.value).toBe(1000 + 80);
    });

    it('leaves the listener in the middle of the screen when there is no camera', async () => {
        const { store } = createTestGame();
        startTestScene(store, 'Level', () => { useSound({ src: '/audio/bird.mp3' }, { spatial: true }); return createScene(); });

        updateAudio(store);

        expect(contextOf(store).listener.positionX.value).toBe(160);
        expect(contextOf(store).listener.positionY.value).toBe(-112);
    });
});

describe('pause signals', () => {
    it('says when a scene is paused and when it runs again, only when it changes', () => {
        const { store } = createTestGame();
        startTestScene(store, 'Level', () => createScene());
        const log: string[] = [];
        const offPaused = scenePaused.connect(({ scene }) => { log.push(`paused ${scene}`); });
        const offResumed = sceneResumed.connect(({ scene }) => { log.push(`resumed ${scene}`); });

        setScenePaused(store, 'Level', true);
        setScenePaused(store, 'Level', true);
        setScenePaused(store, 'Level', false);
        setScenePaused(store, 'Missing', true);

        expect(log).toEqual(['paused Level', 'resumed Level']);
        offPaused();
        offResumed();
    });

    it('says the game is paused on the first hold and running again on the last', () => {
        const { store } = createTestGame();
        const game = createGameHandle(store);
        const log: string[] = [];
        const offPaused = gamePaused.connect(({ reason }) => { log.push(`paused ${reason}`); });
        const offResumed = gameResumed.connect(({ reason }) => { log.push(`resumed ${reason}`); });

        game.pause('menu');
        game.pause('blur');
        game.pause('menu');
        game.resume('menu');
        game.resume('blur');

        expect(log).toEqual(['paused menu', 'resumed blur']);
        offPaused();
        offResumed();
    });
});
