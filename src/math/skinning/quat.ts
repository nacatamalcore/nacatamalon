// @ai internal skinning math, not exported from src/index.ts.

export type TQuat = [number, number, number, number];
export type Vec3Tuple = [number, number, number];

/**
 * Spherically interpolates between two quaternions: the correct way to blend
 * rotations (a component-wise lerp warps angular velocity and can shrink the
 * quaternion off the unit sphere). Picks the shortest arc by flipping `b` when the
 * dot product is negative, and degrades to a normalized lerp for nearly-parallel
 * inputs (where `sin(omega)` underflows). Writes into `out` to avoid allocating on
 * the per-frame skinning path.
 */
export const slerp = (a: TQuat, b: TQuat, t: number, out: TQuat): TQuat => {
    let [bx, by, bz, bw] = b;
    let cosom = a[0] * bx + a[1] * by + a[2] * bz + a[3] * bw;

    // Shortest path: -q represents the same rotation as q.
    if (cosom < 0) {
        cosom = -cosom;
        bx = -bx; by = -by; bz = -bz; bw = -bw;
    }

    let scale0: number;
    let scale1: number;
    if (cosom > 0.9995) {
        // Nearly aligned: lerp, then normalize below, to avoid a division by ~0.
        scale0 = 1 - t;
        scale1 = t;
    } else {
        const omega = Math.acos(cosom);
        const sinom = Math.sin(omega);
        scale0 = Math.sin((1 - t) * omega) / sinom;
        scale1 = Math.sin(t * omega) / sinom;
    }

    let ox = scale0 * a[0] + scale1 * bx;
    let oy = scale0 * a[1] + scale1 * by;
    let oz = scale0 * a[2] + scale1 * bz;
    let ow = scale0 * a[3] + scale1 * bw;

    const len = Math.hypot(ox, oy, oz, ow) || 1;
    out[0] = ox / len; out[1] = oy / len; out[2] = oz / len; out[3] = ow / len;
    return out;
};

/**
 * Linearly interpolates two 3-component vectors (translation/scale) into `out`.
 */
export const lerp3 = (a: Vec3Tuple, b: Vec3Tuple, t: number, out: Vec3Tuple): Vec3Tuple => {
    out[0] = a[0] + (b[0] - a[0]) * t;
    out[1] = a[1] + (b[1] - a[1]) * t;
    out[2] = a[2] + (b[2] - a[2]) * t;
    return out;
};
