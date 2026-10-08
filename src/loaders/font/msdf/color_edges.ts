import { CYAN, MAGENTA, WHITE, YELLOW, directionAt, splitInThirds } from './edges';
import type { TEdge } from './edges';

/**
 * How sharp a turn has to be to count as a corner: anything turning by more than about 3 radians'
 * sine, which is to say any turn a reader would see as a corner rather than a bend.
 */
const CROSS_THRESHOLD = Math.sin(3);

const isCorner = (ax: number, ay: number, bx: number, by: number): boolean => {
    const la = Math.hypot(ax, ay);
    const lb = Math.hypot(bx, by);
    if (la === 0 || lb === 0) {
        return false;
    }
    const dot = (ax * bx + ay * by) / (la * lb);
    const cross = (ax * by - ay * bx) / (la * lb);
    return dot <= 0 || Math.abs(cross) > CROSS_THRESHOLD;
};

/**
 * Moves a colour on to the next of the two-channel colours, never landing on `banned`. Deterministic:
 * the same glyph always gets the same colours, so an atlas made twice is the same atlas.
 */
const switchColor = (color: number, state: { seed: number }, banned = 0): number => {
    const combined = color & banned;
    if (combined === 1 || combined === 2 || combined === 4) {
        return combined ^ WHITE;
    }
    if (color === 0 || color === WHITE) {
        const start = [CYAN, MAGENTA, YELLOW][state.seed % 3]!;
        state.seed = Math.floor(state.seed / 3);
        return start;
    }
    const shifted = color << (1 + (state.seed & 1));
    state.seed >>= 1;
    return (shifted | (shifted >> 3)) & WHITE;
};

/**
 * Where among three equal parts the `position`-th of `count` edges falls: -1, 0 or 1.
 */
const trichotomy = (position: number, count: number): number =>
    Math.trunc(3 + (2.875 * position) / (count - 1) - 1.4375 + 0.5) - 3;

/**
 * Gives each edge of one loop the channels it counts in.
 *
 * The rule that makes a multi-channel distance field keep its corners: the two edges that meet at a
 * corner must not share all their channels. Then, near the corner, at least one channel measures
 * against each edge's straight continuation and the median of the three draws the corner square
 * instead of rounding it off. A loop with no corners (an "O") needs none of this and stays white.
 *
 * Returns the loop's edges, cut into more where a loop with a single corner has too few to colour.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const colorEdges = (edges: TEdge[]): TEdge[] => {
    const count = edges.length;
    if (count === 0) {
        return edges;
    }
    const corners: number[] = [];
    let [px, py] = directionAt(edges[count - 1]!, 1);
    edges.forEach((edge, i) => {
        const [sx, sy] = directionAt(edge, 0);
        if (isCorner(px, py, sx, sy)) {
            corners.push(i);
        }
        [px, py] = directionAt(edge, 1);
    });

    const state = { seed: 0 };
    if (corners.length === 0) {
        for (const edge of edges) edge.color = WHITE;
        return edges;
    }

    if (corners.length === 1) {
        // A teardrop: one corner, so the loop is coloured in three runs that meet only there.
        const first = switchColor(WHITE, state);
        const colors = [first, WHITE, switchColor(first, state)];
        const corner = corners[0]!;
        if (count >= 3) {
            for (let i = 0; i < count; i++) {
                edges[(corner + i) % count]!.color = colors[1 + trichotomy(i, count)]!;
            }
            return edges;
        }
        // Too few edges for three runs: cut them up, starting from the corner.
        const ordered = count === 1 ? [edges[0]!] : [edges[corner]!, edges[(corner + 1) % 2]!];
        const parts = ordered.flatMap(splitInThirds);
        if (parts.length === 3) {
            parts.forEach((part, i) => { part.color = colors[i]!; });
        } else {
            parts.forEach((part, i) => { part.color = colors[Math.floor(i / 2)]!; });
        }
        return parts;
    }

    // Several corners: every stretch between two corners gets one colour, a different one from its
    // neighbours, and the last stretch also differs from the first, which it meets at the start.
    let spline = 0;
    const start = corners[0]!;
    let color = switchColor(WHITE, state);
    const initial = color;
    for (let i = 0; i < count; i++) {
        const index = (start + i) % count;
        if (spline + 1 < corners.length && corners[spline + 1] === index) {
            spline++;
            color = switchColor(color, state, spline === corners.length - 1 ? initial : 0);
        }
        edges[index]!.color = color;
    }
    return edges;
};
