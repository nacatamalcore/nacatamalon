import type { TActionMap } from '../../../input';
import type { TSceneDoc } from '../../../scene/document/types/t_scene_doc';
import type { TLoadStatus } from '../../types/t_load_status';

/**
 * A pack, as `useLoadPack` hands it back: what it offers, ready to be placed with `createPack`.
 *
 * It is a definition and not something in the world. It has no position and no state of its own,
 * the same as a model file: each copy made from it with `createPack` has its own place and its own
 * settings, and the pack is not changed by any of them.
 *
 * Handed back at once, still loading, and filled in when its manifest and the documents it offers
 * land. Until then `boxes` and `scenes` are empty.
 *
 * @category Assets & loading
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TLoadedPack = {
    readonly type: 'pack';
    /**
     * What it is cached under: the key given, or the folder.
     */
    key: string;
    /**
     * The pack's folder, always ending in `/`. Everything in it is found from here.
     */
    src: string;
    /**
     * How it is doing. A pack that failed reports `'error'` and places nothing.
     */
    status: TLoadStatus;
    /**
     * Its name, from its manifest. Empty until it lands.
     */
    name: string;
    /**
     * Its own version, from its manifest.
     */
    version: string;
    /**
     * What it offers, by name. Either list may be empty: a pack of assets offers neither.
     */
    exports: { boxes: string[]; scenes: string[] };
    /**
     * The documents of the boxes it offers, by name, with their paths already found in its folder.
     */
    boxes: Record<string, TSceneDoc>;
    /**
     * The documents of the scenes it offers, by name, the same way.
     */
    scenes: Record<string, TSceneDoc>;
    /**
     * The input actions its scripts read, with the bindings they came with.
     */
    actions: TActionMap;
};
