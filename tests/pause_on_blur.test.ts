import { afterEach, describe, expect, it } from 'bun:test';
import { BROWSER_PAUSE, holdingSound, watchVisibility } from '../src/game/bootstrap/watch_visibility';
import { getAudioManager } from '../src/audio';
import { installFakeAudio } from './helpers/test_audio';
import type { TFakeContext } from './helpers/test_audio';
import { createGameHandle } from '../src/game/handle/create_game_handle';
import { createTestGame } from './helpers/test_game';

/**
 * `pauseOnBlur`: the page being hidden holds the game with the browser's own tag, and coming back
 * releases only that one, a frame later.
 */

/**
 * A page whose visibility a test turns, firing the event a browser would.
 */
const fakePage = (startHidden = false) => {
    const target = new EventTarget();
    const page = Object.assign(target, { hidden: startHidden });
    const setHidden = (hidden: boolean): void => {
        page.hidden = hidden;
        target.dispatchEvent(new Event('visibilitychange'));
    };
    return { page: page as unknown as Document, setHidden };
};

/**
 * Frames handed out by hand: a callback waits until the test says a frame has come.
 */
const fakeFrames = () => {
    const queued: (() => void)[] = [];
    return { next: (callback: () => void) => queued.push(callback), run: () => queued.splice(0).forEach((cb) => cb()) };
};

const off: (() => void)[] = [];
afterEach(() => off.splice(0).forEach((stop) => stop()));

describe('a hidden page', () => {
    it('pauses the game with the browser\'s tag, and is heard as a pause', () => {
        const { store } = createTestGame();
        const game = createGameHandle(store);
        const { page, setHidden } = fakePage();
        const heard: string[] = [];
        off.push(game.onPaused(({ reason }) => heard.push(`paused ${reason}`)));
        off.push(watchVisibility(game, page, fakeFrames().next));

        setHidden(true);

        expect(store.get('loop').pausedBy).toEqual([BROWSER_PAUSE]);
        expect(game.isPaused()).toBe(true);
        expect(heard).toEqual(['paused browser']);
    });

    it('resumes one frame after it is seen again, so the frame that measured the time away is not run', () => {
        const { store } = createTestGame();
        const game = createGameHandle(store);
        const { page, setHidden } = fakePage();
        const frames = fakeFrames();
        const heard: string[] = [];
        off.push(game.onResumed(({ reason }) => heard.push(`resumed ${reason}`)));
        off.push(watchVisibility(game, page, frames.next));

        setHidden(true);
        setHidden(false);
        expect(game.isPaused()).toBe(true);

        frames.run();
        expect(game.isPaused()).toBe(false);
        expect(heard).toEqual(['resumed browser']);
    });

    it('leaves a pause the player chose: coming back releases only the browser\'s hold', () => {
        const { store } = createTestGame();
        const game = createGameHandle(store);
        const { page, setHidden } = fakePage();
        const frames = fakeFrames();
        off.push(watchVisibility(game, page, frames.next));

        game.pause('menu');
        setHidden(true);
        setHidden(false);
        frames.run();

        expect(store.get('loop').pausedBy).toEqual(['menu']);
    });

    it('starts held in a tab that is already hidden, and stops watching once the game is gone', () => {
        const { store } = createTestGame();
        const game = createGameHandle(store);
        const { page, setHidden } = fakePage(true);
        const frames = fakeFrames();
        const stop = watchVisibility(game, page, frames.next);
        expect(game.isPaused()).toBe(true);

        stop();
        setHidden(false);
        frames.run();
        // Nothing listens any more, so nothing was released.
        expect(store.get('loop').pausedBy).toEqual([BROWSER_PAUSE]);
    });
});

describe('the sound of a hidden page', () => {
    // A page the person has touched, so the audio engine may run: what a browser asks before it.
    const touched = () => {
        const audio = installFakeAudio();
        const page = new EventTarget();
        (globalThis as { window?: unknown }).window = page;
        off.push(() => {
            delete (globalThis as { window?: unknown }).window;
            audio.restore();
        });
        return () => page.dispatchEvent(new Event('pointerdown'));
    };

    it('is held still while the page is hidden, and runs on when it is seen again', () => {
        const touch = touched();
        const { store } = createTestGame();
        const audio = getAudioManager(store);
        const context = audio.context as unknown as TFakeContext;
        touch();
        const { page, setHidden } = fakePage();
        const frames = fakeFrames();
        off.push(watchVisibility(holdingSound(createGameHandle(store), store), page, frames.next));
        expect(context.state).toBe('running');

        setHidden(true);
        expect(context.state).toBe('suspended');

        setHidden(false);
        frames.run();
        expect(context.state).toBe('running');
    });

    it('stays held when the page comes back while an editor runs the game a frame at a time', () => {
        const touch = touched();
        const { store } = createTestGame();
        const audio = getAudioManager(store);
        const context = audio.context as unknown as TFakeContext;
        touch();
        const { page, setHidden } = fakePage();
        const frames = fakeFrames();
        off.push(watchVisibility(holdingSound(createGameHandle(store), store), page, frames.next));

        audio.setClock('frames');
        setHidden(true);
        setHidden(false);
        frames.run();
        expect(context.state).toBe('suspended');

        // And the frames' clock let go while the page is hidden runs nothing until it is seen.
        setHidden(true);
        audio.setClock('audio');
        expect(context.state).toBe('suspended');
        setHidden(false);
        frames.run();
        expect(context.state).toBe('running');
    });

    it('starts held when it is opened while the page is hidden', () => {
        const touch = touched();
        const { store } = createTestGame();
        const { page } = fakePage(true);
        off.push(watchVisibility(holdingSound(createGameHandle(store), store), page, fakeFrames().next));

        const audio = getAudioManager(store);
        touch();
        expect((audio.context as unknown as TFakeContext).state).toBe('suspended');
    });
});
