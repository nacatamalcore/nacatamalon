import { rootOf } from '../../box';
import { getActiveBox } from '../../store';
import { whenLoaded } from '../../loaders';
import type { TLoadable, TLoader } from '../../loaders';

/**
 * Keeps count of what a scene is loading, for a loading bar or to wait before changing scene.
 *
 * - `useLoader([hero, tiles])`: exactly those.
 * - `useLoader()`: everything this scene asks for with `useLoadTexture`, including what its body
 *   asks for after this line. Counted once the body is over.
 *
 * The scene keeps drawing while it loads, so a loading bar made of sprites without a texture is on
 * screen from the first frame. Must be called inside a scene body, like every hook.
 * 
 * A clarification: If you use `useLoader()` with no arguments, it will track all assets requested by the scene, including those requested after the call.
 * If you use with a specific list of assets, it will only track those and ignore any others requested by the scene.
 *
 * @example
 * ```ts
 * export const Loading: TSceneFn = () => {
 *     const scene = useScene();
 *     const loader = useLoader([
 *         useLoadTexture({ src: '/assets/hero.png', key: 'hero' }),
 *         useLoadTexture({ src: '/assets/tiles.png', key: 'tiles' }),
 *     ]);
 *     const bar = createSprite({ width: 0, height: 8, transform: { x: 60, y: 112 } });
 *     useUpdate(() => {
 *         bar.width = loader.progress * 200;
 *         if (loader.done) scene.change('Level');
 *     });
 *     return createScene();
 * };
 * ```
 *
 * @param assets - What to count. Left out, everything the scene asks for.
 * @returns How far it has got: `total`, `loaded`, `progress` from 0 to 1, and `done`.
 *
 * @category Assets & loading
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const useLoader = (assets?: readonly TLoadable[]): TLoader => {
    const box = getActiveBox();
    if (box === null) {
        throw new Error('[NacatamalOn] useLoader: call it inside a scene body.');
    }

    // With no list, the scene's own list and not a copy: what the body asks for after this line
    // lands in it too.
    const tracked = assets ?? rootOf(box).loads;
    const loader: TLoader = { total: 0, loaded: 0, progress: 0, done: false };

    const recount = (): void => {
        loader.total = tracked.length;
        loader.loaded = tracked.filter((asset) => asset.status !== 'loading').length;
        loader.progress = loader.total === 0 ? 1 : loader.loaded / loader.total;
        loader.done = loader.loaded === loader.total;
    };

    const watch = (): void => {
        recount();
        for (const asset of tracked) {
            whenLoaded(asset).then(recount);
        }
    };

    recount();
    if (assets === undefined) {
        // The body is still running and may ask for more: start watching once it is over, which is
        // before the first frame can read the loader.
        queueMicrotask(watch);
    } else {
        watch();
    }

    return loader;
};
