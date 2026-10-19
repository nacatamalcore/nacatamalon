import { teardownBox } from '../box';
import { boxRegion, boxesIn } from '../capture/photo_boxes';
import { cleanGameOptions } from '../game/bootstrap/clean_gameoptions';
import { createFrameContext, fillFrameContext } from '../game/loop';
import { advanceFrame } from '../game/loop/tick';
import { installPostChain, normalizePostChain } from '../post';
import { registerScene, startScene } from '../scene';
import { createRuntimeStore } from '../store';
import { pendingWorkOf } from '../loaders/pending_work';
import { enterHeadless, leaveHeadless } from './headless_environment';
import { createNullRenderer } from './null_renderer';
import type { TBox } from '../box';
import type { TGameConfig } from '../game/types/t_game_config';
import type { TGameObject } from '../hooks';
import type { THeadlessGame, THeadlessGameOptions, THeadlessPicture } from './types';

/**
 * Steps a second when the game runs on the screen's time (`step: 'display'`): each frame is a
 * sixtieth, as on the screen most games are made on.
 */
const DISPLAY_RATE = 60;

/**
 * The kind a picture is told by, in the words a person uses.
 */
const KINDS = { sprite: 'sprite', text: 'text', 'nine-slice': 'panel' } as const;

/**
 * Lets the promises and timers queued so far run: one turn of the event loop, where a file that was
 * read gets decoded and a texture becomes ready.
 */
const turn = (): Promise<void> => new Promise((done) => setTimeout(done, 0));

