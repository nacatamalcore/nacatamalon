import { afterEach, describe, expect, it, spyOn } from 'bun:test';
import { cleanGameOptions } from '../src/game/bootstrap/clean_gameoptions';
import { createFrameContext } from '../src/game/loop/create_frame_context';
import { tick } from '../src/game/loop/tick';
import { editorHandleOf, isHostClaimed, openHost } from '../src/game/handle/editor_handle_of';
import type { TGameInstance } from '../src/game/types/t_game_instance';
import { createScene } from '../src/scene/create_scene';
import { registerScene } from '../src/scene/register_scene';
import { SPLASH_SCENE, startWithSplash } from '../src/splash/run_splash';
import { expectSplash, gameBehindSplash, isBehindSplash, splashOf } from '../src/splash/behind_splash';
import { installFakeAudio } from './helpers/test_audio';
import { useSound } from '../src/hooks/audio/use_sound';
import { whenReleased } from '../src/scene/when_released';
import { buildPostChain } from '../src/post/build_post_chain';
import { createSprite } from '../src/gameobjects/sprite/create_sprite';
import { usePointer } from '../src/hooks/input/use_pointer';
import { useRenderStyle } from '../src/hooks/style';
import { RENDER } from '../src/CONST';
import type { TRuntimeStore } from '../src/store';
import type { TFrameContext } from '../src/render';
import { isDevelopmentPage, shouldShowSplash } from '../src/splash/should_show_splash';
import { useUpdate } from '../src/hooks/loop/use_update';
import { createFakeCanvas, createTestGame } from './helpers/test_game';
import { useScene } from '../src/hooks/scene/use_scene';
import { useReady } from '../src/hooks/scene/use_ready';
import { useCleanup } from '../src/hooks/scene/use_cleanup';
import { useSceneTransitionEnd } from '../src/hooks/scene/use_scene_transition_end';
import { registerGameSystem } from '../src';
import { startGameSystems, stopGameSystems } from '../src/game_systems/game_systems';
import { stopScene } from '../src/scene/stop_scene';
import { startScene } from '../src/scene/start_scene';
import { crossfade, fade } from '../src/transition';
import { trackLoad } from '../src/loaders/track_load';
import { getActiveBox, getActiveGame } from '../src/store';
import type { TLoadStatus } from '../src/loaders';
import type { TSceneHandle } from '../src/hooks/scene/use_scene';

/**
 * The splash: "Made with NacatamalOn" before the game, which is already being built behind it, and
 * then it goes, letting the game go on its way out. And when it is shown at all: only when asked
 * for, and with `true` not while the game is being made.
 *
 * Behind it the game does what it does without a splash, scene by scene and change by change; it is
 * only not updated, drawn or answered, and what waits to be seen waits on.
 */

(globalThis as { requestAnimationFrame?: (cb: FrameRequestCallback) => number }).requestAnimationFrame = () => 0;

const FRAME = 1000 / 60;

/** Its 1.6 seconds, then the frames to its way out's halfway, where the game is let go. */
const UNTIL_RELEASED = 60 * 1.6 + 2 + 18;

/** The splash's time, its way out, and frames to spare. */
const WHOLE_SPLASH = 60 * 1.6 + 2 + 45;

/** Every sprite the last frame drew on the screen, in the order it drew them. */
const drawnSprites = (ctx: TFrameContext): Array<{ width?: number; height?: number }> =>
    (ctx.passes[ctx.passes.length - 1]?.drawables ?? []).filter((item) => item.type === 'sprite') as Array<{ width?: number; height?: number }>;

/** The game's own sprite, of a size the splash has none of. */
const marker = () => createSprite({ width: 7, height: 13, tint: { r: 1, g: 1, b: 1, a: 1 }, transform: { x: 10, y: 10 } });
const isMarker = (item: { width?: number; height?: number }): boolean => item.width === 7 && item.height === 13;

/**
 * The games a test started and has not ended: ended after it whatever happened in it, so a test that
 * fails does not leave a game running for the next one's systems to be registered after.
 */
const running = new Set<TRuntimeStore>();
afterEach(() => {
    for (const store of running) stopGameSystems(store);
    running.clear();
});

/**
 * A game of several scenes started behind the splash on `initial`, its systems first as a game
 * starts them, and a way to run it frame by frame.
 */
