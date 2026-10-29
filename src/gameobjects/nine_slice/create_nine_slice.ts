import { getColor } from '../../color';
import { trackDrawableOwner } from '../../box';
import { getActiveBox, getActiveGame } from '../../store';
import { createRecord } from '../create_record';
import { listen } from '../../events/listen';
import { textureByKey } from '../../loaders/texture/texture_by_key';
import type { TTexture } from '../../loaders';
import type { TNineSlice } from './types/t_nine_slice';
import type { TNineSliceOptions } from './types/t_nine_slice_options';
import { outsideSceneBody } from '../../utils/outside_scene_body';

/**
 * Finds the picture the options ask for: an explicit texture wins, then a sheet's, then a key looked
 * up in this game's cache. Unlike a sprite, a nine-slice without a picture has nothing to cut, so
 * asking for none is a mistake and says so.
 */
const resolveTexture = (options: TNineSliceOptions): TTexture => {
    if (options.texture !== undefined) {
        return typeof options.texture === 'string' ? textureByKey('createNineSlice', options.texture) : options.texture;
    }
    if (options.atlas !== undefined) {
        return options.atlas.texture;
    }
    if (options.key === undefined) {
        throw new Error('[NacatamalOn] createNineSlice: it needs a picture to cut. Give it a texture (or the key it was loaded under) or an atlas.');
    }
    return textureByKey('createNineSlice', options.key);
};

/**
 * Puts a picture in the scene that can be any size without deforming: a panel, a button, a dialogue
 * box, a health bar.
 *
 * The picture is cut into nine parts by four borders (`slice`), measured in its own pixels. The
 * corners are drawn as they are, the top and bottom edges only grow sideways, the left and right
 * edges only grow downwards, and the middle fills the rest. So a 24x24 frame drawn at 300x80 keeps
 * its corners crisp, which stretching it as a sprite would not.
 *
 * - `mode` decides how the edges and the middle fill their space: stretched (the default), repeated
 *   and cut at the end (`'tile'`), or repeated a whole number of times (`'tile-fit'`). Repeating
 *   draws one sprite per copy, so a small pattern over a large panel is many sprites.
 * - Drawn smaller than its borders, the corners shrink in proportion instead of overlapping.
 * - `transform.scaleX`/`scaleY` stretch the whole of it, corners included. To make it bigger and
 *   keep the corners, change `width` and `height`.
 *
 * It is placed by its anchor, its middle unless you say otherwise, like a sprite, and takes the same
 * pointer events (`onClick`, `onPointerOver`...), which fire anywhere inside it.
 *
 * @example
 * ```ts
 * export const Menu: TSceneFn = () => {
 *     useLoadTexture({ src: '/assets/ui/panel.png', key: 'panel' });
 *     const panel = createNineSlice({
 *         key: 'panel',
 *         slice: 8,
 *         width: 200,
 *         height: 64,
 *         transform: { x: 160, y: 120 },
 *         onClick: () => { panel.width += 16; },
 *     });
 *
 *     return createScene();
 * };
 * ```
 *
 * @param options - Its picture, borders, size, place and look: see {@link TNineSliceOptions}.
 * @returns The nine-slice. Change its fields to resize or move it; `destroy(panel)` removes it.
 *
 * @category Game objects
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const createNineSlice = (options: TNineSliceOptions): TNineSlice => {
    // Checked before the picture is looked up: resolving a `key` needs the active game, and outside a
    // scene body the honest error is this one.
    const box = getActiveBox();
    const store = getActiveGame();
    if (!box || !store) {
        throw outsideSceneBody('createNineSlice');
    }

    const { slice } = options;
    const nineSlice = createRecord('nine-slice', {
        width: options.width,
        height: options.height,
        transform: { x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1, ...options.transform },
        texture: resolveTexture(options),
        tint: getColor(options.tint ?? 'white'),
        // Copied, so the object handed in stays the caller's.
        slice: typeof slice === 'number'
            ? { left: slice, top: slice, right: slice, bottom: slice }
            : { left: slice.left, top: slice.top, right: slice.right, bottom: slice.bottom },
        mode: typeof options.mode === 'object' ? { x: options.mode.x, y: options.mode.y } : options.mode ?? 'stretch',
        atlas: options.atlas,
        // The frame only means something with a sheet.
        frame: options.atlas !== undefined ? options.frame ?? 0 : undefined,
        uvOffset: options.uvOffset,
        uvScale: options.uvScale,
        anchor: options.anchor,
        ...(options.pivot !== undefined ? { pivot: options.pivot } : {}),
        zIndex: options.zIndex,
        smooth: options.smooth,
        visible: options.visible,
        material: options.material,
        uniforms: options.uniforms,
        ...(options.parallax !== undefined ? { parallax: { x: options.parallax.x, y: options.parallax.y } } : {}),
        ...(options.blend !== undefined ? { blend: options.blend } : {}),
        destroyed: false,
    });
    if (options.tags !== undefined && options.tags.length > 0) Object.assign(nineSlice, { tags: [...options.tags] });

    box.drawables.push(nineSlice);
    trackDrawableOwner(nineSlice, box, store);

    // Its events stay out of the record, as a sprite's do.
    listen(nineSlice, options);

    return nineSlice;
};
