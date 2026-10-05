import { describe, expect, it } from 'bun:test';
import { cleanGameOptions } from '../src/game/bootstrap/clean_gameoptions';
import { createFrameContext } from '../src/game/loop/create_frame_context';
import { tick } from '../src/game/loop/tick';
import { editorHandleOf, isHostClaimed, openHost } from '../src/game/handle/editor_handle_of';
import type { TGameInstance } from '../src/game/types/t_game_instance';
import { createScene } from '../src/scene/create_scene';
import { registerScene } from '../src/scene/register_scene';
import { SPLASH_SCENE, startWithSplash } from '../src/splash/run_splash';
import { isDevelopmentPage, shouldShowSplash } from '../src/splash/should_show_splash';
import { useUpdate } from '../src/hooks/loop/use_update';
import { createFakeCanvas, createTestGame } from './helpers/test_game';

/**
 * The splash: "Made with NacatamalOn" before the game, which is already being built behind it, and
 * then a fade into the game. And when it is shown at all: only when asked for, and with `true` not
 * while the game is being made.
 */

(globalThis as { requestAnimationFrame?: (cb: FrameRequestCallback) => number }).requestAnimationFrame = () => 0;

const FRAME = 1000 / 60;

/**
 * A game with one scene that counts its own updates, started behind the splash, and a way to run it
 * frame by frame.
 */
const splashedGame = () => {
    const canvas = createFakeCanvas(480, 320);
    const { store } = createTestGame({ width: 480, height: 320 }, canvas);
    let updates = 0;
    registerScene(store, 'Level', () => {
        useUpdate(() => {
            updates += 1;
        });
        return createScene();
    });
    startWithSplash(store, 'Level', canvas);
    const ctx = createFrameContext();
    let now = 0;
    const frames = (count: number): void => {
        for (let i = 0; i < count; i++) {
            const prev = now;
            now += FRAME;
            tick(store, ctx, now, prev);
        }
    };
    const names = (): string[] => store.get('world').scenes.map((scene) => scene.name);
    const level = () => store.get('world').scenes.find((scene) => scene.name === 'Level');
    return { store, canvas, frames, names, level, updates: () => updates };
};

describe('the splash', () => {
    it('builds the game straight away and holds it: it exists, but does not run', () => {
        const { frames, names, level, updates } = splashedGame();

        frames(30);

        expect(names()).toEqual([SPLASH_SCENE, 'Level']);
        expect(level()?.held).toBe(true);
        expect(updates()).toBe(0);
    });

    it('fades into the game when it is over, and leaves', () => {
        const { store, frames, names, level, updates } = splashedGame();

        // Its 1.6 seconds, then the fade's half a second, with a few frames to spare.
        frames(60 * 1.6 + 2);
        expect(store.get('transition').active).not.toBeNull();

        frames(45);

        expect(names()).toEqual(['Level']);
        expect(level()?.held).toBe(false);
        expect(updates()).toBeGreaterThan(0);
    });

    it('ends early on a key, without waiting for its time', () => {
        const { store, frames } = splashedGame();
        frames(5);

        globalThis.dispatchEvent(Object.assign(new Event('keydown'), { key: 'Enter' }));

        expect(store.get('transition').active).not.toBeNull();
    });

    it('ends early on a click on the game', () => {
        const { store, canvas, frames } = splashedGame();
        frames(5);

        canvas.dispatchEvent(new Event('pointerdown'));

        expect(store.get('transition').active).not.toBeNull();
    });
});

describe('when it is shown', () => {
    it('is off unless the game asks for it', () => {
        expect(cleanGameOptions({ width: 320, height: 240 }).splash).toBe(false);
        expect(cleanGameOptions({ width: 320, height: 240, splash: true }).splash).toBe(true);
        expect(cleanGameOptions({ width: 320, height: 240, splash: 'always' }).splash).toBe('always');
    });

    it('with `true`, shows in the published game and not while it is being made', () => {
        expect(shouldShowSplash(true, false)).toBe(true);
        expect(shouldShowSplash(true, true)).toBe(false);
    });

    it('with `\'always\'`, shows while it is being made too, and with `false` never', () => {
        expect(shouldShowSplash('always', true)).toBe(true);
        expect(shouldShowSplash('always', false)).toBe(true);
        expect(shouldShowSplash(false, false)).toBe(false);
    });

    it('takes a development server, or a browser driven by automation, for a game being made', () => {
        const browser = { webdriver: false };
        for (const hostname of ['localhost', '127.0.0.1', '[::1]', 'mac.local', 'app.localhost']) {
            expect(isDevelopmentPage({ hostname }, browser)).toBe(true);
        }
        expect(isDevelopmentPage({ hostname: 'mygame.itch.io' }, browser)).toBe(false);
        expect(isDevelopmentPage({ hostname: 'nacatamalon.com' }, browser)).toBe(false);
        // Playwright, Puppeteer and Selenium all say so, wherever the page is.
        expect(isDevelopmentPage({ hostname: 'mygame.itch.io' }, { webdriver: true })).toBe(true);
    });

    it('knows when a tool is driving the game, which opens on its scene and not on a logo', () => {
        const instance: TGameInstance = { destroy: () => {}, on: () => () => {} };
        openHost(instance);
        expect(isHostClaimed(instance)).toBe(false);

        void editorHandleOf(instance);

        expect(isHostClaimed(instance)).toBe(true);
    });
});
