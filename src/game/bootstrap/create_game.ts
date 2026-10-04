import { createCanvas } from "../../DOM/create_canvas";
import { teardownBox } from "../../box";
import { createRenderer } from "../../render";
import { installPostChain, normalizePostChain } from "../../post";
import { createRuntimeStore, type TRuntimeStore } from "../../store";
import { createFrameContext, tick } from "../loop";
import { registerScene, startScene, type TSceneFn } from "../../scene";
import type { TGameConfig } from "../types/t_game_config";
import type { TGameInstance } from "../types/t_game_instance";
import type { TGameOptions } from "../types/t_game_options";
import { cleanGameOptions } from "./clean_gameoptions";
import { openHost } from "../handle/editor_handle_of";
import { createGameEvents } from "./create_game_events";
import { createGameHandle } from "../handle/create_game_handle";
import { watchVisibility } from "./watch_visibility";
import { VERSION } from "../../version";
import { settleCapture } from "../capture";
import type { TRendererBackend } from "../../render/interface";

/**
 * Where a game puts its canvas: a CSS selector or an element to put it in (a `<canvas>` is drawn on
 * as it is), or `null` for the page's body.
 *
 * @category Game
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TGameTarget = string | HTMLElement | null;

/**
 * The startup line: the engine, its version, and **which backend actually started**.
 *
 * The backend rides on the banner instead of getting a line of its own because it is the first
 * question asked of any drawing bug, and a banner that answers it turns a conversation into one
 * screenshot. It is also why this prints *after* the renderer resolves and not at `createGame`:
 * nobody knows which one won before that, and a line that had to guess would be worse than one
 * that arrives a few milliseconds late.
 *
 * It deliberately does not clear the console. A page can hold more than one game (an editor
 * opening a play window over its viewport is the case that settles it), and clearing would wipe
 * the host's own messages at the exact moment a second game is started to look into something.
 */
const logBanner = (backend: TRendererBackend): void => {
    console.log(
        `%c NacatamalOn %c v${VERSION} %c ${backend} `,
        'background:linear-gradient(180deg,#0067C6 0%,#0067C6 33%,#FFFFFF 33%,#FFFFFF 66%,#0067C6 66%,#0067C6 100%); color:orangered; font-weight:bold; padding:4px 8px; font-size:16px;',
        'color:#888; font-size:12px;',
        `color:${backend === 'WEBGPU' ? '#8ee6a0' : '#e8a03c'}; font-size:12px; font-weight:bold;`,
    );
};

