import { markWatchable } from '../../store/record_version';
import { newTexture } from '../texture/new_texture';
import type { TBitmapFont } from './types/t_bitmap_font';

/**
 * A font that has not loaded yet: known by its paths, with an empty texture waiting for the image.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const newBitmapFont = (src: string, atlas: string, key: string): TBitmapFont => markWatchable({
    type: 'bitmapFont',
    key,
    src,
    status: 'loading',
    texture: newTexture(atlas, `${key}:texture`),
    meta: null,
});
