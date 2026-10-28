/**
 * One corner of a map's cell, as both cards read it: where it is inside the map (2), which point of
 * the sheet it shows (2), and the window of the sheet its cell may read from (4: left, top, right,
 * bottom). The window is the cell's own piece, half a texel in from each edge.
 *
 * Shared because the mesh is written in one place and read by two cards: a stride written twice is
 * two chances for one of them to read every corner shifted.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const TILE_CORNER_FLOATS = 8;

/**
 * {@link TILE_CORNER_FLOATS} in bytes.
 *
 * @internal
 */
export const TILE_CORNER_BYTES = TILE_CORNER_FLOATS * 4;
