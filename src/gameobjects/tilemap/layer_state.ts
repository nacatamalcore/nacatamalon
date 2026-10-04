import type { IBuffer, TDrawTilemapLayer } from '../../render/interface';
import type { TTilemapLayer } from './types/t_tilemap';

/**
 * One batch of corners on the graphics card, and how many of them are being drawn.
 *
 * `capacity` is how many it was made for, which is **not** how many it draws. A rebuild that shrinks
 * (a brick broken) writes fewer and draws fewer; only one that grows past what it holds asks for
 * memory again. Without that split, every single tile changed would churn the graphics card.
 *
 * @category Tilemaps
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TTileMesh = {
    buffer: IBuffer | null;
    vertexCount: number;
    capacity: number;
};

/**
 * What a layer has on the graphics card, kept **beside** the layer and never inside it.
 *
 * A layer is a record, and a record is plain JSON with no methods and nothing a `JSON.stringify`
 * would choke on. These four fields are none of that: a buffer is a handle to memory on a device,
 * and `dirty` is a note the loop leaves itself between two frames. Holding them on the layer is what
 * made a layer the one drawable in this engine that could not be written down, which is the whole
 * reason a scene document could not be built on top of it.
 *
 * So it moves out, to the same arrangement a particle emitter's pool uses and for the same reason: a
 * side table keyed by the record. Forgetting to free it is then impossible to do by accident,
 * because there is exactly one door that lets go of it.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TTilemapLayerState = {
    /**
     * The two batches, in the order they are drawn: the still one first, so a cycling torch is drawn
     * over the floor it stands on. The renderer reads only this and never learns which is which.
     */
    meshes: TTileMesh[];
    /**
     * Cells showing a fixed picture. Built once, and again only when a tile changes.
     */
    still: TTileMesh;
    /**
     * Cells that cycle. Their corners are rewritten as the cycle turns.
     */
    moving: TTileMesh;
    /**
     * True when something changed and the corners have to be built again on the next frame.
     */
    dirty: boolean;
    /**
     * What the backend is handed in this layer's place, reused from one frame to the next.
     *
     * Something has to stand in front of a record that cannot hold what the card wants, and the
     * same trick an emitter uses works here: the corners are on this side of the boundary, the
     * stand-in points at them, and `render/` goes on never reaching back into the game. It is
     * filled in once a frame, so a level of ten layers allocates nothing to draw itself.
     */
    drawn: TDrawnLayer;
};

/**
 * The stand-in as the engine writes it: the backend's view of a layer, with the readonly taken off.
 */
export type TDrawnLayer = { -readonly [K in keyof TDrawTilemapLayer]: TDrawTilemapLayer[K] };

/**
 * Weak on purpose: a layer nobody holds any more takes its entry with it, so a map dropped without
 * being destroyed leaks a handle and not a whole table of them.
 */
const states = new WeakMap<TTilemapLayer, TTilemapLayerState>();

const emptyMesh = (): TTileMesh => ({ buffer: null, vertexCount: 0, capacity: 0 });

/**
 * This layer's graphics-card state, made the first time anything asks for it.
 *
 * Made on demand rather than when the layer is read out of its file, because a layer that is never
 * drawn (a map loaded to be asked about, a layer hidden from the first frame) should cost nothing.
 * A fresh one starts `dirty`, which is the truth: nothing has been built yet.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const openLayerState = (layer: TTilemapLayer): TTilemapLayerState => {
    const known = states.get(layer);
    if (known !== undefined) {
        return known;
    }

    const still = emptyMesh();
    const moving = emptyMesh();
    const meshes = [still, moving];
    const state: TTilemapLayerState = {
        meshes,
        still,
        moving,
        dirty: true,
        // Pointed at the same two batches for good: what changes from frame to frame is what is
        // inside them, never which ones they are.
        drawn: {
            type: 'tilemap',
            transform: layer.transform,
            meshes,
            texture: null,
            tint: layer.tint,
        },
    };
    states.set(layer, state);
    return state;
};

/**
 * This layer's state if it has any, and `undefined` if nothing has built it yet.
 *
 * What the drawing half asks, because a layer with no state has nothing on the card to draw and the
 * renderer has no business bringing one into existence.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const layerStateOf = (layer: TTilemapLayer): TTilemapLayerState | undefined => states.get(layer);
