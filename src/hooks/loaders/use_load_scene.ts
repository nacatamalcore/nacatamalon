import { warnIfKeyTaken } from '../../loaders/key_taken';
import { rootOf } from '../../box';
import { trackLoad } from '../../loaders/track_load';
import { loadScene, newSceneLoad } from '../../loaders/scene';
import { getActiveBox, getActiveGame } from '../../store';
import type { TLoadedScene } from '../../loaders/scene';
import { assetKey } from '../../loaders/asset_key';
import { outsideSceneBody } from '../../utils/outside_scene_body';

/**
 * What `useLoadScene` is asked for.
 *
 * @category Assets & loading
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TUseLoadSceneOptions = {
    /**
     * Where the `.scene` file is, from the page: `scenes/cave.scene`.
     */
    src: string;
    /**
     * What to keep it under, so another scene can reach the same one. Defaults to `src` as the page
     * resolves it, so one file written two ways (on a page at the root, `./scenes/cave.scene` and
     * `/scenes/cave.scene`) is loaded once and found by either.
     */
    key?: string;
};

/**
 * Loads a scene laid out in the editor: a `.scene` file.
 *
 * When it lands it is added to the game under the name written in it, which is not always the file's
 * (`cave.scene` may be the scene `Cave`): its `name` says which, and `change(cave.name)` starts it
 * like a scene written in code, and what it uses (its pictures, sounds, models) is asked for at once,
 * so it starts with all of it there.
 *
 * Handed back at once and filled in when it lands, like every other asset, and `useLoader` counts it
 * until what it uses has arrived too. Asking for the same file twice, in this scene or another, gives
 * back the one already loaded.
 *
 * Which files a game has is for the game to say: a page cannot look inside a folder, so the editor
 * keeps the list in `src/scenes.ts`.
 *
 * @param options Where the file is, and what to keep it under.
 * @returns The scene: its `status`, and its `name` once it lands.
 *
 * @example
 * ```ts
 * const Loading: TSceneFn = () => {
 *     const scene = useScene();
 *     const cave = useLoadScene({ src: 'scenes/cave.scene' });
 *     const loader = useLoader();
 *     useUpdate(() => {
 *         if (loader.done) scene.change(cave.name);
 *     });
 *     return createScene();
 * };
 * ```
 *
 * @category Assets & loading
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const useLoadScene = ({ src, key }: TUseLoadSceneOptions): TLoadedScene => {
    const store = getActiveGame();
    const box = getActiveBox();
    if (store === null || box === null) {
        throw outsideSceneBody('useLoadScene');
    }

    const cacheKey = key ?? assetKey(src);
    const { scenes } = store.get('assets');

    let scene = scenes.get(cacheKey);
    if (scene !== undefined) warnIfKeyTaken('useLoadScene', cacheKey, scene.src, src);
    if (scene === undefined) {
        scene = newSceneLoad(src, cacheKey);
        scenes.set(cacheKey, scene);
        trackLoad(scene, loadScene(store, scene));
    }

    const { loads } = rootOf(box);
    if (!loads.includes(scene)) {
        loads.push(scene);
    }

    return scene;
};
