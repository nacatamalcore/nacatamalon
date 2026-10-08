import { markWatchable } from '../../store/record_version';
import { newTexture } from '../texture/new_texture';
import { markMadeTexture } from '../texture/made_texture';
import type { TFont } from './types/t_font';

/**
 * How many pixels tall one em of a vector font's letters is kept when nothing else is asked for:
 * enough for most fonts at any size. A saved scene leaves a font's size out when it is this one.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const DEFAULT_FONT_ATLAS_SIZE = 48;

/**
 * A vector font that has not loaded yet: known by its path, with an empty texture waiting for its
 * letters. The texture is made in the game rather than loaded, so a saved scene never lists it.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const newFont = (src: string, key: string, size: number): TFont => {
    const texture = newTexture('', `${key}:atlas`);
    markMadeTexture(texture);
    return markWatchable({
        type: 'font',
        key,
        src,
        status: 'loading',
        size,
        texture,
        meta: null,
    });
};
