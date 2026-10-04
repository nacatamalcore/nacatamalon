import type { TAtlasFrame, TSpriteAtlas } from './types/t_sprite_atlas';

/**
 * Where frame `index` sits in its sheet, as the window a sprite shows.
 *
 * Numbered from 0, left to right and then down. Asking for one that is not there throws rather
 * than showing a neighbour: a frame number is always deliberate, and an animation quietly playing
 * the wrong picture is the kind of bug that survives review.
 *
 * The arithmetic behind a sheet, used by `createSprite` and `setSpriteFrame`. A game says which
 * frame it wants and never has to work out where it is.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const atlasFrame = (atlas: TSpriteAtlas, index: number): TAtlasFrame => {
    if (!Number.isInteger(index) || index < 0 || index >= atlas.frames) {
        throw new Error(`[NacatamalOn] atlasFrame: this sheet has frames 0 to ${atlas.frames - 1}, asked for ${index}.`);
    }
    if (atlas.rects !== undefined) {
        return atlas.rects[index];
    }

    const column = index % atlas.columns;
    const row = Math.floor(index / atlas.columns);

    return {
        uvOffset: { x: column / atlas.columns, y: row / atlas.rows },
        uvScale: { x: 1 / atlas.columns, y: 1 / atlas.rows },
    };
};
