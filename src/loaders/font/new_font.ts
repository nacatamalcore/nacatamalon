import { markWatchable } from '../../store/record_version';
import { newTexture } from '../texture/new_texture';
import type { TFont } from './types/t_font';

/**
 * A font that has not loaded yet: known by its paths, with an empty texture waiting for the image.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const newFont = (src: string, atlas: string, key: string): TFont => markWatchable({
    type: 'font',
    key,
    src,
    status: 'loading',
    texture: newTexture(atlas, `${key}:texture`),
    meta: null,
});
