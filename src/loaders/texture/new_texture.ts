import { markWatchable } from '../../store/record_version';
import type { TTexture } from './types/t_texture';

/**
 * A texture record that has not loaded yet: no size, no upload, `'loading'`.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const newTexture = (src: string, key: string): TTexture => markWatchable({
    type: 'texture',
    key,
    src,
    width: 0,
    height: 0,
    status: 'loading',
    gpu: null,
});
