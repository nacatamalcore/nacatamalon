import { getColor } from '../../color';
import { LINE_VERTEX_FLOATS } from '../../render/shared/line_vertex';
import type { TColorOption } from '../../color';
import type { TLines } from './types/t_lines';

/**
 * One line, said as where it starts and ends and its colour: what `setLines` takes when there are a
 * few, and a `Float32Array` when there are thousands.
 *
 * @category Debug
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TLine = {
    /**
     * Where it starts, measured from where the lines are placed.
     */
    from: { x: number; y: number; z: number };
    /**
     * Where it ends.
     */
    to: { x: number; y: number; z: number };
    /**
     * Its colour, as text (`'#ffcc00'`) or a colour. White if left out.
     */
    color?: TColorOption;
};

const WHITE = { r: 1, g: 1, b: 1, a: 1 };

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
 * Replaces the corners of `lines` with `vertices`: `RENDER.LINE_VERTEX_FLOATS` numbers each, two corners to
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
export const writeLines = (lines: TLines, vertices: Float32Array, caller = 'setLines'): void => {
    if (vertices.length % (LINE_VERTEX_FLOATS * 2) !== 0) {
        throw new Error(
            `[NacatamalOn] ${caller}: ${vertices.length} numbers is not a whole number of lines. ` +
            `Each corner takes ${LINE_VERTEX_FLOATS} (x, y, z, r, g, b, a) and each line two corners.`,
        );
    }
    const state = roomFor(lines, vertices.length);
    state.local.set(vertices);
    state.count = vertices.length / LINE_VERTEX_FLOATS;
};

/**
 * Replaces the corners of `lines` with those of `list`, a line at a time, into the same run the
 * numbers go to, so a few lines rewritten every frame cost no new run of numbers either.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const writeLineList = (lines: TLines, list: readonly TLine[]): void => {
    const state = roomFor(lines, list.length * LINE_VERTEX_FLOATS * 2);
    const out = state.local;
    let at = 0;
    for (const line of list) {
        const color = line.color === undefined ? WHITE : getColor(line.color);
        at = writeCorner(out, at, line.from, color);
        at = writeCorner(out, at, line.to, color);
    }
    state.count = list.length * 2;
};

/**
 * Writes one corner at `at` and says where the next goes.
 */
const writeCorner = (out: Float32Array, at: number, point: TLine['from'], color: { r: number; g: number; b: number; a: number }): number => {
    out[at] = point.x;
    out[at + 1] = point.y;
    out[at + 2] = point.z;
    out[at + 3] = color.r;
    out[at + 4] = color.g;
    out[at + 5] = color.b;
    out[at + 6] = color.a;
    return at + LINE_VERTEX_FLOATS;
};

/**
 * The state of `lines`, with room for `floats` numbers. It only grows, doubling, so a set that
 * gains a line a frame does not cost a new array each frame.
 */
const roomFor = (lines: TLines, floats: number): TLinesState => {
    const state = linesStateOf(lines);
    if (floats > state.local.length) {
        let size = Math.max(state.local.length, LINE_VERTEX_FLOATS * 2);
        while (size < floats) {
            size *= 2;
        }
        state.local = new Float32Array(size);
    }
    return state;
};
