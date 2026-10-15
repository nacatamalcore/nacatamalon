import { spriteSize } from './sprite_size';
import type { TDrawSprite } from '../interface';

/**
 * How many times a repeated sprite lays its picture across itself, and where the pattern starts, in
 * pictures: what both backends hand their shader, so a pattern lands on the same pixels in each.
 *
 * `1, 1` and `0, 0` for a sprite that does not repeat, which the shader reads as "do not wrap".
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const spriteRepeat = (sprite: TDrawSprite): { tilesX: number; tilesY: number; shiftX: number; shiftY: number } => {
    if (sprite.repeat !== true || sprite.texture === null) {
        return { tilesX: 1, tilesY: 1, shiftX: 0, shiftY: 0 };
    }
    // The picture's size in pixels: the frame of a sheet, or the whole image.
    const pictureWidth = sprite.texture.width * Math.abs(sprite.uvScale?.x ?? 1);
    const pictureHeight = sprite.texture.height * Math.abs(sprite.uvScale?.y ?? 1);
    if (pictureWidth <= 0 || pictureHeight <= 0) {
        return { tilesX: 1, tilesY: 1, shiftX: 0, shiftY: 0 };
    }
    const size = spriteSize(sprite);
    return {
        tilesX: size.width / pictureWidth,
        tilesY: size.height / pictureHeight,
        shiftX: (sprite.repeatOffset?.x ?? 0) / pictureWidth,
        shiftY: (sprite.repeatOffset?.y ?? 0) / pictureHeight,
    };
};
