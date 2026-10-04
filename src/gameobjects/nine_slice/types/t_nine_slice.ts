import type { TColor } from '../../../color';
import type { TTexture } from '../../../loaders';
import type { TSpriteAtlas } from '../../../atlas';
import type { TSpriteMaterial, TUniformValues } from '../../../materials';
import type { TTransform2d } from '../../types/t_transform_2d';

/**
 * How the parts of a nine-slice between its corners fill the space they are given.
 *
 * - `'stretch'`: the part is drawn once, stretched to fit. The default, and what a plain panel wants.
 * - `'tile'`: the part is repeated at its own size from the corner onwards, and the last copy is cut
 *   where the space ends. For a frame with a pattern along it (rivets, a rope, bricks) that must not
 *   be deformed.
 * - `'tile-fit'`: repeated as many whole times as fit best, each copy stretched a little so none is
 *   cut. The pattern stays whole at the cost of being slightly wider or narrower than drawn.
 *
 * @category Game objects
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TNineSliceMode = 'stretch' | 'tile' | 'tile-fit';

/**
 * How wide each border of a nine-slice is, in pixels of its picture (of its frame, with a sheet).
 * Those borders are what is never stretched: the corners stay as drawn, and the edges only grow
 * along their length.
 *
 * @category Game objects
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TNineSliceBorders = { left: number; top: number; right: number; bottom: number };

/**
 * A picture cut into nine parts so it can be any size without deforming its corners, as
 * `createNineSlice` gives it back: the panels, buttons, dialogue boxes and health bars of a UI.
 * Plain data: change any field (`width` above all) and the next frame shows it.
 *
 * @category Game objects
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TNineSlice = {
    id: string;
    type: 'nine-slice';
    /**
     * Width in pixels, before scale. Change it and the corners stay as they are.
     */
    width: number;
    /**
     * Height in pixels, before scale.
     */
    height: number;
    /**
     * Where it is, how it is turned and how big. Scale stretches the whole of it, corners included.
     */
    transform: TTransform2d;
    /**
     * Where it ends up once everything above it has moved it, worked out once a frame while the tree
     * is walked. Left off when nothing above it has a placement of its own, which is the ordinary
     * case: then its own `transform` is already where it is.
     *
     * Set by the engine every frame and never authored or saved. Ask `worldOf` rather than reading
     * either field by hand.
     */
    worldTransform?: TTransform2d;
    /**
     * The picture it is cut from.
     */
    texture: TTexture;
    tint: TColor;
    /**
     * How wide each border is, in pixels of the picture.
     */
    slice: TNineSliceBorders;
    /**
     * How the edges and the middle fill their space, the same both ways or one per direction:
     * `{ x: 'tile', y: 'stretch' }` repeats along the width and stretches along the height.
     */
    mode: TNineSliceMode | { x: TNineSliceMode; y: TNineSliceMode };
    /**
     * The sheet its picture came from, if it came from one.
     */
    atlas?: TSpriteAtlas;
    /**
     * Which frame of `atlas` it is cut from. Change it and the next frame is cut from that one.
     */
    frame?: number;
    /**
     * Where the window into the texture starts, in 0-1. Wins over `atlas` and `frame`.
     */
    uvOffset?: { x: number; y: number };
    /**
     * How big that window is, in 0-1. Wins over `atlas` and `frame`.
     */
    uvScale?: { x: number; y: number };
    /**
     * Which point of it sits on its transform, in 0-1. Omitted is its middle, as for a sprite.
     */
    anchor?: { x: number; y: number };
    /**
     * Draw order within its scene, as for a sprite. All nine parts move as one.
     */
    zIndex?: number;
    /**
     * Crisp or blended when it does not land on whole pixels. Omitted, the game's `smooth` decides.
     */
    smooth?: boolean;
    /**
     * Whether it is drawn at all. Omitted is drawn.
     */
    visible?: boolean;
    /**
     * An effect of its own, from `createMaterial`, carried by every part. Omitted is the built-in shader.
     */
    material?: TSpriteMaterial;
    /**
     * Its own values for that material's knobs, laid over the material's own.
     */
    uniforms?: TUniformValues;
    /**
     * Set by `destroy` and never cleared.
     */
    destroyed: boolean;
};
