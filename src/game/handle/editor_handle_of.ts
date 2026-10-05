import { createGameHandle } from './create_game_handle';
import { loadHostScene } from '../../scene/load_host_scene';
import type { TEditorHandle } from './t_editor_handle';
import type { TGameInstance } from '../types/t_game_instance';
import type { TRuntimeStore } from '../../store';
import { captureScreen } from '../capture';
import { replaceProjectPostChain } from '../../post/install_post_chain';
import { setCameraPreview } from '../preview';
import { MAX_FRAME_DELTA } from '../../CONFIG';

/**
 * Each game's running state, reachable from the instance `createGame` handed back.
 *
 * Held here and not on the instance so that what a game holds stays exactly what a game may use:
 * the instance says `destroy` and nothing else, and a tool that needs more imports it from the
 * tools' door. Weak, so a game that is thrown away takes its entry with it.
 */
const hosts = new WeakMap<TGameInstance, Promise<TRuntimeStore>>();

/**
 * The games a tool has asked to drive. A tool asks for the handle straight after `createGame`
 * returns, before the renderer has answered, so by the time the game decides whether to show its
 * splash it already knows that nobody is going to play it: an editor's viewport is not a game
 * starting, and must not open with a logo.
 */
const claimed = new WeakSet<TGameInstance>();

/**
 * Whether a tool has asked for this game's handle.
 *
 * @internal
 */
export const isHostClaimed = (instance: TGameInstance): boolean => claimed.has(instance);

/**
 * Registers an instance before its game has started, and returns the two ends of the promise its
 * state arrives on.
 *
 * Before, and not once the state exists, because the renderer starts asynchronously: a tool asks
 * for the handle straight after `createGame` returns, and it must get something to wait on rather
 * than nothing.
 *
 * `cancel` is `reject` for a game that will never start because it was destroyed first: whoever
 * waits on the handle hears why, and a page that never asked hears nothing, where a plain `reject`
 * would surface as an unhandled rejection for something the page did on purpose.
 *
 * @internal
 */
export const openHost = (instance: TGameInstance): {
    resolve: (store: TRuntimeStore) => void;
    reject: (error: unknown) => void;
    cancel: (error: unknown) => void;
} => {
    let resolve!: (store: TRuntimeStore) => void;
    let reject!: (error: unknown) => void;
    const pending = new Promise<TRuntimeStore>((done, fail) => {
        resolve = done;
        reject = fail;
    });
    hosts.set(instance, pending);
    const cancel = (error: unknown): void => {
        // A handler of its own marks the rejection as seen; a caller awaiting the handle still gets it.
        pending.catch(() => {});
        reject(error);
    };
    return { resolve, reject, cancel };
};

/**
 * The handle a **tool** drives a running game with, once the game has started.
 *
 * A game never needs this: it reaches itself from inside with `useGame()`. A tool is outside, holding
 * only what `createGame` returned, and this is the way in, from the door that only tools import.
 *
 * It waits for the renderer, which starts asynchronously, and **rejects** if it could not start at
 * all (no WebGPU and no WebGL2), so a tool can say so instead of waiting for ever.
 *
 * @example
 * ```ts
 * import { createGame, sceneFromDoc, type TSceneDoc } from 'nacatamalon';
 * import { editorHandleOf } from 'nacatamalon/authoring';
 *
 * declare const container: HTMLElement;
 * declare const doc: TSceneDoc;
 *
 * const game = createGame(container, { width: 640, height: 360 })({});
 * const editor = await editorHandleOf(game);
 * editor.loadScene('room-a', sceneFromDoc(doc, 'room-a', { scripts: 'attach' }));
 * ```
 * @param instance - What `createGame` returned.
 * @returns The handle, once the renderer is up. Rejects when neither WebGPU nor WebGL2 could start.
 *
 * @category Game
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const editorHandleOf = async (instance: TGameInstance): Promise<TEditorHandle> => {
    const pending = hosts.get(instance);
    if (pending === undefined) {
        throw new Error('[NacatamalOn] editorHandleOf: that is not a game made with createGame.');
    }
    claimed.add(instance);
    const store = await pending;
    return {
        ...createGameHandle(store),
        loadScene: (name, scene) => loadHostScene(store, name, scene),
        setViewportCamera: (camera) => store.setState('viewport', { camera3d: camera }),
        getViewportCamera: () => store.get('viewport').camera3d,
        setViewportCamera2d: (camera) => store.setState('viewport', { camera2d: camera }),
        getViewportCamera2d: () => store.get('viewport').camera2d,
        setViewportLayers: (layers) => store.setState('viewport', { layers }),
        getViewportLayers: () => store.get('viewport').layers,
        capture: (options) => captureScreen(store, options),
        setPostChain: (chain) => replaceProjectPostChain(store, chain),
        setPostProcessEnabled: (enabled) => store.setState('post', { enabled }),
        getPostEffects: () => store.get('post').effects,
        evictAsset: (key) => {
            let dropped = false;
            for (const cache of Object.values(store.get('assets'))) {
                dropped = cache.delete(key) || dropped;
            }
            return dropped;
        },
        getFrameError: () => store.get('loop').failure,
        setCameraPreview: (preview) => setCameraPreview(store, preview),
        getCameraPreview: () => store.get('viewport').preview?.canvas ?? null,
        stepFrame: (dt = 1 / 60) => {
            const loop = store.get('loop');
            if (loop.pausedBy.length === 0 || loop.destroyed) {
                return false;
            }
            store.setState('loop', { step: Math.min(Math.max(0, dt), MAX_FRAME_DELTA) });
            return true;
        },
        getActions: () => store.get('input').actions.handle(),
        getScenes: () => store.get('world').scenes,
        clearFrameError: () => {
            if (store.get('loop').failure === null) {
                return false;
            }
            store.setState('loop', { failure: null });
            return true;
        },
    };
};
