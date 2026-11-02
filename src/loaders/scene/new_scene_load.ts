import { markWatchable } from '../../store/record_version';
import type { TLoadedScene } from './types/t_loaded_scene';

/**
 * The empty scene record, handed back the moment one is asked for.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const newSceneLoad = (src: string, key: string): TLoadedScene => markWatchable({
    type: 'scene',
    key,
    src,
    status: 'loading',
    name: '',
});
