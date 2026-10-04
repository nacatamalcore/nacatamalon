import { rootOf } from '../../box';
import { trackLoad } from '../../loaders/track_load';
import { loadPack, newPack } from '../../loaders/pack';
import { getActiveBox, getActiveGame } from '../../store';
import type { TLoadedPack } from '../../loaders/pack';

/**
 * What `useLoadPack` is asked for.
 *
 * @category Assets & loading
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TUseLoadPackOptions = {
    /**
     * The pack's folder: where `pack.json` is. With or without the last `/`.
     */
    src: string;
    /**
     * What to keep it under, so another scene can reach the same one. Defaults to `src`.
     */
    key?: string;
};

/**
 * Loads a pack: boxes and scenes somebody made in another project, with everything they need.
 *
 * A pack is a folder (what installing a `.nacapack` writes) and this reads it: its manifest, and the
 * document of each box and scene it offers, with every picture and sound they use found **inside the
 * pack's folder**, wherever you serve it. Hand it to `createPack` to place what it offers.
 *
 * The input actions its scripts read are added to the game when it lands, if the game does not have
 * them already. Its scripts are code, which a loader cannot bring: import the pack's `<name>.pack.ts`
 * once and they are registered.
 *
 * Handed back at once and filled in when it lands, like every other asset, and `useLoader` counts it.
 * Asking for the same pack twice, in this scene or another, gives back the one already loaded.
 *
 * @param options Where the pack is, and what to keep it under.
 * @returns The pack, to hand to `createPack`.
 *
 * @example
 * ```ts
 * const Plaza: TSceneFn = () => {
 *     const signs = useLoadPack({ src: '/packs/signpost' });
 *     createPack({ pack: signs, box: 'Signpost', transform: { x: 100, y: 120 } });
 *     return createScene();
 * };
 * ```
 *
 * @category Assets & loading
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const useLoadPack = ({ src, key }: TUseLoadPackOptions): TLoadedPack => {
    const store = getActiveGame();
    const box = getActiveBox();
    if (store === null || box === null) {
        throw new Error('[NacatamalOn] useLoadPack: call it inside a scene body.');
    }

    const folder = src.endsWith('/') ? src : `${src}/`;
    const cacheKey = key ?? folder;
    const { packs } = store.get('assets');

    let pack = packs.get(cacheKey);
    if (pack === undefined) {
        pack = newPack(folder, cacheKey);
        packs.set(cacheKey, pack);
        trackLoad(pack, loadPack(store, pack));
    }

    const { loads } = rootOf(box);
    if (!loads.includes(pack)) {
        loads.push(pack);
    }

    return pack;
};
