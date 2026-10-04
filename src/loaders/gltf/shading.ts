import { COLOR_STRIDE, GEOMETRY_STRIDE, SKIN_STRIDE } from '../../geometry';

/**
 * How the surfaces of a loaded model are made to face.
 *
 * @category Assets & loading
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TShading = 'auto' | 'smooth' | 'flat';

/**
 * Triangle points wide enough for how many corners there are.
 */
const indicesFor = (count: number): Uint16Array | Uint32Array =>
    count > 65535 ? new Uint32Array(count) : new Uint16Array(count);

/**
 * Gives every triangle its own three corners and its own facing, so its edges come out hard.
 *
 * Un-indexing is what makes it work: faces in a file usually share corners, and a shared corner can
 * only face one way. Splitting them is what lets the two faces meeting at an edge disagree, which
 * is the whole look. It costs memory (a corner used by six faces becomes six), and that is the
 * trade being made on purpose.
 *
 * Anything else held one-per-corner has to be split the same way, which is why a deformed model's
 * bones and weights come along, and the colours painted on the corners: they live in runs of their
 * own and would otherwise still be numbered for the corners that were there before.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const toFlatShaded = (
    vertices: Float32Array,
    indices: Uint16Array | Uint32Array,
    skin?: Float32Array | null,
    colors?: Uint8Array | null,
): { vertices: Float32Array; indices: Uint16Array | Uint32Array; skin: Float32Array | null; colors: Uint8Array | null } => {
    const stride = GEOMETRY_STRIDE;
    const out = new Float32Array(indices.length * stride);
    const outIndices = indicesFor(indices.length);
    const outSkin = skin === undefined || skin === null ? null : new Float32Array(indices.length * SKIN_STRIDE);
    const outColors = colors === undefined || colors === null ? null : new Uint8Array(indices.length * COLOR_STRIDE);

    for (let t = 0; t + 2 < indices.length; t += 3) {
        for (let k = 0; k < 3; k++) {
            const from = indices[t + k] * stride;
            out.set(vertices.subarray(from, from + stride), (t + k) * stride);
            if (outSkin !== null && skin != null) {
                const fromSkin = indices[t + k] * SKIN_STRIDE;
                outSkin.set(skin.subarray(fromSkin, fromSkin + SKIN_STRIDE), (t + k) * SKIN_STRIDE);
            }
            if (outColors !== null && colors != null) {
                const fromColor = indices[t + k] * COLOR_STRIDE;
                outColors.set(colors.subarray(fromColor, fromColor + COLOR_STRIDE), (t + k) * COLOR_STRIDE);
            }
            outIndices[t + k] = t + k;
        }

        // The facing of the triangle, from the two edges leaving its first corner.
        const o = t * stride;
        const ax = out[o];
        const ay = out[o + 1];
        const az = out[o + 2];
        const e1x = out[o + stride] - ax;
        const e1y = out[o + stride + 1] - ay;
        const e1z = out[o + stride + 2] - az;
        const e2x = out[o + 2 * stride] - ax;
        const e2y = out[o + 2 * stride + 1] - ay;
        const e2z = out[o + 2 * stride + 2] - az;
        let nx = e1y * e2z - e1z * e2y;
        let ny = e1z * e2x - e1x * e2z;
        let nz = e1x * e2y - e1y * e2x;
        const length = Math.hypot(nx, ny, nz) || 1;
        nx /= length;
        ny /= length;
        nz /= length;

        for (let k = 0; k < 3; k++) {
            out[(t + k) * stride + 3] = nx;
            out[(t + k) * stride + 4] = ny;
            out[(t + k) * stride + 5] = nz;
        }
    }

    return { vertices: out, indices: outIndices, skin: outSkin, colors: outColors };
};

/**
 * Works out which way each corner faces by averaging the faces meeting there, for a surface that
 * shades smoothly across.
 *
 * **Corners are gathered by where they are, not by their number.** The same point of a model is
 * often written down several times, once per seam in its picture, and averaging by number would
 * leave each copy facing differently: a visible crease down a model that has none. The average is
 * weighted by how big each face is, which falls out of not shortening the face's own facing before
 * adding it, and is what keeps a large flat area from being bent by the slivers along its edge.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const computeNormals = (positions: Float32Array, indices: Uint16Array | Uint32Array): Float32Array => {
    const count = positions.length / 3;
    const normals = new Float32Array(count * 3);

    const keyOf = (i: number): string =>
        `${Math.round(positions[i * 3] * 1e4)},${Math.round(positions[i * 3 + 1] * 1e4)},${Math.round(positions[i * 3 + 2] * 1e4)}`;
    const gathered = new Map<string, [number, number, number]>();

    for (let t = 0; t + 2 < indices.length; t += 3) {
        const ia = indices[t];
        const ib = indices[t + 1];
        const ic = indices[t + 2];
        const ax = positions[ia * 3];
        const ay = positions[ia * 3 + 1];
        const az = positions[ia * 3 + 2];
        const e1x = positions[ib * 3] - ax;
        const e1y = positions[ib * 3 + 1] - ay;
        const e1z = positions[ib * 3 + 2] - az;
        const e2x = positions[ic * 3] - ax;
        const e2y = positions[ic * 3 + 1] - ay;
        const e2z = positions[ic * 3 + 2] - az;
        const nx = e1y * e2z - e1z * e2y;
        const ny = e1z * e2x - e1x * e2z;
        const nz = e1x * e2y - e1y * e2x;

        for (const vertex of [ia, ib, ic]) {
            const key = keyOf(vertex);
            const bucket = gathered.get(key) ?? [0, 0, 0];
            bucket[0] += nx;
            bucket[1] += ny;
            bucket[2] += nz;
            gathered.set(key, bucket);
        }
    }

    for (let i = 0; i < count; i++) {
        const [sx, sy, sz] = gathered.get(keyOf(i)) ?? [0, 0, 1];
        const length = Math.hypot(sx, sy, sz) || 1;
        normals[i * 3] = sx / length;
        normals[i * 3 + 1] = sy / length;
        normals[i * 3 + 2] = sz / length;
    }

    return normals;
};