/**
 * Puts a game in the page: a canvas inside `target`, drawn at `width × height`.
 *
 * It is called twice. The first call makes the canvas and returns a function; calling that with the
 * game's scenes starts it, on the first one or on the one named second. A scene is named by its key,
 * which is how `useScene().change('Level')` finds it later.
 *
 * Nothing waits. The renderer starts on its own time, so what comes back is the running game at
 * once: `on('ready', …)` hears when it is up, and `on('error', …)` why it could not start.
 *
 * @example
 * ```ts
 * const Title: TSceneFn = () => createScene();
 * const Level: TSceneFn = () => createScene();
 *
 * const game = createGame('#game', {
 *     width: 320,
 *     height: 224,
 *     background: getColor('#000000'),
 *     scaling: 'integer',
 * })({ Title, Level }, 'Title');
 *
 * game.on('error', (error) => console.error(error));
 * ```
 *
 * @param target - Where the canvas goes: a CSS selector, an element, or `null` for the page's body.
 * @param game_options - Its resolution, background, and how it scales to the page. See {@link TGameOptions}.
 * @returns The function that starts the game with its scenes, and returns the running game.
 *
 * @category Game
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const createGame = (target: TGameTarget, game_options: TGameOptions) => {
    const cleanedOptions = cleanGameOptions(game_options);
    const {
        width,
        height,
        background,
        renderer,
        seed: _seed,
        smooth,
        msaa,
        scaling,
        keep,
        pixelRatio,
        fullscreenScaling,
        pauseOnBlur,
        banner
    } = cleanedOptions;
    const screen = createCanvas(target, { width, height, smooth, scaling, keep, pixelRatio, fullscreenScaling });
    // Null until half 2: the store cannot exist without a renderer, and the renderer is the
    // await. Everything in half 1 that touches it, `destroy` above all, has to cope with that.
    let store: TRuntimeStore | null = null;

    let destroyRequested = false;
    // Dropped on destroy along with everything else. `store.destroy()` would take it anyway; this
    // is here so the renderer stops hearing about settings the moment it is on its way out.
    let unwatchConfig: (() => void) | null = null;
    // What the page around the game hears: `ready`, `error` and `destroy` (see `TGameInstance.on`).
    const events = createGameEvents();

    const destroy = (): void => {
        if (destroyRequested) return;
        destroyRequested = true;

        // A local const so the check and the use read the same value. If the store does not
        // exist yet, the renderer has not answered: half 2 sees `destroyRequested` and shuts
        // it down when it does.
        const current = store;
        if (current !== null) {
            // The flag first, so the frame already queued returns on its first line instead of
            // reaching a renderer that is about to go.
            current.setState('loop', { destroyed: true });
            // No frame will draw a capture still waiting for one.
            settleCapture(current, new Error('[NacatamalOn] capture: the game was destroyed before it was drawn.'));
            // Every live scene runs its unmount cleanups before the renderer goes, so a cleanup
            // that releases something of its own still finds the game in one piece.
            for (const scene of current.get('world').scenes) {
                teardownBox(scene);
            }
            unwatchConfig?.();
            current.get('input').keyboard.destroy();
            current.get('input').pointer.destroy();
            current.get('input').gamepads.destroy();
            current.get('audio').manager?.destroy();
            current.get('screen').renderer.destroy();
            current.destroy();
        }
        screen.destroy();
        events.emit('destroy', undefined);
    };
    
    // Each key is the scene's name.
    return (scenes: Readonly<Record<string, TSceneFn>>, initialScene?: string): TGameInstance => {
        // TypeScript already rejects an array, but from plain JavaScript `[MainScene]` would register
        // a scene called '0'. The API used to take an array, so this is the likeliest mistake.
        if (Array.isArray(scenes)) {
            throw new Error('[NacatamalOn] createGame: scenes go in an object keyed by name, e.g. ({ MainScene }).');
        }
        if (initialScene !== undefined && !Object.hasOwn(scenes, initialScene)) {
            throw new Error(`[NacatamalOn] createGame: initial scene '${initialScene}' is not in the scenes object.`);
        }

        // Registered before the renderer starts, so a tool asking for this game's handle straight
        // after `createGame` returns gets something to wait on (see `editorHandleOf`).
        const instance: TGameInstance = { destroy, on: events.on };
        const host = openHost(instance);

        const run = async () => {
            // Not named `renderer`: that one is already taken by the destructuring above, where
            // it is the REQUEST ('AUTO' | 'WEBGPU' | 'WEBGL2'). This is the instance that won.
            const rendererInstance = await createRenderer(screen.canvas, { renderer, msaa, background, smooth });
            // Destroyed while the renderer was starting: checked before anything else is made, so
            // there is no store, no keyboard listening on the window, nothing left alive but this
            // renderer, which goes too. A tool waiting on `editorHandleOf` hears why instead of
            // waiting for ever.
            if (destroyRequested) {
                rendererInstance.destroy();
                host.cancel(new Error('[NacatamalOn] editorHandleOf: the game was destroyed before it started.'));
                return;
            }
            if (banner) {
                logBanner(rendererInstance.capabilities.backend);
            }

            // A local const, and `store` is assigned FROM it. Anything below captures this
            // reference instead of re-reading the outer `let` later, which is what makes the
            // `!` unnecessary rather than merely silenced.
            const runtime = createRuntimeStore({
                canvas: screen.canvas,
                fullscreen: screen.fullscreen,
                renderer: rendererInstance,
                config: cleanedOptions as TGameConfig,
            });
            store = runtime;

            // Before any scene, so the game's own look sits in front of whatever a scene adds.
            const askedChain = (cleanedOptions as TGameConfig).post;
            if (askedChain !== undefined && askedChain.length > 0) {
                installPostChain(runtime, normalizePostChain(askedChain));
            }

            // The object's keys are the names. The same door any later registration goes through.
            for (const [name, scene] of Object.entries(scenes)) {
                registerScene(runtime, name, scene);
            }

            // The renderer follows the game's `smooth` instead of being told once at boot. This is
            // what that section of the store is for: whoever changes the setting (an editor, an
            // options screen) does not have to know a renderer exists. The selector is a boolean,
            // so writing anything else in `config` does not wake it.
            const unwatchSmooth = runtime.subscribe(
                'config',
                (config) => config.smooth,
                (smooth) => rendererInstance.setSmooth(smooth),
            );
            // The first error a scene's update throws goes out to the page as well, since whoever
            // holds the game may not be reading the console. `emit` says each event once, which is
            // what `TRuntimeState.loop.failure` promises too.
            const unwatchFailure = runtime.subscribe(
                'loop',
                (loop) => loop.failure,
                (failure) => {
                    if (failure !== null) {
                        events.emit('error', failure);
                    }
                },
            );
            // A graphics card lost for good (WebGPU; WebGL2 recovers on its own) is said once, in the
            // console and to the page, which can offer to reload. A game destroyed meanwhile hears nothing.
            rendererInstance.deviceLost?.then((error) => {
                if (error !== null && !destroyRequested) {
                    console.error(error.message);
                    events.emit('error', error);
                }
            });
            // `pauseOnBlur`: the browser holds the loop while the page is hidden, beside any other hold.
            const unwatchVisibility = pauseOnBlur ? watchVisibility(createGameHandle(runtime)) : () => {};
            unwatchConfig = () => {
                unwatchSmooth();
                unwatchFailure();
                unwatchVisibility();
            };

            // Only the requested scene runs; the rest stay dormant until something launches them.
            // Without an initial scene, the first one declared starts. With no scenes, nothing does.
            const initial = initialScene ?? Object.keys(scenes)[0];
            if (initial !== undefined) startScene(runtime, initial);
            // `runtime`, not `store`: the const that cannot be null, rather than the outer `let`
            // that only exists so `destroy` can look at it from half 1.
            // `performance.now()` for the first call because there is no scheduler timestamp
            // yet, and it is the same clock `requestAnimationFrame` hands over afterwards.
            const startTime = performance.now();
            tick(runtime, createFrameContext(), startTime, startTime);
            host.resolve(runtime);
            events.emit('ready', createGameHandle(runtime));
        }

        // A failure to start (no WebGPU and no WebGL2) goes to whoever is waiting on the handle. With
        // nobody waiting it still surfaces as an unhandled rejection, the way it did before.
        run().catch((error: unknown) => {
            host.reject(error);
            events.emit('error', error instanceof Error ? error : new Error(String(error)));
        });
        return instance;
    }

}
