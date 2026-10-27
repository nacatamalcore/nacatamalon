import { afterEach, describe, expect, it } from 'bun:test';
import { createScene } from '../src/scene/create_scene';
import { stopScene } from '../src/scene/stop_scene';
import { useGame } from '../src/hooks/game/use_game';
import { createGameHandle } from '../src/game/handle';
import { watchPage } from '../src/game/bootstrap/watch_page';
import { clearGameStores, createGameStore } from '../src/game_store';
import { createFakeCanvas, createTestGame, startTestScene } from './helpers/test_game';
import type { TStorePersistence } from '../src/game_store';

/**
 * What happens to the page around a game, heard through its handle (`onHidden`, `onShown`,
 * `onBlurred`, `onFocused`, `onLeaving`), and a store in `'auto'` writing what it still owed when
 * the page goes.
 */

(globalThis as { requestAnimationFrame?: (cb: FrameRequestCallback) => number }).requestAnimationFrame = () => 0;

/**
 * A page and its window that can be told what the browser would tell them.
 */
const fakePage = () => {
    const page = Object.assign(new EventTarget(), { hidden: false });
    const view = new EventTarget();
    return {
        page,
        view,
        hide: () => { page.hidden = true; page.dispatchEvent(new Event('visibilitychange')); },
        show: () => { page.hidden = false; page.dispatchEvent(new Event('visibilitychange')); },
        blur: () => view.dispatchEvent(new Event('blur')),
        focus: () => view.dispatchEvent(new Event('focus')),
        leave: () => view.dispatchEvent(new Event('pagehide')),
    };
};

describe('the page around a game', () => {
    it('is heard through the handle, each moment by its own listener', () => {
        const { store } = createTestGame();
        const browser = fakePage();
        watchPage(store, browser.page, browser.view);
        const heard: string[] = [];
        startTestScene(store, 'Level', () => {
            const game = useGame();
            game.onHidden(() => heard.push('hidden'));
            game.onShown(() => heard.push('shown'));
            game.onBlurred(() => heard.push('blurred'));
            game.onFocused(() => heard.push('focused'));
            game.onLeaving(() => heard.push('leaving'));
            return createScene();
        });

        browser.blur();
        browser.hide();
        browser.show();
        browser.focus();
        browser.leave();

        expect(heard).toEqual(['blurred', 'hidden', 'shown', 'focused', 'leaving']);
    });

    it('stops with the scene that listened', () => {
        const { store } = createTestGame();
        const browser = fakePage();
        watchPage(store, browser.page, browser.view);
        let heard = 0;
        startTestScene(store, 'Level', () => {
            useGame().onHidden(() => heard++);
            return createScene();
        });

        browser.hide();
        stopScene(store, 'Level');
        browser.show();
        browser.hide();

        expect(heard).toBe(1);
    });

    it('stops sooner with what it hands back, from a handle no scene holds', () => {
        const { store } = createTestGame();
        const browser = fakePage();
        const unwatch = watchPage(store, browser.page, browser.view);
        let heard = 0;
        const off = createGameHandle(store).onLeaving(() => heard++);

        browser.leave();
        off();
        browser.leave();
        expect(heard).toBe(1);

        createGameHandle(store).onLeaving(() => heard++);
        unwatch();
        browser.leave();
        expect(heard).toBe(1);
    });

    it('keeps two games on one page apart', () => {
        const first = createTestGame().store;
        const second = createTestGame().store;
        const browser = fakePage();
        watchPage(first, browser.page, browser.view);
        const heard: string[] = [];
        createGameHandle(first).onHidden(() => heard.push('first'));
        createGameHandle(second).onHidden(() => heard.push('second'));

        browser.hide();

        expect(heard).toEqual(['first']);
    });
});

describe('a store saving by itself when the page goes', () => {
    const globals = globalThis as { document?: unknown; window?: unknown };
    const before = { document: globals.document, window: globals.window };
    afterEach(() => {
        globals.document = before.document;
        globals.window = before.window;
        clearGameStores();
    });

    /**
     * A store made while `browser` stands in for the page, saving into `saved`.
     */
    const storeOn = (browser: ReturnType<typeof fakePage>, mode: 'auto' | 'manual', saved: number[]) => {
        globals.document = browser.page;
        globals.window = browser.view;
        const adapter: TStorePersistence<{ coins: number }> = {
            load: async () => null,
            save: async (_key, state) => { saved.push(state.coins); },
        };
        // A throttle far longer than the test, so only the page going can write it.
        return createGameStore({ key: `coins-${mode}`, state: { coins: 0 }, persist: { adapter, mode, throttle: 60 } });
    };

    it('in auto, writes the change still waiting for its throttle when the page is hidden', () => {
        const browser = fakePage();
        const saved: number[] = [];
        const coins = storeOn(browser, 'auto', saved);

        coins.set((s) => { s.coins = 3; });
        expect(saved).toEqual([]);
        browser.hide();

        expect(saved).toEqual([3]);
    });

    it('in auto, writes it when the page is leaving, and nothing when nothing is owed', () => {
        const browser = fakePage();
        const saved: number[] = [];
        const coins = storeOn(browser, 'auto', saved);

        browser.leave();
        expect(saved).toEqual([]);
        coins.set((s) => { s.coins = 5; });
        browser.leave();
        browser.leave();

        expect(saved).toEqual([5]);
    });

    it('in manual, writes nothing: leaving is not the game saying so', () => {
        const browser = fakePage();
        const saved: number[] = [];
        const coins = storeOn(browser, 'manual', saved);

        coins.set((s) => { s.coins = 7; });
        browser.hide();
        browser.leave();

        expect(saved).toEqual([]);
    });
});

describe('asking the page how it is', () => {
    it('reads the page the canvas is in', () => {
        const page = { hidden: false, focused: true, hasFocus() { return this.focused; } };
        const canvas = Object.assign(createFakeCanvas(), { ownerDocument: page });
        const { store } = createTestGame({}, canvas);
        const game = createGameHandle(store);

        expect([game.isHidden(), game.hasFocus()]).toEqual([false, true]);
        page.hidden = true;
        page.focused = false;
        expect([game.isHidden(), game.hasFocus()]).toEqual([true, false]);
    });

    it('is seen and has the keyboard with no page at all', () => {
        const game = createGameHandle(createTestGame().store);
        expect([game.isHidden(), game.hasFocus()]).toEqual([false, true]);
    });
});
