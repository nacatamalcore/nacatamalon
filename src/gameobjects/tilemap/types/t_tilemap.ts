import type { TColor } from '../../../color';
import type { TLoadedAtlas, TLoadStatus, TTexture } from '../../../loaders';
import type { TTileDoc, TTileLayerOrder } from '../../../loaders/tilemap/types/t_tilemap_doc';
import type { TTransform2d } from '../../types/t_transform_2d';

/**
 * One layer of a map, and the thing the renderer actually draws.
 *
 * A layer and not the map, because the order things are drawn in is per drawable and a layer's whole
 * purpose is to sort on its own: the ground under the player, the treetops over them, both from one
 * map. Making the map one drawable would have meant teaching the sorter about an order inside an
 * order, when the one it has already does the job.
 *
 * Its cells are split across **two** batches. The still one holds every cell whose tile shows a
 * fixed picture, and is built once. The moving one holds the cells whose tile cycles, and only their
 * corners are rewritten when the cycle turns. That split is what keeps a map with water cheap: a few
 * dozen cells go up again four times a second while the several thousand still ones sit there.
 *
 * **Those two batches are not here.** They are handles to memory on a device, and this is a record:
 * plain data, and all of it writable to a file. They live in a side table instead, keyed by the
 * layer, which is the same arrangement a particle emitter's pool uses. See `layer_state.ts`.
 *
 * @category Tilemaps
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TTilemapLayer = {
    readonly type: 'tilemap';
    id: string;
    name: string;
    /**
     * The map this belongs to, so a layer on its own is still enough to find everything.
     */
    map: TTilemap;
    /**
     * Where the map's top-left corner sits: **the map's own placement**, by reference, not a copy.
     * Moving the map moves every layer, because they are all looking at the same object.
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
     * The sheet its cells take their pictures from: the map's, by reference.
     */
    texture: TTexture | null;
    /**
     * Multiplies the colour of the layer: the map's, by reference.
     */
    tint: TColor;
    /**
     * How the sheet is read. Left out, the game's own setting decides.
     */
    smooth?: boolean;
    /**
     * Whether this layer is drawn. Omitted is drawn.
     *
     * Per layer and not per map, for the same reason a layer is the drawable at all: "hide the
     * treetops" is the useful sentence, and hiding every layer is that sentence repeated.
     *
     * It keeps its corners on the graphics card, so showing it again costs nothing. Letting go of
     * them is what destroying the map does.
     */
    visible?: boolean;
    /**
     * The ids of its cells, row by row. `0` is empty.
     */
    data: number[];
    /**
     * Where it draws. Read as `zIndex` by the same sort every drawable goes through.
     */
    order: TTileLayerOrder;
    /**
     * Which number it sorts by. Worked out from `order` when the map loads, and kept on the layer
     * because that is the field the renderer reads for everything else too.
     */
    zIndex: number;
    /**
     * Set by `destroy` and never cleared.
     */
    destroyed: boolean;
    /**
     * An effect of its own, from `createMaterial`. Omitted is the built-in shader.
     *
     * Per layer and not per map, because that is the useful grain: a water layer ripples while the
     * ground under it does not. It takes the same hook a sprite's material takes, so one effect can
     * be written once and put on either.
     */
    material?: TSpriteMaterial;
    /**
     * This layer's own values for that material's knobs, laid over the material's own.
     */
    uniforms?: TUniformValues;
};

/**
 * A map: the sheet its numbers point into, how big its cells are, what the numbers mean, and its
 * layers.
 *
 * It comes back straight away, empty and `'loading'`, and fills itself in when the file and its sheet
 * arrive. Nothing has to be awaited, and `useLoader` counts it like any other asset.
 *
 * @category Tilemaps
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TTilemap = {
    readonly type: 'tilemapAsset';
    /**
     * Where the file is.
     */
    src: string;
    status: TLoadStatus;
    /**
     * Where the map's top-left corner sits. Shared by every layer: they sort apart, they do not move
     * apart.
     */
    transform: TTransform2d;
    /**
     * The sheet, loaded with the map. `null` until the file has said which one.
     */
    atlas: TLoadedAtlas | null;
    /**
     * How big a cell is, in pixels. `0` until it has loaded.
     */
    cell: number;
    /**
     * How many cells across and down. `0` until it has loaded.
     */
    width: number;
    height: number;
    /**
     * What each id means.
     */
    tiles: Record<number, TTileDoc>;
    /**
     * Its layers, in the order the file wrote them.
     */
    layers: TTilemapLayer[];
    /**
     * Multiplies the colour of every layer.
     */
    tint: TColor;
    /**
     * How the sheet is read. Left out, the game's own setting decides.
     */
    smooth?: boolean;
    /**
     * Where each cycling tile is in its run, by the name of the run.
     */
    clocks: Map<string, { elapsed: number; frame: number }>;
    /**
     * Set by `destroy` and never cleared.
     */
    destroyed: boolean;
};

/**
 * What `createTilemap` is asked for.
 *
 * @category Tilemaps
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TTilemapOptions = {
    /**
     * Where the `.tilemap` file is.
     */
    src: string;
    /**
     * What to cache it under, so two scenes share one map. Defaults to `src`.
     */
    key?: string;
    /**
     * Where the map's top-left corner sits. What is left out takes its default (scale 1, no turn).
     */
    transform?: Partial<TTransform2d>;
    /**
     * Multiplies the colour of every layer. Default white.
     */
    tint?: TColor;
    /**
     * Overrides the game's `smooth` for this map.
     */
    smooth?: boolean;
};

import type { TSpriteMaterial, TUniformValues } from '../../../materials';
