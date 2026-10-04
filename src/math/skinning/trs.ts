import type { Mat4 } from '../mat4';
import type { TJointPose } from '../../animation';

// @ai internal skinning math, not exported from src/index.ts.

/**
 * Composes a joint's local `translation`/`rotation` (quaternion)/`scale` into a
 * column-major 4x4 matrix. Reads a `TJointPose`, the form animation writes: kept here because the
 * skinning palette recomposes every joint's matrix from its pose every frame, on the hot path.
 *
 * Written into `out` when one is given, because that hot path runs once per bone per frame and
 * asking for memory that often is the difference between a crowd and a stutter.
 */
export const trsToMat4 = (pose: TJointPose, out?: Mat4, at = 0): Mat4 => {
    const [tx, ty, tz] = pose.t;
    const [x, y, z, w] = pose.r;
    const [sx, sy, sz] = pose.s;

    const x2 = x + x, y2 = y + y, z2 = z + z;
    const xx = x * x2, xy = x * y2, xz = x * z2;
    const yy = y * y2, yz = y * z2, zz = z * z2;
    const wx = w * x2, wy = w * y2, wz = w * z2;

    const m = out ?? new Float32Array(16);
    m[at] = (1 - (yy + zz)) * sx; m[at + 1] = (xy + wz) * sx; m[at + 2] = (xz - wy) * sx; m[at + 3] = 0;
    m[at + 4] = (xy - wz) * sy; m[at + 5] = (1 - (xx + zz)) * sy; m[at + 6] = (yz + wx) * sy; m[at + 7] = 0;
    m[at + 8] = (xz + wy) * sz; m[at + 9] = (yz - wx) * sz; m[at + 10] = (1 - (xx + yy)) * sz; m[at + 11] = 0;
    m[at + 12] = tx; m[at + 13] = ty; m[at + 14] = tz; m[at + 15] = 1;
    return m;
};
