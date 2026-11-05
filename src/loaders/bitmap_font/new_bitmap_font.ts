import { markWatchable } from '../../store/record_version';
import { newTexture } from '../texture/new_texture';
import { hold } from '../asset_holds';
import type { TBitmapFont } from './types/t_bitmap_font';

/**
 * A font that has not loaded yet: known by its paths, with an empty texture waiting for the image.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const newBitmapFont = (src: string, atlas: string, key: string): TBitmapFont => {
    const font: TBitmapFont = markWatchable({
        type: 'bitmap-font',
        key,
        src,
        status: 'loading',
        texture: newTexture(atlas, `${key}:texture`),
        meta: null,
    });
    // Its own picture, held like any other, so what lets pictures go needs no rule of its own for it.
    hold(font.texture, font);
    return font;
};
