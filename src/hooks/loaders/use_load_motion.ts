import { warnIfKeyTaken } from '../../loaders/key_taken';
import { getActiveBox, getActiveGame } from '../../store';
import { loadMotion, newMotionFile } from '../../loaders/motion';
import { rootOf } from '../../box';
import { trackLoad } from '../../loaders/track_load';
import type { TMotionFile } from '../../loaders/motion';
import { assetKey } from '../../loaders/asset_key';
import { outsideSceneBody } from '../../utils/outside_scene_body';

/**
 * What `useLoadMotion` is asked for.
 *
 * @category Assets & loading
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TUseLoadMotionOptions = {
    /**
     * Where the `.motion` file is.
     */
    src: string;
    /**
     * What to keep it under, so another scene can reach the same one. Defaults to `src` as the page
     * resolves it, so one file written two ways (on a page at the root, `./assets/a.png` and
     * `/assets/a.png`) is kept once and found by either.
     */
    key?: string;
};

/**
 * Loads a motion: a `.motion` file of values moved over time by keys, made in an editor's motion
 * panel.
 *
 * Handed back at once and filled in when it lands, like every other asset, and counted by a loading
 * scene the same way.
 *
 * @param options Where the file is, and what to keep it under.
 * @returns The motion, to hand to `useMotion`.
 *
 * @example
 * ```ts
 * const intro = useLoadMotion({ src: '/motions/intro.motion' });
 * useMotion(intro, { autoplay: true });
 * ```
 *
 * @category Assets & loading
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const useLoadMotion = ({ src, key }: TUseLoadMotionOptions): TMotionFile => {
    const store = getActiveGame();
    const box = getActiveBox();
    if (store === null || box === null) {
        throw outsideSceneBody('useLoadMotion');
    }

    const cacheKey = key ?? assetKey(src);
    const { motions } = store.get('assets');

    let file = motions.get(cacheKey);
    if (file !== undefined) warnIfKeyTaken('useLoadMotion', cacheKey, file.src, src);
    if (file === undefined) {
        file = newMotionFile(src, cacheKey);
        motions.set(cacheKey, file);
        trackLoad(file, loadMotion(store, file));
    }

    const { loads } = rootOf(box);
    if (!loads.includes(file)) {
        loads.push(file);
    }

    return file;
};
