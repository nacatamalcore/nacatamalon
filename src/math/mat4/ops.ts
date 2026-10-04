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
