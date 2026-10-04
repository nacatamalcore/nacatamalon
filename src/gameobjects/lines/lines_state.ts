import { LINE_VERTEX_FLOATS } from '../../render/shared/line_vertex';
import type { TLines } from './types/t_lines';

/**
 * The corners of one set of lines, measured from its own placement, and how many of them there are.
 *
 * The run only ever grows: a helper rewritten every frame with one more segment must not cost a new
 * array every frame. What is past `count` is left over from a longer frame and never read.
 */
type TLinesState = { local: Float32Array; count: number };

/**
 * Every set's corners, kept beside its record rather than in it: a record is plain data, and this
 * is not. Weak, so a set that is gone takes its corners with it.
 */
const states = new WeakMap<TLines, TLinesState>();

/**
 * The corners of `lines`, as they were last written. Empty for a set nobody has written yet.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const linesStateOf = (lines: TLines): TLinesState => {
    let state = states.get(lines);
    if (state === undefined) {
        state = { local: new Float32Array(0), count: 0 };
        states.set(lines, state);
    }
    return state;
};

/**
 * Replaces the corners of `lines` with `vertices`: `LINE_VERTEX_FLOATS` numbers each, two corners to
 * a line.
 *
 * Copied in, so the caller is free to reuse its own array for the next frame. A run that does not
 * divide into whole lines is refused, because the last corner would be joined to nothing and the
 * card would quietly drop it.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const writeLines = (lines: TLines, vertices: Float32Array): void => {
    if (vertices.length % (LINE_VERTEX_FLOATS * 2) !== 0) {
        throw new Error(
            `[NacatamalOn] useHelperLines: ${vertices.length} numbers is not a whole number of lines. ` +
            `Each corner takes ${LINE_VERTEX_FLOATS} (x, y, z, r, g, b, a) and each line two corners.`,
        );
    }
    const state = linesStateOf(lines);
    if (vertices.length > state.local.length) {
        let size = Math.max(state.local.length, LINE_VERTEX_FLOATS * 2);
        while (size < vertices.length) {
            size *= 2;
        }
        state.local = new Float32Array(size);
    }
    state.local.set(vertices);
    state.count = vertices.length / LINE_VERTEX_FLOATS;
};
