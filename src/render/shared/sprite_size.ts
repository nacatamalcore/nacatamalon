import type { TDrawSprite } from '../interface';

/**
 * The size a sprite is drawn at, before its scale: its own `width`/`height` if it has them,
 * otherwise the part of its texture it shows (one frame of a sheet, not the whole sheet), or `0`
 * with no texture.
 *
 * One function for the renderer and for pointer hit testing, so "the size it is drawn at" and "the
 * size it is touched at" cannot drift apart.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const spriteSize = (sprite: TDrawSprite): { width: number; height: number } => ({
    width: sprite.width ?? (sprite.texture?.width ?? 0) * (sprite.uvScale?.x ?? 1),
    height: sprite.height ?? (sprite.texture?.height ?? 0) * (sprite.uvScale?.y ?? 1),
});
