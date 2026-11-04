import type { TBox } from '../../box/types/t_box';
import type { TTilemap } from './types/t_tilemap';

/**
 * The first map made in each object. Weak, so an object that goes away takes its entry with it.
 */
const maps = new WeakMap<TBox, TTilemap>();

/**
 * The object each map is drawn by: the last one to make it, which is the one its layers were added
 * to. What places the map in the world, for the questions asked of it by a point.
 */
const holders = new WeakMap<TTilemap, TBox>();

/**
 * Remembers that `map` was made in `box`, unless the object already has one.
 *
 * @internal
 */
export const rememberTilemap = (box: TBox, map: TTilemap): void => {
    holders.set(map, box);
    if (!maps.has(box)) {
        maps.set(box, map);
    }
};

/**
 * The map an object carries, from the moment the scene is built, or `null` when it has none.
 *
 * A map from a scene file is drawn by its object, but its layers only join the object once the
 * file has arrived, so looking for them among what it draws finds nothing while the scene is being
 * built. This hands back the map itself straight away, still loading, the same one the object will
 * draw: a behaviour keeps it and waits for `status` to be `'ready'` before reading tiles from it.
 * When an object has more than one map, it is the first.
 *
 * @param box The object to ask about.
 * @returns Its map, or `null`.
 *
 * @example
 * ```ts
 * const world = (self: TGameObject) => {
 *     const map = getTilemap(self);
 *
 *     useUpdate(() => {
 *         if (map?.status === 'ready' && solidAt(map, 4, 12)) {
 *             // ...
 *         }
 *     });
 * };
 * ```
 *
 * @category Tilemaps
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const getTilemap = (box: TBox): TTilemap | null => maps.get(box) ?? null;

/**
 * The object a map is drawn by, or `null` for one made outside any.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const holderOfTilemap = (map: TTilemap): TBox | null => holders.get(map) ?? null;

/**
 * The maps made in code in each scene. They are in no cache, since a map with no file is only ever
 * this scene's, and what walks on a scene's maps has to find them all the same.
 */
const madeInCode = new WeakMap<TBox, Set<TTilemap>>();

/**
 * Notes a map made in code as one of `scene`'s, and gives back what takes it off again.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const noteMapInCode = (scene: TBox, map: TTilemap): (() => void) => {
    let maps = madeInCode.get(scene);
    if (maps === undefined) {
        maps = new Set();
        madeInCode.set(scene, maps);
    }
    const held = maps;
    held.add(map);
    return () => {
        held.delete(map);
    };
};

/**
 * The maps made in code in `scene`.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const mapsInCode = (scene: TBox): ReadonlySet<TTilemap> => madeInCode.get(scene) ?? NONE;

const NONE: ReadonlySet<TTilemap> = new Set();

/**
 * A map as a message names it: by its file, or as one made in code.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const nameOfMap = (map: TTilemap): string => (map.src === '' ? 'the map made in code' : `the map '${map.src}'`);
