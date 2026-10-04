import { markWatchable } from '../../store/record_version';
import type { TLoadedPack } from './types/t_loaded_pack';

/**
 * The empty pack record, handed back the moment one is asked for.
 *
 * Nothing offered yet, and that is a working state: a `createPack` following it has nothing to build
 * and builds nothing, and does so the moment the pack lands.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const newPack = (src: string, key: string): TLoadedPack => markWatchable({
    type: 'pack',
    key,
    src,
    status: 'loading',
    name: '',
    version: '',
    exports: { boxes: [], scenes: [] },
    boxes: {},
    scenes: {},
    actions: [],
});
