import type { TTilemap } from './types/t_tilemap';

const revisions = new WeakMap<TTilemap, number>();

/**
 * How many times a map's cells have changed since it loaded: what something built from them (the
 * map's colliders in a simulation) compares with what it last saw, to know it has to build again.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const tileRevisionOf = (map: TTilemap): number => revisions.get(map) ?? 0;

/**
 * Says a map's cells have changed. `setTile` and `markLayerChanged` say it.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const bumpTileRevision = (map: TTilemap): void => {
    revisions.set(map, tileRevisionOf(map) + 1);
};