const splashedScenes = (scenes: Record<string, () => ReturnType<typeof createScene>>, initial: string) => {
    const canvas = createFakeCanvas(480, 320);
    const { store } = createTestGame({ width: 480, height: 320 }, canvas);
    for (const [name, scene] of Object.entries(scenes)) {
        registerScene(store, name, scene);
    }
    startGameSystems(store);
    startWithSplash(store, initial, canvas);
    const ctx = createFrameContext();
    let now = 0;
    const frames = (count: number): void => {
        for (let i = 0; i < count; i++) {
            const prev = now;
            now += FRAME;
            tick(store, ctx, now, prev);
        }
    };
    const shown = (): string[] => store.get('world').scenes.map((scene) => {
        const marks = [scene.held ? 'held' : '', isBehindSplash(store, scene) ? 'behind' : ''].filter((mark) => mark !== '');
        return marks.length === 0 ? scene.name : `${scene.name} (${marks.join(', ')})`;
    });
    running.add(store);
    const end = (): void => {
        running.delete(store);
        stopGameSystems(store);
    };
    return { store, canvas, ctx, frames, shown, end };
};

/** A game whose one scene counts its own updates and draws a sprite of its own. */
const splashedGame = () => {
    let updates = 0;
    const game = splashedScenes({
        Level: () => {
            marker();
            useUpdate(() => {
                updates += 1;
            });
            return createScene();
        },
    }, 'Level');
    return { ...game, updates: () => updates };
};

