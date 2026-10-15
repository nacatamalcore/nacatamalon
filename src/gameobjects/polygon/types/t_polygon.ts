import type { TColor } from '../../../color';
import type { TTexture } from '../../../loaders';
import type { TSpriteAtlas } from '../../../atlas';
import type { TTransform2d } from '../../types/t_transform_2d';

/**
 * A shape whose corners the game moves: a picture stretched over an outline that can change every
 * frame. A blob that squashes as it lands, a flag in the wind, a jelly, a rope drawn as a strip.
 *
 * Where a sprite is always a rectangle, this is whatever the corners say, and the picture goes with
 * them: each corner holds on to its own point of the picture, so pushing a corner out stretches the
 * picture under it. The corners are plain numbers on the record, changed like any other field, and
 * the next frame draws them.
 *
 * It is drawn from its middle out, a triangle for each side, so it suits any outline that can be
 * seen whole from its middle (a circle squashed any way, a star, a drop). An outline that folds back
 * on itself past its middle is drawn with the fold showing.
 *
 * @category Game objects
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TPolygon = {
    readonly type: 'polygon';
    id: string;
    /**
     * A name to find it by.
     */
    name?: string;
    /**
     * Where it is, turned and scaled. The corners are measured from here.
     */
    transform: TTransform2d;
    /**
     * Where it ends up once everything above it has moved it. Set by the engine every frame.
     */
    worldTransform?: TTransform2d;
    /**
     * The outline, corner after corner around it, measured from `transform`. Change them, or the
     * list, at any time.
     */
    points: Array<{ x: number; y: number }>;
    /**
     * Which point of the picture each corner holds, from `0, 0` (its top-left) to `1, 1`, one per
     * corner. Worked out from the first outline when it is made, so the picture fills it; when the
     * number of corners changes and these no longer match, they are worked out again from the
     * outline as it is then.
     */
    uvs: Array<{ x: number; y: number }>;
    /**
     * The picture, or `null` for a shape of a plain colour (its `tint`).
     */
    texture: TTexture | null;
    /**
     * A sheet, when the picture is one frame of it.
     */
    atlas?: TSpriteAtlas;
    /**
     * Which frame of `atlas`.
     */
    frame?: number;
    /**
     * Multiplies the colour of the picture, `a` as opacity. Its whole colour when it has no picture.
     */
    tint: TColor;
    /**
     * How the picture is read. Omitted, the game's own setting decides.
     */
    smooth?: boolean;
    /**
     * Draw order within the scene, as for any other drawing.
     */
    zIndex: number;
    /**
     * Whether it is drawn. Default `true`.
     */
    visible?: boolean;
    /**
     * How much it moves with the camera, as on a sprite.
     */
    parallax?: { x: number; y: number };
    destroyed: boolean;
};
