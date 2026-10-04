import { afterEach, describe, expect, it } from 'bun:test';
import { BROWSER_PAUSE, watchVisibility } from '../src/game/bootstrap/watch_visibility';
import { createGameHandle } from '../src/game/handle/create_game_handle';
import { gamePaused, gameResumed } from '../src/signal/engine_signals';
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
        off.push(gamePaused.connect(({ reason }) => heard.push(`paused ${reason}`)));
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
        off.push(gameResumed.connect(({ reason }) => heard.push(`resumed ${reason}`)));
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