describe('the splash', () => {
    it('starts the game straight away, behind it: built, but neither updated nor drawn', () => {
        const { ctx, frames, shown, updates, end } = splashedGame();

        frames(30);

        expect(shown()).toEqual([SPLASH_SCENE, 'Level (behind)']);
        expect(updates()).toBe(0);
        expect(drawnSprites(ctx).some(isMarker)).toBe(false);
        expect(drawnSprites(ctx).length).toBeGreaterThan(0);
        end();
    });

    it('lets the game go halfway out, and leaves, without a scene change of the game\'s', () => {
        const { store, ctx, frames, shown, updates, end } = splashedGame();

        frames(60 * 1.6 + 2);
        expect(gameBehindSplash(store)).toBe(true);
        expect(store.get('transition').active).toBeNull();

        frames(18);
        expect(gameBehindSplash(store)).toBe(false);
        expect(shown()).toEqual([SPLASH_SCENE, 'Level']);
        expect(updates()).toBeGreaterThan(0);
        // The game under what is left of the splash.
        const drawn = drawnSprites(ctx);
        expect(drawn.findIndex(isMarker)).toBe(0);
        expect(drawn.length).toBeGreaterThan(1);

        frames(25);
        expect(shown()).toEqual(['Level']);
        expect(drawnSprites(ctx).filter((item) => !isMarker(item))).toEqual([]);
        end();
    });

    it('ends early on a key, without waiting for its time', () => {
        const { store, frames, shown, end } = splashedGame();
        frames(5);

        globalThis.dispatchEvent(Object.assign(new Event('keydown'), { key: 'Enter' }));
        frames(18);
        expect(gameBehindSplash(store)).toBe(false);
        frames(18);
        expect(shown()).toEqual(['Level']);
        end();
    });

    it('ends early on a click on the game, which the game does not hear', () => {
        let downs = 0;
        const { store, canvas, frames, shown, end } = splashedScenes({
            Level: () => {
                usePointer().onDown(() => {
                    downs++;
                });
                return createScene();
            },
        }, 'Level');
        frames(5);

        canvas.dispatchEvent(Object.assign(new Event('pointerdown'), { clientX: 20, clientY: 20, button: 0, pointerId: 1 }));
        canvas.dispatchEvent(Object.assign(new Event('pointerup'), { clientX: 20, clientY: 20, button: 0, pointerId: 1 }));
        frames(1);
        expect(downs).toBe(0);
        frames(40);
        expect(shown()).toEqual(['Level']);
        expect(gameBehindSplash(store)).toBe(false);

        canvas.dispatchEvent(Object.assign(new Event('pointerdown'), { clientX: 20, clientY: 20, button: 0, pointerId: 1 }));
        frames(1);
        expect(downs).toBe(1);
        end();
    });

    it('goes all the same with the game behind it paused, or its time stopped', () => {
        for (const stopped of [{ pausedBy: ['test'] }, { timeScale: 0 }]) {
            const { store, frames, shown, end } = splashedGame();
            store.setState('loop', { ...store.get('loop'), ...stopped });
            frames(WHOLE_SPLASH);
            expect(shown(), JSON.stringify(stopped)).toEqual(['Level']);
            end();
        }
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

describe('what the game starts behind the splash', () => {
    /** A first scene that launches the level and the HUD from its useReady, and leaves. */
    const boot = () => {
        const scene = useScene();
        useReady(() => {
            scene.launch('Level');
            scene.launch('Hud');
            scene.stop();
        });
        return createScene();
    };

    it('is started as without the splash, in its places, and comes out from behind it all together', () => {
        const { frames, shown, end } = splashedScenes({ Boot: boot, Level: () => createScene(), Hud: () => createScene() }, 'Boot');
        frames(30);
        expect(shown()).toEqual([SPLASH_SCENE, 'Level (behind)', 'Hud (behind)']);
        frames(UNTIL_RELEASED - 30);
        expect(shown()).toEqual([SPLASH_SCENE, 'Level', 'Hud']);
        frames(WHOLE_SPLASH);
        expect(shown()).toEqual(['Level', 'Hud']);
        end();
    });

    it('is drawn under the splash on its way out, whatever started after it', () => {
        const { ctx, frames, end } = splashedScenes({
            Boot: () => {
                const scene = useScene();
                useReady(() => {
                    scene.launch('Level');
                    scene.stop();
                });
                return createScene();
            },
            Level: () => {
                marker();
                return createScene();
            },
        }, 'Boot');
        frames(UNTIL_RELEASED);
        const drawn = drawnSprites(ctx);
        expect(drawn.findIndex(isMarker)).toBe(0);
        expect(drawn.length).toBeGreaterThan(1);
        end();
    });

    it('lands where it would without the splash when a game system launched it from its body', () => {
        const remove = registerGameSystem('test-splash-system', () => { useScene().launch('Hud'); });
        try {
            const { frames, shown, end } = splashedScenes({ Level: () => createScene(), Hud: () => createScene() }, 'Level');
            try {
                frames(30);
                expect(shown()).toEqual([SPLASH_SCENE, 'Level (behind)', 'Hud (behind)']);
                frames(WHOLE_SPLASH);
                expect(shown()).toEqual(['Level', 'Hud']);
            } finally {
                end();
            }
        } finally {
            remove();
        }
    });

    it('keeps the game\'s systems waiting with it, and the splash is not a scene of the game\'s to them', () => {
        let updates = 0;
        const remove = registerGameSystem('test-splash-waiting', () => {
            useUpdate(() => {
                updates++;
            });
            useScene().launch('Hud');
        });
        try {
            // A first scene that leaves at once: the game has no scene of its own, as without the
            // splash, and what the system launched waits for one.
            const { frames, shown, end } = splashedScenes({
                Boot: () => {
                    const scene = useScene();
                    useReady(() => scene.stop());
                    return createScene();
                },
                Hud: () => createScene(),
            }, 'Boot');
            try {
                frames(30);
                expect(updates).toBe(0);
                expect(shown()).toEqual([SPLASH_SCENE]);
                frames(WHOLE_SPLASH);
                expect(updates).toBeGreaterThan(0);
                expect(shown()).toEqual([]);
            } finally {
                end();
            }
        } finally {
            remove();
        }
    });

    it('takes the style of its scene once the splash lets it go, its resolution too, and not before', () => {
        const { store, frames, end } = splashedScenes({
            Level: () => {
                useRenderStyle(RENDER.STYLES.ps1);
                return createScene();
            },
        }, 'Level');
        // Not even while its body runs, before the first frame.
        expect([store.get('config').width, store.get('config').height]).toEqual([480, 320]);
        frames(30);
        expect([store.get('config').width, store.get('config').height]).toEqual([480, 320]);
        frames(WHOLE_SPLASH);
        expect([store.get('config').width, store.get('config').height]).toEqual([320, 240]);
        end();
    });

    it('covers the whole screen on the frame it lets the game go, even when the game\'s style makes it bigger', () => {
        const canvas = createFakeCanvas(320, 224);
        const { store } = createTestGame({ width: 320, height: 224, keep: 'both', scaling: 'none' }, canvas);
        // What createGame does with the real screen: the canvas follows the resolution at once.
        store.subscribe('config', (config) => `${config.width}x${config.height}`, () => {
            canvas.width = store.get('config').width;
            canvas.height = store.get('config').height;
        });
        registerScene(store, 'Level', () => {
            useRenderStyle({ width: 640, height: 480 });
            return createScene();
        });
        startWithSplash(store, 'Level', canvas);
        const ctx = createFrameContext();
        let now = 0;
        for (let i = 0; i < 300 && gameBehindSplash(store); i++) {
            const prev = now;
            now += FRAME;
            tick(store, ctx, now, prev);
        }
        // The frame that let it go, drawn at the new size.
        expect([canvas.width, canvas.height]).toEqual([640, 480]);
        const splash = splashOf(store)!;
        const background = splash.drawables.find((drawable) => drawable.type === 'sprite' && drawable.zIndex === 0) as unknown as { width: number; height: number; transform: { x: number; y: number } };
        const camera = splash.camera2d!;
        const left = background.transform.x - camera.transform.x - background.width / 2;
        const top = background.transform.y - camera.transform.y - background.height / 2;
        expect(left).toBeLessThanOrEqual(0);
        expect(top).toBeLessThanOrEqual(0);
        expect(left + background.width).toBeGreaterThanOrEqual(640);
        expect(top + background.height).toBeGreaterThanOrEqual(480);
    });

    it('changes covered behind it as without it: a real transition, whose cover is not drawn over the splash', () => {
        const warn = spyOn(console, 'warn').mockImplementation(() => {});
        try {
            const { store, ctx, frames, shown, end } = splashedScenes({
                Boot: () => {
                    useScene().change('Level', { transition: fade(0.4) });
                    return createScene();
                },
                Level: () => createScene(),
            }, 'Boot');
            expect(store.get('transition').active).not.toBeNull();
            // In the place of the scene it replaces, as without the splash.
            expect(shown()).toEqual([SPLASH_SCENE, 'Level (held, behind)', 'Boot (behind)']);
            frames(5);
            expect(buildPostChain(store)).toBeNull();
            expect(ctx.progress).toBe(0);
            // Covered, swapped and uncovered behind the splash, which is still playing.
            frames(40);
            expect(store.get('transition').active).toBeNull();
            expect(shown()).toEqual([SPLASH_SCENE, 'Level (behind)']);
            frames(WHOLE_SPLASH);
            expect(shown()).toEqual(['Level']);
            expect(warn).not.toHaveBeenCalled();
            end();
        } finally {
            warn.mockRestore();
        }
    });

    it('is waited for while one of its changes is being covered', () => {
        let level!: TSceneHandle;
        const { store, frames, shown, end } = splashedScenes({
            Level: () => {
                level = useScene();
                return createScene();
            },
            Next: () => createScene(),
        }, 'Level');
        frames(60 * 1.6 - 10);
        level.change('Next', { transition: fade(1) });
        // Well past the splash's time: the change is still going on, and the splash stays.
        frames(40);
        expect(store.get('transition').active).not.toBeNull();
        expect(gameBehindSplash(store)).toBe(true);
        frames(WHOLE_SPLASH);
        expect(shown()).toEqual(['Next']);
        end();
    });

    it('hears the transition end once the splash has let it go, not before', () => {
        const heard: boolean[] = [];
        let store!: TRuntimeStore;
        const game = splashedScenes({
            Boot: () => {
                useScene().change('Level', { transition: fade(0.3) });
                return createScene();
            },
            Level: () => {
                useSceneTransitionEnd(() => heard.push(gameBehindSplash(store)));
                return createScene();
            },
        }, 'Boot');
        store = game.store;
        game.frames(60);
        expect(store.get('transition').active).toBeNull();
        expect(heard).toEqual([]);
        game.frames(WHOLE_SPLASH);
        expect(heard).toEqual([false]);
        game.end();
    });

    it('keeps what waits to be seen, a sound set to start on its own, until the splash lets it go', () => {
        let started = 0;
        const { frames, end } = splashedScenes({
            Level: () => {
                whenReleased(getActiveGame()!, getActiveBox()!, () => {
                    started++;
                });
                return createScene();
            },
        }, 'Level');
        frames(60);
        expect(started).toBe(0);
        frames(WHOLE_SPLASH);
        expect(started).toBe(1);
        end();
    });

    it('is let go all the same when the splash is taken away before it is over', () => {
        const { store, frames, shown, end } = splashedScenes({ Boot: boot, Level: () => createScene(), Hud: () => createScene() }, 'Boot');
        frames(30);
        stopScene(store, SPLASH_SCENE);
        expect(gameBehindSplash(store)).toBe(false);
        expect(shown()).toEqual(['Level', 'Hud']);
        frames(5);
        expect(shown()).toEqual(['Level', 'Hud']);
        end();
    });

    it('holds the game behind it when a change starts while it is sinking, until that change is over', () => {
        let level!: TSceneHandle;
        const { store, frames, shown, end } = splashedScenes({
            Level: () => {
                level = useScene();
                return createScene();
            },
            Next: () => createScene(),
        }, 'Level');
        // Its time, then a few frames into its way out: from a promise or a timer, say.
        frames(60 * 1.6 + 2 + 5);
        expect(gameBehindSplash(store)).toBe(true);
        level.change('Next', { transition: fade(1) });
        for (let i = 0; i < 300 && gameBehindSplash(store); i++) {
            frames(1);
            if (!gameBehindSplash(store)) expect(store.get('transition').active).toBeNull();
        }
        expect(gameBehindSplash(store)).toBe(false);
        frames(WHOLE_SPLASH);
        expect(shown()).toEqual(['Next']);
        end();
    });

    it('lets the first scene hear its transition end before its first update, as without the splash', () => {
        const heard: string[] = [];
        const body = () => {
            useSceneTransitionEnd(() => heard.push('end'));
            useUpdate(() => {
                heard.push('update');
            });
            return createScene();
        };
        const { frames, end } = splashedScenes({ Level: body }, 'Level');
        frames(WHOLE_SPLASH);
        expect(heard.slice(0, 2)).toEqual(['end', 'update']);
        end();
    });

    it('goes with a first scene that throws, rather than waiting for a game that is not there', () => {
        const canvas = createFakeCanvas(480, 320);
        const { store } = createTestGame({ width: 480, height: 320 }, canvas);
        registerScene(store, 'Broken', () => {
            throw new Error('broken');
        });
        expect(() => startWithSplash(store, 'Broken', canvas)).toThrow('broken');
        expect(store.get('world').scenes).toEqual([]);
        expect(gameBehindSplash(store)).toBe(false);
    });

    it('warns of the game\'s last scene stopped behind it, as without it', () => {
        const warn = spyOn(console, 'warn').mockImplementation(() => {});
        try {
            let level!: TSceneHandle;
            const { frames, end } = splashedScenes({
                Level: () => {
                    level = useScene();
                    return createScene();
                },
            }, 'Level');
            frames(5);
            level.stop();
            expect(warn.mock.calls.some((call) => String(call[0]).includes('was the last scene'))).toBe(true);
            end();
        } finally {
            warn.mockRestore();
        }
    });

    it('crosses behind it as without it: there is no picture to take of what nobody sees', () => {
        const stoppedAt: number[] = [];
        for (const splash of [false, true]) {
            const canvas = createFakeCanvas(480, 320);
            const { store } = createTestGame({ width: 480, height: 320 }, canvas);
            let frame = 0;
            registerScene(store, 'B', () => createScene());
            registerScene(store, 'A', () => {
                const scene = useScene();
                useReady(() => scene.change('B', { transition: crossfade(0.3) }));
                useCleanup(() => stoppedAt.push(frame));
                return createScene();
            });
            if (splash) startWithSplash(store, 'A', canvas);
            else startScene(store, 'A');
            const ctx = createFrameContext();
            let now = 0;
            for (frame = 1; frame <= 90; frame++) {
                const prev = now;
                now += FRAME;
                tick(store, ctx, now, prev);
            }
        }
        expect(stoppedAt[1]).toBe(stoppedAt[0]);
    });

    it('waits for the files of the game\'s systems too', () => {
        const asset = { status: 'loading' as TLoadStatus };
        const remove = registerGameSystem('test-splash-system-file', () => {
            getActiveBox()!.loads.push(asset as never);
        });
        try {
            const { store, frames, end } = splashedScenes({ Level: () => createScene() }, 'Level');
            frames(WHOLE_SPLASH);
            expect(gameBehindSplash(store)).toBe(true);
            asset.status = 'ready';
            frames(WHOLE_SPLASH);
            expect(gameBehindSplash(store)).toBe(false);
            end();
        } finally {
            remove();
        }
    });

    it('waits for every launch a system queued, the covered ones one after the other, before letting the game go', () => {
        const remove = registerGameSystem('test-splash-queued', () => {
            const scene = useScene();
            scene.launch('Hud', { transition: fade(2) });
            scene.launch('Map', { transition: fade(0.6) });
            scene.launch('Compass', { transition: fade(0.6) });
        });
        try {
            const { store, frames, shown, end } = splashedScenes({ Level: () => createScene(), Hud: () => createScene(), Map: () => createScene(), Compass: () => createScene() }, 'Level');
            for (let i = 0; i < 400 && gameBehindSplash(store); i++) frames(1);
            expect(gameBehindSplash(store)).toBe(false);
            expect(store.get('transition').active).toBeNull();
            expect(shown()).toEqual([SPLASH_SCENE, 'Level', 'Hud', 'Map', 'Compass']);
            end();
        } finally {
            remove();
        }
    });

    it('keeps a sound a system starts on its own waiting, when the game is told of the splash before its systems start', async () => {
        const audio = installFakeAudio();
        let sound!: ReturnType<typeof useSound>;
        const remove = registerGameSystem('test-splash-music', () => {
            sound = useSound({ samples: new Float32Array(44100), sampleRate: 44100 }, { autoplay: true, loop: true });
        });
        const canvas = createFakeCanvas(480, 320);
        const { store } = createTestGame({ width: 480, height: 320 }, canvas);
        try {
            registerScene(store, 'Level', () => createScene());
            // As createGame does: the splash said first, then the systems, then (after the splash's
            // module arrives) the splash and the game.
            expectSplash(store);
            startGameSystems(store);
            await Promise.resolve();
            startWithSplash(store, 'Level', canvas);
            expect(sound.playing).toBe(false);
            const ctx = createFrameContext();
            let now = 0;
            for (let i = 0; i < WHOLE_SPLASH; i++) {
                const prev = now;
                now += FRAME;
                tick(store, ctx, now, prev);
            }
            expect(gameBehindSplash(store)).toBe(false);
            expect(sound.playing).toBe(true);
        } finally {
            stopGameSystems(store);
            remove();
            audio.restore();
        }
    });

    it('lets the splash itself be collected once it has gone, the game still running', async () => {
        const splashes: WeakRef<object>[] = [];
        for (let i = 0; i < 8; i++) {
            const { store, frames, end } = splashedScenes({ Level: () => createScene() }, 'Level');
            splashes.push(new WeakRef(splashOf(store)!));
            frames(WHOLE_SPLASH);
            end();
        }
        for (let i = 0; i < 4; i++) {
            await Bun.sleep(0);
            Bun.gc(true);
        }
        // A careful collector may keep one or two alive by an old value on the stack; kept by the
        // registered scene, all eight would be.
        expect(splashes.filter((splash) => splash.deref() !== undefined).length).toBeLessThan(4);
    });

    it('is waited for, with the splash, while files of a scene launched behind it are coming', async () => {
        let level!: TSceneHandle;
        const asset: { status: TLoadStatus } = { status: 'loading' };
        let arrive!: () => void;
        const { store, frames, shown, end } = splashedScenes({
            Level: () => {
                level = useScene();
                return createScene();
            },
            Slow: () => {
                store.get('world').boxStack[0]!.loads.push(asset as never);
                trackLoad(asset as never, new Promise<void>((resolve) => {
                    arrive = () => { asset.status = 'ready'; resolve(); };
                }));
                return createScene();
            },
        }, 'Level');
        frames(60 * 1.6 - 10);
        level.launch('Slow');
        // Well past its time: still up, the game still behind it.
        frames(60);
        expect(shown()).toEqual([SPLASH_SCENE, 'Level (behind)', 'Slow (behind)']);
        arrive();
        await Promise.resolve();
        frames(WHOLE_SPLASH);
        expect(shown()).toEqual(['Level', 'Slow']);
        end();
    });

    it('is waited for, as well, for a file a scene asks for from its useReady', async () => {
        const asset: { status: TLoadStatus } = { status: 'loading' };
        let arrive!: () => void;
        const { frames, shown, end } = splashedScenes({
            Level: () => {
                const root = getActiveBox()!;
                useReady(() => {
                    root.loads.push(asset as never);
                    trackLoad(asset as never, new Promise<void>((resolve) => {
                        arrive = () => { asset.status = 'ready'; resolve(); };
                    }));
                });
                return createScene();
            },
        }, 'Level');
        frames(WHOLE_SPLASH);
        expect(shown()).toEqual([SPLASH_SCENE, 'Level (behind)']);
        arrive();
        await Promise.resolve();
        frames(WHOLE_SPLASH);
        expect(shown()).toEqual(['Level']);
        end();
    });

    it('is no longer waited for once the scene still loading is stopped, paused game or not', () => {
        for (const paused of [false, true]) {
            let level!: TSceneHandle;
            const asset: { status: TLoadStatus } = { status: 'loading' };
            const { store, frames, shown, end } = splashedScenes({
                Level: () => {
                    level = useScene();
                    return createScene();
                },
                Slow: () => {
                    store.get('world').boxStack[0]!.loads.push(asset as never);
                    trackLoad(asset as never, new Promise<void>(() => {}));
                    return createScene();
                },
            }, 'Level');
            level.launch('Slow');
            if (paused) store.setState('loop', { ...store.get('loop'), pausedBy: ['test'] });
            frames(WHOLE_SPLASH);
            expect(shown()).toEqual([SPLASH_SCENE, 'Level (behind)', 'Slow (behind)']);
            level.stop('Slow');
            frames(WHOLE_SPLASH);
            expect(shown(), `paused: ${paused}`).toEqual(['Level']);
            end();
        }
    });

    /**
     * How many times each scene is built, and what is shown once the splash is over, for scenes that
     * keep changing covered: with a splash and without, which must agree. A guard throws if they
     * build one another for ever.
     */
    const changesOf = (scenes: (count: () => void) => Record<string, () => ReturnType<typeof createScene>>, initial: string, splash: boolean) => {
        let built = 0;
        const count = (): void => {
            built++;
            if (built > 20) throw new Error('built for ever');
        };
        if (splash) {
            const { frames, shown, end } = splashedScenes(scenes(count), initial);
            frames(WHOLE_SPLASH);
            const seen = shown();
            end();
            return { built, seen };
        }
        const canvas = createFakeCanvas(480, 320);
        const { store } = createTestGame({ width: 480, height: 320 }, canvas);
        for (const [name, scene] of Object.entries(scenes(count))) registerScene(store, name, scene);
        startScene(store, initial);
        const ctx = createFrameContext();
        let now = 0;
        for (let i = 0; i < 90; i++) {
            const prev = now;
            now += FRAME;
            tick(store, ctx, now, prev);
        }
        return { built, seen: store.get('world').scenes.map((scene) => scene.name) };
    };

    it('stops scenes changing to one another covered just as it is stopped without the splash', () => {
        const warn = spyOn(console, 'warn').mockImplementation(() => {});
        try {
            const cases: Array<[string, (count: () => void) => Record<string, () => ReturnType<typeof createScene>>, string]> = [
                ['useReady changing to itself', (count) => ({
                    Level: () => { count(); const s = useScene(); useReady(() => s.change('Level', { transition: fade(0.3) })); return createScene(); },
                }), 'Level'],
                ['useReady restarting itself', (count) => ({
                    Level: () => { count(); const s = useScene(); useReady(() => s.restart({ transition: fade(0.3) })); return createScene(); },
                }), 'Level'],
                ['useReady of each changing to the other', (count) => ({
                    A: () => { count(); const s = useScene(); useReady(() => s.change('B', { transition: fade(0.3) })); return createScene(); },
                    B: () => { count(); const s = useScene(); useReady(() => s.change('A', { transition: fade(0.3) })); return createScene(); },
                }), 'A'],
                ['a body changing, and the useReady of the next changing back', (count) => ({
                    A: () => { count(); useScene().change('B', { transition: fade(0.3) }); return createScene(); },
                    B: () => { count(); const s = useScene(); useReady(() => s.change('A', { transition: fade(0.3) })); return createScene(); },
                }), 'A'],
                ['a useReady changing, and the body of the next changing back', (count) => ({
                    A: () => { count(); const s = useScene(); useReady(() => s.change('B', { transition: fade(0.3) })); return createScene(); },
                    B: () => { count(); useScene().change('A', { transition: fade(0.3) }); return createScene(); },
                }), 'A'],
                ['a body changing covered, and its useReady launching covered before that change is made', (count) => ({
                    Boot: () => {
                        count();
                        const s = useScene();
                        useReady(() => s.launch('Hud', { transition: fade(0.3) }));
                        s.change('Level', { transition: fade(0.3) });
                        return createScene();
                    },
                    Level: () => { count(); return createScene(); },
                    Hud: () => { count(); return createScene(); },
                }), 'Boot'],
                ['a body changing covered, then launching the HUD', (count) => ({
                    Boot: () => {
                        count();
                        const s = useScene();
                        s.change('Title', { transition: fade(0.3) });
                        s.launch('Hud');
                        return createScene();
                    },
                    Title: () => { count(); return createScene(); },
                    Hud: () => { count(); return createScene(); },
                }), 'Boot'],
                ['a covered launch whose scene throws, caught, then a covered change', (count) => ({
                    Boot: () => {
                        count();
                        const s = useScene();
                        useReady(() => {
                            try {
                                s.launch('Broken', { transition: fade(0.3) });
                            } catch {
                                // Caught by the game.
                            }
                            s.change('Title', { transition: fade(0.3) });
                        });
                        return createScene();
                    },
                    Broken: () => { count(); throw new Error('broken'); },
                    Title: () => { count(); return createScene(); },
                }), 'Boot'],
                ['a body changing covered, and the HUD it launched stopping it meanwhile', (count) => ({
                    Boot: () => {
                        count();
                        const s = useScene();
                        s.launch('Hud');
                        s.change('Title', { transition: fade(0.3) });
                        return createScene();
                    },
                    Hud: () => { count(); const s = useScene(); useReady(() => s.stop('Boot')); return createScene(); },
                    Title: () => { count(); return createScene(); },
                }), 'Boot'],
                ['a body changing covered, and the HUD it launched restarting it meanwhile', (count) => ({
                    Boot: () => {
                        count();
                        const s = useScene();
                        if (!s.isRunning('Hud')) s.launch('Hud');
                        s.change('Title', { transition: fade(0.3) });
                        return createScene();
                    },
                    Hud: () => { count(); const s = useScene(); useReady(() => s.restart('Boot')); return createScene(); },
                    Title: () => { count(); return createScene(); },
                }), 'Boot'],
                ['a body changing covered, then asking for its useReady, still running in it', (count) => ({
                    Boot: () => {
                        count();
                        const s = useScene();
                        s.change('Title', { transition: fade(0.3) });
                        useReady(() => {
                            if (s.isRunning('Boot')) s.launch('Fx');
                        });
                        return createScene();
                    },
                    Title: () => { count(); return createScene(); },
                    Fx: () => { count(); return createScene(); },
                }), 'Boot'],
                ['a stop whose cleanup throws, caught, then a covered change', (count) => ({
                    Boot: () => {
                        count();
                        const s = useScene();
                        useReady(() => {
                            s.launch('Fragile');
                            try {
                                s.stop('Fragile', { transition: fade(0.3) });
                            } catch {
                                // Caught by the game.
                            }
                            s.change('Next', { transition: fade(0.3) });
                        });
                        return createScene();
                    },
                    Fragile: () => { count(); useCleanup(() => { throw new Error('fragile'); }); return createScene(); },
                    Next: () => { count(); return createScene(); },
                }), 'Boot'],
            ];
            for (const [what, scenes, initial] of cases) {
                expect(changesOf(scenes, initial, true), what).toEqual(changesOf(scenes, initial, false));
            }
        } finally {
            warn.mockRestore();
        }
    });

    it('launches, one frame after the other, what two game systems launched covered from their bodies', () => {
        const warn = spyOn(console, 'warn').mockImplementation(() => {});
        const first = registerGameSystem('test-splash-covered-a', () => { useScene().launch('Hud', { transition: fade(0.3) }); });
        const second = registerGameSystem('test-splash-covered-b', () => { useScene().launch('Map', { transition: fade(0.3) }); });
        try {
            const { frames, shown, end } = splashedScenes({ Level: () => createScene(), Hud: () => createScene(), Map: () => createScene() }, 'Level');
            try {
                frames(WHOLE_SPLASH);
                expect(shown()).toEqual(['Level', 'Hud', 'Map']);
                expect(warn).not.toHaveBeenCalled();
            } finally {
                end();
            }
        } finally {
            first();
            second();
            warn.mockRestore();
        }
    });

    it('makes a later covered change from a body all the same, once the first one is made', () => {
        const warn = spyOn(console, 'warn').mockImplementation(() => {});
        try {
            let intro!: TSceneHandle;
            const { frames, shown, end } = splashedScenes({
                Boot: () => {
                    useScene().change('Intro', { transition: fade(0.4) });
                    return createScene();
                },
                Intro: () => {
                    intro = useScene();
                    return createScene();
                },
                // The usual loader: it moves on, covered, from its body.
                Loader: () => {
                    useScene().change('Level', { transition: fade(0.4) });
                    return createScene();
                },
                Level: () => createScene(),
            }, 'Boot');
            frames(30);
            intro.launch('Loader');
            frames(WHOLE_SPLASH);
            expect(shown()).toEqual(['Intro', 'Level']);
            expect(warn).not.toHaveBeenCalled();
            end();
        } finally {
            warn.mockRestore();
        }
    });

    it('keeps nothing alive once the splash is over and the scenes started behind it have stopped', async () => {
        const roots: WeakRef<object>[] = [];
        let hud!: TSceneHandle;
        const { frames, shown, end } = splashedScenes({
            Boot: boot,
            Level: () => {
                roots.push(new WeakRef(getActiveBox()!));
                return createScene();
            },
            Hud: () => {
                hud = useScene();
                return createScene();
            },
        }, 'Boot');
        // Restarted many times behind the splash: the old copies stop, and nothing should keep them.
        for (let i = 0; i < 40; i++) hud.restart('Level');
        frames(WHOLE_SPLASH);
        expect(shown()).toEqual(['Level', 'Hud']);
        hud.stop('Level');
        frames(2);
        for (let i = 0; i < 3; i++) {
            Bun.gc(true);
            await Bun.sleep(0);
        }
        Bun.gc(true);
        // A careful collector may keep a few alive by an old value on the stack; kept for good, all
        // forty-one would be.
        expect(roots.filter((root) => root.deref() !== undefined).length).toBeLessThan(10);
        end();
    });

});
