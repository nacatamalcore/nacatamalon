import { DETAIL_STRIDE, GEOMETRY_STRIDE } from '../types/t_geometry';

/**
 * Below this the picture is not stretched over the triangle at all, and it says nothing about which
 * way its across runs.
 */
const FLAT_UV = 1e-12;

/**
 * Some direction across a surface, for a corner whose picture says nothing: the axis furthest from
 * the way it faces, made square to it.
 */
const anyAcross = (nx: number, ny: number, nz: number): [number, number, number] => {
    const ax = Math.abs(nx);
    const ay = Math.abs(ny);
    const az = Math.abs(nz);
    // The world axis the facing leans on least, crossed with the facing.
    const [rx, ry, rz] = ax <= ay && ax <= az ? [1, 0, 0] : ay <= az ? [0, 1, 0] : [0, 0, 1];
    let tx = ny * rz - nz * ry;
    let ty = nz * rx - nx * rz;
    let tz = nx * ry - ny * rx;
    const length = Math.hypot(tx, ty, tz) || 1;
    tx /= length;
    ty /= length;
    tz /= length;
    return [tx, ty, tz];
};

/**
 * The detail run of a shape: for each corner, the way across its surface the picture runs (its
 * tangent, with which hand its other edge goes in the fourth number) and a second picture
 * coordinate.
 *
 * What the file had is kept. What it did not is worked out: the tangent from how the picture is
 * stretched over each triangle, gathered at every corner that triangle touches and made square to
 * the way the corner faces; the second coordinate as a copy of the first.
 *
 * **Why the fourth number.** A picture can be mirrored across a seam, and then its down runs the
 * other way to its across. The way down (the bitangent) is never stored: it is the facing crossed
 * with the tangent, times this one, which is how a shader gets it back for the price of one number.
 *
 * @param vertices The shape's corners, `GEOMETRY_STRIDE` numbers each (place, facing, picture).
 * @param indices Which corners make each triangle.
 * @param tangents The file's own tangents, four numbers a corner, or `null` to work them out.
 * @param uv2 The file's own second coordinates, two numbers a corner, or `null` to copy the first.
 * @returns `DETAIL_STRIDE` numbers a corner: tangent `x y z`, its hand, then `u v` of the second.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const computeDetail = (
    vertices: Float32Array,
    indices: Uint16Array | Uint32Array,
    tangents: Float32Array | null = null,
    uv2: Float32Array | null = null,
): Float32Array => {
    const count = Math.floor(vertices.length / GEOMETRY_STRIDE);
    const out = new Float32Array(count * DETAIL_STRIDE);

    // Gathered per corner: the way across (u) and the way down (v) every triangle it is in says.
    const across = tangents === null ? new Float32Array(count * 3) : null;
    const down = tangents === null ? new Float32Array(count * 3) : null;

    if (across !== null && down !== null) {
        for (let t = 0; t + 2 < indices.length; t += 3) {
            const a = indices[t];
            const b = indices[t + 1];
            const c = indices[t + 2];
            const pa = a * GEOMETRY_STRIDE;
            const pb = b * GEOMETRY_STRIDE;
            const pc = c * GEOMETRY_STRIDE;

            const e1x = vertices[pb] - vertices[pa];
            const e1y = vertices[pb + 1] - vertices[pa + 1];
            const e1z = vertices[pb + 2] - vertices[pa + 2];
            const e2x = vertices[pc] - vertices[pa];
            const e2y = vertices[pc + 1] - vertices[pa + 1];
            const e2z = vertices[pc + 2] - vertices[pa + 2];
            const du1 = vertices[pb + 6] - vertices[pa + 6];
            const dv1 = vertices[pb + 7] - vertices[pa + 7];
            const du2 = vertices[pc + 6] - vertices[pa + 6];
            const dv2 = vertices[pc + 7] - vertices[pa + 7];

            const det = du1 * dv2 - du2 * dv1;
            if (Math.abs(det) < FLAT_UV) {
                continue;
            }
            const r = 1 / det;
            const sx = (e1x * dv2 - e2x * dv1) * r;
            const sy = (e1y * dv2 - e2y * dv1) * r;
            const sz = (e1z * dv2 - e2z * dv1) * r;
            const tx = (e2x * du1 - e1x * du2) * r;
            const ty = (e2y * du1 - e1y * du2) * r;
            const tz = (e2z * du1 - e1z * du2) * r;

            for (const corner of [a, b, c]) {
                across[corner * 3] += sx;
                across[corner * 3 + 1] += sy;
                across[corner * 3 + 2] += sz;
                down[corner * 3] += tx;
                down[corner * 3 + 1] += ty;
                down[corner * 3 + 2] += tz;
            }
        }
    }

    for (let i = 0; i < count; i++) {
        const v = i * GEOMETRY_STRIDE;
        const o = i * DETAIL_STRIDE;
        const nx = vertices[v + 3];
        const ny = vertices[v + 4];
        const nz = vertices[v + 5];

        if (tangents !== null) {
            out[o] = tangents[i * 4] ?? 1;
            out[o + 1] = tangents[i * 4 + 1] ?? 0;
            out[o + 2] = tangents[i * 4 + 2] ?? 0;
            out[o + 3] = (tangents[i * 4 + 3] ?? 1) < 0 ? -1 : 1;
        } else {
            // Made square to the facing (Gram-Schmidt), so the two and the bitangent are a frame.
            const sx = across![i * 3];
            const sy = across![i * 3 + 1];
            const sz = across![i * 3 + 2];
            const along = nx * sx + ny * sy + nz * sz;
            let tx = sx - nx * along;
            let ty = sy - ny * along;
            let tz = sz - nz * along;
            const length = Math.hypot(tx, ty, tz);
            if (length < 1e-8) {
                [tx, ty, tz] = anyAcross(nx, ny, nz);
            } else {
                tx /= length;
                ty /= length;
                tz /= length;
            }
            // Which hand: whether facing × tangent points the way the picture's down does.
            const bx = ny * tz - nz * ty;
            const by = nz * tx - nx * tz;
            const bz = nx * ty - ny * tx;
            const hand = bx * down![i * 3] + by * down![i * 3 + 1] + bz * down![i * 3 + 2] < 0 ? -1 : 1;
            out[o] = tx;
            out[o + 1] = ty;
            out[o + 2] = tz;
            out[o + 3] = hand;
        }

        out[o + 4] = uv2 === null ? vertices[v + 6] : uv2[i * 2] ?? 0;
        out[o + 5] = uv2 === null ? vertices[v + 7] : uv2[i * 2 + 1] ?? 0;
    }

    return out;
};
