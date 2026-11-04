import { rootOf } from '../../box/root_of';
import { isGone } from '../../game/loop/runHookUpdates';
import { holderOfTilemap, mapsInCode } from './get_tilemap';
import type { TBox } from '../../box/types/t_box';
import type { TRuntimeStore } from '../../store';
import type { TTilemap } from './types/t_tilemap';

/**
 * Every map a scene is drawing, loaded and still there: what a body walking in that scene walks on.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const sceneTilemaps = (store: TRuntimeStore, scene: TBox): TTilemap[] => {
    const found: TTilemap[] = [];
    const look = (map: TTilemap): void => {
        const holder = holderOfTilemap(map);
        if (map.status === 'ready' && !map.destroyed && holder !== null && !isGone(holder) && rootOf(holder) === scene) {
            found.push(map);
        }
    };
    store.get('assets').tilemaps.forEach(look);
    mapsInCode(scene).forEach(look);
    return found;
};