/**
 * Makes a game that runs with no browser and no screen, in Node or Bun: the same scenes, hooks and
 * updates as in a page, moved a frame at a time by whoever holds it. Nothing is drawn; everything
 * the game would show is still worked out, so a test can ask where things are and what is shown.
 *
 * It is the same every time it runs. Every frame is one step of the game (`step`, 60 a second
 * unless it says), the random numbers start from `seed` (`1` unless it says), and keys are pressed
 * and let go between frames, exactly when they are asked to be.
 *
 * What a game loads is read from the assets folder (`assets`, default `'public'`): a picture's size
 * and pixels when it is a PNG, its other files as they are. Physics runs as in a page, once the game
 * installs it (`installPhysics2d()`, `installPhysics3d()`); `loaded()` waits for its world too. Sound
 * is silent and plays on, so a sound waited on still ends. Without a browser there is no pointer, no
 * gamepad and no picture: it answers for the game's logic, not for how it looks.
 *
 * @example
 * ```ts
 * import { expect, test } from 'bun:test';
 * import { createHeadlessGame } from 'nacatamalon/headless';
 * import { Level } from '../src/scenes/level';
 *
 * test('the player walks right', async () => {
 *     const game = createHeadlessGame({ width: 320, height: 180, scenes: { Level } });
 *     await game.loaded();
 *     const start = game.find('Player')!.transform!.x;
 *
 *     game.press('ArrowRight');
 *     game.run(60);
 *     game.release('ArrowRight');
 *
 *     expect(game.find('Player')!.transform!.x).toBeGreaterThan(start);
 *     expect(game.drawn().some((p) => p.text === 'SCORE 0')).toBe(true);
 *     game.destroy();
 * });
 * ```
 *
 * @param options The game's options, its scenes, and where its files are.
 * @returns The game, held still on its first frame.
 *
 * @category Headless
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const createHeadlessGame = (options: THeadlessGameOptions): THeadlessGame => {
    const { scenes, initialScene, assets = 'public', ...gameOptions } = options;
    if (Array.isArray(scenes)) {
        throw new Error('[NacatamalOn] createHeadlessGame: scenes go in an object keyed by name, e.g. { Level }.');
    }
    if (initialScene !== undefined && !Object.hasOwn(scenes, initialScene)) {
        throw new Error(`[NacatamalOn] createHeadlessGame: initial scene '${initialScene}' is not in the scenes object.`);
    }
    const config = cleanGameOptions({
        ...gameOptions,
        step: gameOptions.step ?? DISPLAY_RATE,
        seed: gameOptions.seed ?? 1,
        pauseOnBlur: false,
        banner: false,
        splash: false,
    }) as TGameConfig;
    const { width, height } = config;

    enterHeadless(assets);

    // Where the keyboard and the pads listen: a window of the game's own, so a key pressed here
    // reaches this game and no other, and nothing is asked of a `window` Node does not have.
    const view = Object.assign(new EventTarget(), { navigator: {} });
    const canvas = Object.assign(new EventTarget(), {
        width,
        height,
        style: {},
        ownerDocument: { defaultView: view },
        getBoundingClientRect: () => ({ left: 0, top: 0, width, height, x: 0, y: 0, right: width, bottom: height }),
    }) as unknown as HTMLCanvasElement;

    const renderer = createNullRenderer();
    const store = createRuntimeStore({ canvas, renderer, config });
    if (config.post !== undefined && config.post.length > 0) {
        installPostChain(store, normalizePostChain(config.post));
    }
    for (const [name, scene] of Object.entries(scenes)) {
        registerScene(store, name, scene);
    }
    const first = initialScene ?? Object.keys(scenes)[0];
    if (first !== undefined) {
        startScene(store, first);
    }

    const ctx = createFrameContext();
    const frameMs = 1000 / (config.step === 'display' ? DISPLAY_RATE : config.step);
    let frame = 0;
    let destroyed = false;

    const alive = (what: string): void => {
        if (destroyed) {
            throw new Error(`[NacatamalOn] headless game: ${what} after destroy().`);
        }
    };

    // The first picture, with no time in it: what the scenes made, ready to be looked at.
    advanceFrame(store, ctx, 0);

    /**
     * A picture of how things are now, with no time in it and no update run: what has just arrived
     * (a font, a picture's size) is laid out and measured, as it would be on the next frame drawn.
     */
    const redraw = (): void => {
        fillFrameContext(store, ctx, 0);
        renderer.frame(ctx);
    };

    const key = (type: 'keydown' | 'keyup', name: string): void => {
        const event = new Event(type);
        Object.defineProperty(event, 'key', { value: name });
        view.dispatchEvent(event);
    };

    const every = (name: string): TGameObject[] => {
        const found: TBox[] = [];
        const visit = (box: TBox): void => {
            if (box.name === name) {
                found.push(box);
            }
            box.children.forEach(visit);
        };
        store.get('world').scenes.forEach(visit);
        return found as TGameObject[];
    };

    return {
        get frame() { return frame; },
        get time() { return (frame * frameMs) / 1000; },
        get scenes() { return store.get('world').scenes.map((scene) => scene.name); },
        run: (frames = 1) => {
            alive('run');
            for (let i = 0; i < frames; i++) {
                advanceFrame(store, ctx, frameMs);
                frame += 1;
                const { failure } = store.get('loop');
                if (failure !== null) {
                    // Said here, to the test that ran it, and cleared so the next run is heard too.
                    store.setState('loop', { failure: null });
                    throw failure;
                }
            }
        },
        press: (name) => { alive('press'); key('keydown', name); },
        release: (name) => { alive('release'); key('keyup', name); },
        tap(name) {
            this.press(name);
            this.run(1);
            this.release(name);
        },
        find: (name) => every(name)[0],
        findAll: every,
        drawn: () => boxesIn(store.get('world').scenes, { x: 0, y: 0, width, height }, width, height, () => true)
            .map(({ name, picture, seen, x, y }): THeadlessPicture => {
                const region = boxRegion(picture) ?? { x: Math.round(x), y: Math.round(y), width: 0, height: 0 };
                return {
                    name,
                    kind: KINDS[picture.type],
                    picture,
                    ...(picture.type === 'text' ? { text: picture.text } : {}),
                    x,
                    y,
                    left: region.x,
                    top: region.y,
                    width: region.width,
                    height: region.height,
                    seen,
                };
            }),
        loaded: async (timeoutMs = 5000) => {
            const until = Date.now() + timeoutMs;
            const scenesNow = () => store.get('world').scenes;
            const loading = () => scenesNow().flatMap((scene) => scene.loads).filter((load) => load.status === 'loading');
            // The files, and the work a scene started without waiting for it (a physics world
            // compiling its engine): a page lets that land between frames, and here there are none.
            const busy = () => loading().length > 0 || scenesNow().some((scene) => pendingWorkOf(scene).length > 0);
            while (!destroyed && busy()) {
                if (Date.now() > until) {
                    const what = loading().map((load) => (load as { src?: string }).src ?? 'a file');
                    throw new Error(`[NacatamalOn] headless game: still loading after ${timeoutMs} ms: ${what.join(', ') || 'a physics world'}.`);
                }
                await turn();
            }
            // One more turn, for what the work that just settled goes on to do (bodies put into
            // the world as it opens).
            await turn();
            // And a picture, so a text whose font has just arrived is measured and shows in drawn().
            if (!destroyed) {
                redraw();
            }
        },
        destroy: () => {
            if (destroyed) {
                return;
            }
            destroyed = true;
            store.setState('loop', { destroyed: true });
            for (const scene of store.get('world').scenes) {
                teardownBox(scene);
            }
            store.get('input').keyboard.destroy();
            store.get('input').pointer.destroy();
            store.get('input').gamepads.destroy();
            store.get('audio').manager?.destroy();
            renderer.destroy();
            store.destroy();
            leaveHeadless();
        },
    };
};
