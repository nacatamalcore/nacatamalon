import { markWatchable } from '../../store/record_version';
import { getColor } from '../../color';
import type { TTilemap } from '../../gameobjects/tilemap/types/t_tilemap';

/**
 * A map that has not loaded yet: no cells, no sheet, `'loading'`.
 *
 * Its placement is made here and not when the layers arrive, and that is load-bearing rather than
 * tidy: a map is the only thing that fills itself in **after** the scene has been built, and whoever
 * moves it may already be holding this object. A placement must never wait on a fetch.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const newTilemap = (src: string): TTilemap => markWatchable({
    type: 'tilemapAsset',
    src,
    status: 'loading',
    transform: { x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1 },
    atlas: null,
    cell: 0,
    width: 0,
    height: 0,
    tiles: {},
    layers: [],
    tint: getColor('white'),
    clocks: new Map(),
    destroyed: false,
});
