// everyframe
import { isTransparentMesh } from './is_transparent_mesh';
import type { TDrawItem } from '../interface';
import type { TDrawStencil } from '../interface/draw/t_draw_stencil';
import type { TDrawFilterLayer } from '../interface/draw/t_draw_filter_layer';

/** Filled again for each pass that has a filter laid with depth, never made again. */
const after: number[] = [];

/**
 * Where what the effects of a filter laid with depth draw round its models (its halo) is laid in a
 * pass: after which entry. Its own place, or, when solid models come straight after it, after the
 * last of them. The rest of the layer, the models themselves and what has no depth near it, is always
 * laid at its own place.
 *
 * **Why the halo moves.** It is tested against the depth there is, and writes none, so as not to hide
 * what is behind something faint. A solid model drawn after it would be drawn over it even when it is
 * behind, and the halo would stop at its edge. Laid after them, it is laid over them all, and the
 * depth it is tested against is all there.
 *
 * It moves only along a run of solid models and lines, and of other layers laid with depth, next to
 * each other in the list: not past a sprite, a map, a see-through model, an emitter, or anything that
 * writes a mask, so what is drawn over it in its own place still is. Scenes share the depth, so a run
 * may go on into the next scene's models. A halo moved past another layer laid with depth is laid
 * over what that one has without depth (a 2D thing inside it), the one thing it now covers out of
 * the list's order: two filtered models next to each other in the list is the common case, and each
 * halo still meets the other model by depth.
 *
 * `laidWithDepth` says whether a layer's depth was kept this frame: only one that was moves, or
 * lets a run go on through it.
 *
 * @returns For each entry, the entry after which its halo is laid (itself when it is not moved), or
 * `null` when nothing in the pass moves. Read before the next pass asks: the same array is filled
 * again.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const deepLayerOrder = (
    drawables: readonly TDrawItem[],
    stencil: readonly TDrawStencil[] | null,
    laidWithDepth: (layer: TDrawFilterLayer) => boolean,
): readonly number[] | null => {
    let moved = false;
    after.length = drawables.length;
    // From the end: the last entry of the run of solid models this one is in, or -1 outside one.
    let last = -1;
    for (let i = drawables.length - 1; i >= 0; i--) {
        const item = drawables[i]!;
        after[i] = i;
        const writes = stencil?.[i]?.write;
        if (writes !== undefined && writes !== 'none') {
            last = -1;
            continue;
        }
        if (item.type === 'filter-layer' && item.depth === true && laidWithDepth(item)) {
            if (last > i) {
                after[i] = last;
                moved = true;
            }
            continue;
        }
        if ((item.type === 'mesh' && !isTransparentMesh(item)) || item.type === 'lines') {
            if (last < 0) {
                last = i;
            }
            continue;
        }
        last = -1;
    }
    return moved ? after : null;
};
