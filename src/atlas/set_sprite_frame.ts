import type { TSprite } from '../gameobjects/sprite/types/t_sprite';
import { atlasFrame } from './atlas_frame';

/**
 * Shows another frame of the sheet the sprite came from.
 *
 * For a picture that changes without running: a chest that is open, a tile that is broken, a
 * character facing another way. What moves through frames by itself is `useSpriteAnimation`,
 * which is this called once per frame.
 *
 * The one way to change frames, because what a sprite really carries is the window into its
 * image: setting a frame number on the record would be a second truth that nothing reads.
 *
 * Moves the sprite to its sheet's image too, so putting another sheet on a sprite and asking for
 * a frame is all it takes to swap what it shows: walking to attacking, in two lines.
 *
 * Does nothing to a sprite that came from no sheet, rather than throwing: asking a plain sprite
 * to show frame 3 is a mistake worth ignoring, not worth stopping a game for.
 *
 * @example
 * ```ts
 * declare const coins: TSpriteAtlas;
 *
 * const coin = createSprite({ atlas: coins, frame: 0, transform: { x: 40, y: 40 } });
 * setSpriteFrame(coin, 4);
 * ```
 *
 * @param sprite - A sprite made with an `atlas`.
 * @param index - Which frame of that sheet to show, counting from 0.
 *
 * @category Assets & loading
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const setSpriteFrame = (sprite: TSprite, index: number): void => {
    // No sheet, or one from a file whose image has not arrived: there is nothing to point at
    // yet. A sheet loaded from a file fills its grid in when it lands, and whoever created the
    // sprite is already waiting for that.
    if (sprite.atlas === undefined || sprite.atlas.frames === 0) {
        return;
    }

    const frame = atlasFrame(sprite.atlas, index);

    // The image as well as the window. They are two fields and a sheet owns both, so a sprite
    // moved to another sheet would otherwise keep drawing the old picture through the new
    // window: the same character in the same poses, silently never attacking.
    sprite.texture = sprite.atlas.texture;
    sprite.uvOffset = frame.uvOffset;
    sprite.uvScale = frame.uvScale;
    sprite.frame = index;
};
