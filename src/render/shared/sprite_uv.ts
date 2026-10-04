import type { TDrawSprite } from '../interface';

/**
 * The window into the sheet a sprite shows, with its mirroring already folded in.
 *
 * Mirroring lives **here**, in the window, and not in the sprite's scale. That is the whole point:
 * a character turning to face the other way should look mirrored and stay exactly where it was. A
 * negative scale would move it whenever its anchor is not centred, and would take its touchable
 * area with it, so turning around would change what can be clicked.
 *
 * The arithmetic is the window read backwards: the start moves to what was the far edge, and the
 * width goes negative so it walks back towards it. A sprite showing one frame of a sheet mirrors
 * that frame and nothing around it, which is why this works on the window rather than on the image.
 *
 * One definition for both backends, like `spriteSize`: "which part of the picture, and which way
 * round" has to be one answer, or the same sprite would face two ways depending on who drew it.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const spriteUvWindow = (sprite: TDrawSprite): { offsetX: number; offsetY: number; scaleX: number; scaleY: number } => {
    const offsetX = sprite.uvOffset?.x ?? 0;
    const offsetY = sprite.uvOffset?.y ?? 0;
    const scaleX = sprite.uvScale?.x ?? 1;
    const scaleY = sprite.uvScale?.y ?? 1;

    return {
        offsetX: sprite.flipX === true ? offsetX + scaleX : offsetX,
        offsetY: sprite.flipY === true ? offsetY + scaleY : offsetY,
        scaleX: sprite.flipX === true ? -scaleX : scaleX,
        scaleY: sprite.flipY === true ? -scaleY : scaleY,
    };
};
