import type { TDrawSprite } from '../interface';

/**
 * How wide a sprite is drawn, before its scale: its own `width` if it has one, otherwise the part of
 * its texture it shows (one frame of a sheet, not the whole sheet), or `0` with no texture. A number
 * and not an object, for what asks it of every sprite every frame.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const spriteWidth = (sprite: TDrawSprite): number => sprite.width ?? (sprite.texture?.width ?? 0) * (sprite.uvScale?.x ?? 1);

/**
 * How tall a sprite is drawn, before its scale: see `spriteWidth`.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const spriteHeight = (sprite: TDrawSprite): number => sprite.height ?? (sprite.texture?.height ?? 0) * (sprite.uvScale?.y ?? 1);

/**
 * The size a sprite is drawn at, before its scale: its own `width`/`height` if it has them,
 * otherwise the part of its texture it shows (one frame of a sheet, not the whole sheet), or `0`
 * with no texture.
 *
 * One function for the renderer and for pointer hit testing, so "the size it is drawn at" and "the
 * size it is touched at" cannot drift apart. `spriteWidth` and `spriteHeight` are the same two
 * numbers one at a time.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const spriteSize = (sprite: TDrawSprite): { width: number; height: number } => ({
    width: spriteWidth(sprite),
    height: spriteHeight(sprite),
});
