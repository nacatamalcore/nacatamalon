import { openLayerState } from '../../../gameobjects/tilemap/layer_state';
import type { TDrawable } from '../../../gameobjects/types';
import type { TTilemapLayer } from '../../../gameobjects/tilemap';
import { recordOf } from './view_walk';

/**
 * Each view copy's own stand-in, kept between frames.
 */
const copies = new WeakMap<object, object>();

/**
 * The stand-in a view's copy of a layer is drawn with: the layer's, field for field, refreshed every
 * frame so it holds the corners as they are now.
 */
const copyFor = <T extends object>(copy: object, shared: T): T => {
    let own = copies.get(copy) as T | undefined;
    if (own === undefined) {
        own = {} as T;
        copies.set(copy, own);
    }
    return Object.assign(own, shared);
};

/**
 * Puts each map layer's stand-in in the list in its place.
 *
 * A layer is a record: plain data, all of it writable to a file. Its corners are not, they are
 * handles to memory on a device, so they live in a side table beside the layer. That leaves the
 * backend needing something that holds both halves, and this is where the two are put together.
 *
 * Done here rather than by the backend reaching into the table, because `render/` imports **types**
 * from the game and never calls into it. Keeping that true is what lets a backend be read on its
 * own, and the emitters already work exactly this way.
 *
 * Run after the tree has been walked, so `worldTransform` is already on the layer and can be copied
 * across.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const stepSceneTilemaps = (drawables: TDrawable[], start: number): void => {
    for (let i = start; i < drawables.length; i++) {
        const layer = drawables[i];
        if (layer.type !== 'tilemap') {
            continue;
        }

        // A layer and its stand-in both answer to `type: 'tilemap'`, so one left in the list would
        // reach a backend pretending to be the other and be missing every field drawing reads. The
        // swap therefore happens first and on every path, exactly as it does for an emitter.
        // A view's copy of a layer shares the layer's corners on the card, and has a stand-in of its
        // own to carry where the view draws it.
        const record = recordOf(layer as TTilemapLayer);
        const shared = openLayerState(record).drawn;
        const drawn = record === layer ? shared : copyFor(layer, shared);
        drawables[i] = drawn as unknown as TDrawable;

        const source = layer as TTilemapLayer;
        drawn.transform = source.transform;
        drawn.worldTransform = source.worldTransform;
        drawn.texture = source.texture;
        drawn.tint = source.tint;
        drawn.smooth = source.smooth;
        drawn.material = source.material;
        drawn.uniforms = source.uniforms;
        const { map } = source;
        if (drawn.size === undefined || drawn.size.width !== map.width * map.cell || drawn.size.height !== map.height * map.cell) {
            drawn.size = { width: map.width * map.cell, height: map.height * map.cell };
        }
    }
};
