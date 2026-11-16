import type { TGeometry } from './types/t_geometry';

/**
 * A shape's corners as they went to the card, read again on this side: what `mergeGeometries` lays
 * out anew. `colors` and `uv2` are `null` for a shape that was given none.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TKeptCorners = {
    vertices: Float32Array;
    indices: Uint16Array | Uint32Array;
    colors: Uint8Array | null;
    uv2: Float32Array | null;
};

/**
 * How to have each shape's corners again, by shape. Not the corners themselves for a shape hook's:
 * its recipe is a handful of numbers and builds the same corners again whenever they are asked for,
 * so no shape carries a second copy of itself for a merge that may never come. A shape made by
 * `createGeometry` hands back what it last built, kept for that: a recipe is not there to build it
 * again from.
 */
const kept = new WeakMap<TGeometry, () => TKeptCorners | null>();

/**
 * Says how `geometry`'s corners are had again.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const keepCorners = (geometry: TGeometry, read: () => TKeptCorners | null): void => {
    kept.set(geometry, read);
};

/**
 * `geometry`'s corners again, or `null` for a shape that keeps no way to have them: a piece of a model
 * file, or one let go of.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const cornersOf = (geometry: TGeometry): TKeptCorners | null => kept.get(geometry)?.() ?? null;
