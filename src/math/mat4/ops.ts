import { mat4, quat as wgpuQuat } from 'wgpu-matrix';
import type { Mat4 } from './index';
import type { TQuat } from '../quat';

/**
 * `dst` is where the answer goes when the caller has somewhere to put it.
 *
 * It exists because the 3D path runs once per model per frame, and a matrix made there is rubbish a
 * frame later: the collector clearing it shows up as a stutter rather than as slowness. Passing one
 * of the operands is allowed and is the usual case, because every one of these reads what it needs
 * into locals before it writes anything. `tests/mat4_dst.test.ts` is what keeps that true.
 */
export const multiply = (a: Mat4, b: Mat4, dst?: Mat4): Mat4 => mat4.multiply(a, b, dst) as Float32Array;

export const invert = (m: Mat4, dst?: Mat4): Mat4 => mat4.inverse(m, dst) as Float32Array;

export const transpose = (m: Mat4, dst?: Mat4): Mat4 => mat4.transpose(m, dst) as Float32Array;

/**
 * What turns a surface's facing the way a placement turns the surface: the inverse of its turn and
 * size, flipped, with no move.
 *
 * Not the placement itself with each axis brought back to length one. That is the same answer when
 * the size is even, and the wrong one when it is not: a ball squashed flat has its sides lean the
 * other way from how its surface did, and lit by the placement they face the light they should be
 * turned away from.
 *
 * Worked out from the cofactors of the 3x3 rather than by inverting the 4x4, a few dozen
 * multiplications, and scaled so an even size gives back exactly the turn: the length of what it
 * gives is the length of what it was given, as before. A placement that flattens to nothing (a size
 * of 0), or nearly (its determinant under a millionth of what its three axes' lengths make), has no
 * inverse worth trusting, and gets each axis brought back to length one instead. The shaders that
 * work the same out for themselves (`facingTurnOf`) draw that line in the same place, the same way.
 *
 * Only the top-left 3x3 is written; the rest of `dst` is the identity's.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const normalMatrix = (m: Mat4, dst?: Mat4): Mat4 => {
    // Read before anything is written, so `dst` may be `m` itself.
    const a = m[0], b = m[1], c = m[2];
    const d = m[4], e = m[5], f = m[6];
    const g = m[8], h = m[9], i = m[10];
    const out = dst === undefined ? (mat4.identity() as Float32Array) : (mat4.identity(dst) as Float32Array);
    // Each column of the cofactors is the cross of the other two columns: what a face between
    // those two axes faces once they have been moved.
    const x0 = e * i - f * h, y0 = f * g - d * i, z0 = d * h - e * g;
    const x1 = h * c - i * b, y1 = i * a - g * c, z1 = g * b - h * a;
    const x2 = b * f - c * e, y2 = c * d - a * f, z2 = a * e - b * d;
    const det = a * x0 + b * y0 + c * z0;
    const l0 = Math.hypot(a, b, c), l1 = Math.hypot(d, e, f), l2 = Math.hypot(g, h, i);
    if (!(Math.abs(det) > l0 * l1 * l2 * 1e-6)) {
        const k0 = l0 || 1, k1 = l1 || 1, k2 = l2 || 1;
        out[0] = a / k0; out[1] = b / k0; out[2] = c / k0;
        out[4] = d / k1; out[5] = e / k1; out[6] = f / k1;
        out[8] = g / k2; out[9] = h / k2; out[10] = i / k2;
        return out;
    }
    // The cofactors are the inverse flipped, times the determinant. Divided by it, and times its
    // cube root, an even size cancels out: a turned and scaled model gets its plain turn.
    const k = Math.cbrt(Math.abs(det)) / det;
    out[0] = x0 * k; out[1] = y0 * k; out[2] = z0 * k;
    out[4] = x1 * k; out[5] = y1 * k; out[6] = z1 * k;
    out[8] = x2 * k; out[9] = y2 * k; out[10] = z2 * k;
    return out;
};

/**
 * Splits a column-major TRS matrix back into the three parts a `TransformRecord` stores.
 *
 * The engine composes transforms and never needs to take one apart: nothing inside it stores a
 * matrix as authored state. Importing does: glTF lets a node give its placement either as TRS or
 * as a single `matrix`, and a box can only hold the first form, so the second has to be undone
 * before it can be written into a document.
 *
 * Scale comes from the length of each basis column and rotation from those columns normalized,
 * which is the standard decomposition and exact for the transforms an exporter actually writes.
 * It cannot distinguish a negative scale from a rotation (a mirrored object is expressible as
 * either), and it is wrong for a matrix carrying shear, neither is something a glTF node from a
 * modelling tool contains, and both would need a full polar decomposition to handle.
 *
 * @category Math
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const decomposeTrs = (m: Mat4): { translation: [number, number, number]; rotation: TQuat; scale: [number, number, number] } => {
    const len = (i: number): number => Math.hypot(m[i], m[i + 1], m[i + 2]);
    const sx = len(0);
    const sy = len(4);
    const sz = len(8);

    // A zero-length column has no direction to recover, so it contributes identity rather than
    // NaN: a degenerate node still yields a usable box instead of poisoning every matrix it
    // later composes into.
    const rotationOnly = new Float32Array([
        sx ? m[0] / sx : 1, sx ? m[1] / sx : 0, sx ? m[2] / sx : 0, 0,
        sy ? m[4] / sy : 0, sy ? m[5] / sy : 1, sy ? m[6] / sy : 0, 0,
        sz ? m[8] / sz : 0, sz ? m[9] / sz : 0, sz ? m[10] / sz : 1, 0,
        0, 0, 0, 1,
    ]);

    const q = wgpuQuat.fromMat(rotationOnly);
    return {
        translation: [m[12], m[13], m[14]],
        rotation: [q[0], q[1], q[2], q[3]],
        scale: [sx, sy, sz],
    };
};
