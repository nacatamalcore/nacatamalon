import { markWatchable } from '../../store/record_version';
import type { TGltfModel } from './types/t_gltf_model';

/**
 * A model record that has not loaded yet: no pieces, `'loading'`.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const newGltfModel = (src: string, key: string): TGltfModel => markWatchable({
    type: 'gltf',
    key,
    src,
    status: 'loading',
    parts: [],
    skeletons: [],
    clips: {},
});
