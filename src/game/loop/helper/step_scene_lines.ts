import { computeModelMatrix } from '../../../render/shared/compute_mvp_3d';
import { LINE_VERTEX_FLOATS } from '../../../render/shared/line_vertex';
import { linesStateOf } from '../../../gameobjects/lines/lines_state';
import * as mat from '../../../math/mat4';
import type { TDrawable } from '../../../gameobjects/types';
import type { TDrawLines } from '../../../render/interface';
import type { TLines } from '../../../gameobjects/lines/types/t_lines';

/**
 * Each set's stand-in, reused from one frame to the next, with the run of corners it owns.
 */
const stand = new WeakMap<TLines, { -readonly [K in keyof TDrawLines]: TDrawLines[K] }>();

/**
 * Where a set is when nothing above it has a placement: its own, built here. Scratch.
 */
const ownMatrix = mat.create();

/**
 * Stands in for a set with nothing written yet.
 */
const EMPTY = new Float32Array(0);

/**
 * Puts every set of lines in this stretch of the list in the world, and leaves it ready to draw.
 *
 * **Placed here, on the processor, and not by the card**, for the same reason particles in space are:
 * then the card only needs the scene's camera, one block for every set in it, instead of a placement
 * of its own per set. The sets are small (a gizmo is six corners, a grid a few hundred) and moving
 * them costs less than the extra block would.
 *
 * After the walk, because a set follows its object and where the object ended up is only known once
 * every placement above it has been composed.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const stepSceneLines = (drawables: TDrawable[], start: number): void => {
    for (let i = start; i < drawables.length; i++) {
        const lines = drawables[i];
        if (lines.type !== 'lines') {
            continue;
        }

        // Put in place first and on every path, for the reason the particles give: a record and its
        // stand-in answer to the same `type`, and a record reaching a backend has none of the
        // fields drawing reads.
        let drawn = stand.get(lines);
        if (drawn === undefined) {
            drawn = { type: 'lines', vertices: EMPTY, count: 0 };
            stand.set(lines, drawn);
        }
        drawn.count = 0;
        drawables[i] = drawn as unknown as TDrawable;

        const state = linesStateOf(lines);
        // A hidden set never gets this far: the walk leaves out what is not drawn.
        if (state.count === 0) {
            continue;
        }

        const floats = state.count * LINE_VERTEX_FLOATS;
        if (drawn.vertices.length < floats) {
            drawn.vertices = new Float32Array(state.local.length);
        }

        const m = lines.worldMatrix ?? computeModelMatrix(lines.transform, ownMatrix);
        const from = state.local;
        const to = drawn.vertices;
        for (let o = 0; o < floats; o += LINE_VERTEX_FLOATS) {
            const x = from[o];
            const y = from[o + 1];
            const z = from[o + 2];
            to[o] = m[0] * x + m[4] * y + m[8] * z + m[12];
            to[o + 1] = m[1] * x + m[5] * y + m[9] * z + m[13];
            to[o + 2] = m[2] * x + m[6] * y + m[10] * z + m[14];
            to[o + 3] = from[o + 3];
            to[o + 4] = from[o + 4];
            to[o + 5] = from[o + 5];
            to[o + 6] = from[o + 6];
        }
        drawn.count = state.count;
    }
};
