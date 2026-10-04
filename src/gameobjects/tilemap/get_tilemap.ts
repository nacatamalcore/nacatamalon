import type { TBox } from '../../box/types/t_box';
import type { TTilemap } from './types/t_tilemap';

/**
 * The first map made in each object. Weak, so an object that goes away takes its entry with it.
 */
const maps = new WeakMap<TBox, TTilemap>();

/**
 * Remembers that `map` was made in `box`, unless the object already has one.
 *
 * @internal
 */
export const rememberTilemap = (box: TBox, map: TTilemap): void => {
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
