import { markWatchable } from '../../store/record_version';
import type { TLoadedPixels } from './types/t_loaded_pixels';

/**
 * A picture file to be loaded as pixels, still loading.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const newLoadedPixels = (src: string, key: string): TLoadedPixels => markWatchable({
    type: 'loaded-pixels',
    key,
    src,
    status: 'loading',
    pixels: null,
});
