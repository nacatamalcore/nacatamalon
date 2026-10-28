import { afterEach, beforeEach, describe, expect, it, spyOn } from 'bun:test';
import { createFrameContext } from '../src/game/loop/create_frame_context';
import { createScene } from '../src/scene/create_scene';
import { fade } from '../src/transition';
import { findScene } from '../src/scene/find_scene';
import { registerScene } from '../src/scene/register_scene';
import { stopScene } from '../src/scene/stop_scene';
import { tick } from '../src/game/loop/tick';
import { useMusic } from '../src/hooks/audio/use_music';
import { useSound } from '../src/hooks/audio/use_sound';
import { useScene } from '../src/hooks/scene/use_scene';
import { whenLoaded } from '../src/loaders';
import { createTestGame, startTestScene } from './helpers/test_game';
import { installFakeAudio } from './helpers/test_audio';
import type { TFakeContext, TFakeSource } from './helpers/test_audio';
import type { TRuntimeStore } from '../src/store';
import type { TSceneHandle } from '../src/hooks/scene/use_scene';

/**
 * A scene coming in behind a transition does not start its sounds on its own until the swap: they
 * keep real time, and under the cover they would sound over the music of the scene still on screen.
 * With the `fadeOut` of the scene leaving and the `fadeIn` of the one coming in, the two cross there.
 */

(globalThis as { requestAnimationFrame?: (cb: FrameRequestCallback) => number }).requestAnimationFrame = () => 0;

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

const FRAME = 1 / 60;

const contextOf = (store: TRuntimeStore): TFakeContext => store.get('audio').manager!.context as unknown as TFakeContext;
const playing = (context: TFakeContext): TFakeSource[] => context.sources.filter((source) => source.started && !source.stopped);
/**
 * What was started and is told to stop later than now: a sound fading out, still heard.
 */
const fading = (context: TFakeContext): TFakeSource[] => context.sources.filter((source) => source.started && source.stopped && source.stopAt > context.currentTime);
const loaded = async (store: TRuntimeStore): Promise<void> => {
    await Promise.all([...store.get('assets').sounds.values()].map((clip) => whenLoaded(clip)));
    await Promise.resolve();
};

/**
 * A menu with its music, and a level whose music and ambience start on their own.
 */
const menuToLevel = () => {
    const { store } = createTestGame();
    const ctx = createFrameContext();
    let now = 0;
    const frames = (seconds: number): void => {
        for (let left = seconds; left > 0; left -= FRAME) {
            const prev = now;
            now += FRAME * 1000;
            tick(store, ctx, now, prev);
        }
    };

    registerScene(store, 'Level', () => {
        useMusic({ layers: { tune: { src: '/audio/level.ogg' } }, autoplay: true, fadeIn: 1 });
        useSound({ src: '/audio/wind.ogg' }, { loop: true, autoplay: true });
        return createScene();
    });
    let handle!: TSceneHandle;
    startTestScene(store, 'Menu', () => {
        handle = useScene();
        useMusic({ layers: { tune: { src: '/audio/menu.ogg' } }, autoplay: true, fadeOut: 1 });
        return createScene();
    });

    return { store, frames, handle: () => handle, context: () => contextOf(store) };
};

describe('autoplay in a scene coming in behind a transition', () => {
    it('waits for the swap, and then the menu goes down as the level comes up', async () => {
        const { store, frames, handle, context } = menuToLevel();
        await loaded(store);
        expect(playing(context())).toHaveLength(1);

        handle().change('Level', { transition: fade(0.6) });
        await loaded(store);
        // Loaded, and held: nothing of the level sounds under the cover.
        expect(findScene(store, 'Level')!.held).toBe(true);
        expect(playing(context())).toHaveLength(1);

        frames(0.35);
        expect(findScene(store, 'Menu')).toBeUndefined();
        // The level's music and wind, and the menu's music still heard, going down for a second.
        expect(playing(context())).toHaveLength(2);
        expect(fading(context())).toHaveLength(1);
        expect(fading(context())[0]!.stopAt).toBe(context().currentTime + 1);
    });

    it('starts at once in a scene that is not held', async () => {
        const { store, handle, context } = menuToLevel();
        await loaded(store);

        handle().change('Level');
        await loaded(store);

        expect(playing(context())).toHaveLength(2);
        expect(fading(context())).toHaveLength(1);
    });

    it('never starts if the scene stops before it is let go', async () => {
        const { store, frames, handle, context } = menuToLevel();
        await loaded(store);
        handle().change('Level', { transition: fade(0.6) });
        await loaded(store);

        stopScene(store, 'Level');
        frames(0.1);

        expect(playing(context())).toHaveLength(1);
        expect(store.get('world').released).toHaveLength(0);
    });
});
