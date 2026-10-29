import { getActiveBox } from '../../store';
import { getActiveGame } from '../../store/active_game';
import { outsideSceneBody } from '../../utils/outside_scene_body';

/**
 * Runs your code once, when everything being built with it exists: the whole scene, children and
 * all, before its first frame.
 *
 * A body runs as its object is made, and an object is made before the ones inside it. In a scene
 * written in code that rarely shows, because the body makes its children itself; in a scene laid out
 * as a document it always does: a behaviour on the scene's root runs before the boxes under it are
 * there, so `findObject(root, 'Pitcher')` in its body finds nothing. Inside `useReady` it finds it.
 *
 * For something spawned later (a `useSpawn` called from a `useUpdate` or a click), it runs as soon
 * as that thing and everything inside it are built, before the spawner's call returns.
 *
 * It runs with its object as the one being built, so hooks called inside it (a `useUpdate` that
 * needs what was found) belong to that object. Register as many as you like: they run in the order
 * they were registered, parents' before children's.
 *
 * @param callback What to do once everything is there. It receives nothing and runs exactly once.
 *
 * @example
 * ```ts
 * // A behaviour on the root of a scene laid out as a document.
 * registerScript('match', () => {
 *     const root = useSelf();
 *
 *     // Here, in the body, the boxes under the root are not built yet.
 *     useReady(() => {
 *         const pitcher = findObject(root, 'Pitcher');
 *         if (pitcher === null) return;
 *         useUpdate((delta) => {
 *             pitcher.transform!.x += 10 * delta;
 *         });
 *     });
 * });
 * ```
 *
 * @category Lifecycle
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const useReady = (callback: () => void): void => {
    const box = getActiveBox();
    const game = getActiveGame();
    if (box === null || game === null) {
        throw outsideSceneBody('useReady');
    }
    game.get('world').ready.push({ box, run: callback });
};
