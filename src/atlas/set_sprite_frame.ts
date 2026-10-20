import type { TSprite } from '../gameobjects/sprite/types/t_sprite';
import { atlasFrame } from './atlas_frame';
import type { TSpriteAtlas } from './types/t_sprite_atlas';

/**
 * Points a sprite at frame `index` of `atlas`: its sheet's image, through that frame's window.
 *
 * The image as well as the window. They are two fields and a sheet owns both, so a sprite moved to
 * another sheet would otherwise keep drawing the old picture through the new window: the same
 * character in the same poses, silently never attacking.
 *
 * Does nothing while there is nothing to point at: no sheet, or one from a file whose image has not
 * arrived. A sheet loaded from a file fills its grid in when it lands, and whoever created the
 * sprite is already waiting for that.
 *
 * @internal
 */
export const showFrame = (sprite: TSprite, atlas: TSpriteAtlas | undefined, index: number): void => {
    if (atlas === undefined || atlas.frames === 0) {
        return;
    }
    const frame = atlasFrame(atlas, index);
    sprite.texture = atlas.texture;
    sprite.uvOffset = frame.uvOffset;
    sprite.uvScale = frame.uvScale;
};

/**
 * Shows another frame of the sheet the sprite came from.
 *
 * For a picture that changes without running: a chest that is open, a tile that is broken, a
 * character facing another way. What moves through frames by itself is `useSpriteAnimation`,
 * which is this called once per frame.
 *
 * The same as `sprite.frame = index`: a sprite made with `createSprite` shows the frame its `frame`
 * says, and the sheet its `atlas` says, from the moment either is changed. This is that, written as
 * a call, for a sprite that may not have come from `createSprite`.
 *
 * Putting another sheet on a sprite and asking for a frame is all it takes to swap what it shows:
 * walking to attacking, in two lines.
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
 * coin.frame = 4; // the same
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
    if (sprite.atlas === undefined) {
        return;
    }
    // Shown here as well as by the field: a sprite made by hand, not by `createSprite`, has a plain
    // field that shows nothing by itself.
    showFrame(sprite, sprite.atlas, index);
    sprite.frame = index;
};
