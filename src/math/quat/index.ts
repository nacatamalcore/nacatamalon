import { quat, mat4 } from 'wgpu-matrix';
import type { Mat4 } from '../mat4';

/**
 * A unit quaternion `[x, y, z, w]`: the engine's storage form for a full 3D
 * orientation. Chosen over Euler angles for anything that rotates freely in 3D (a
 * flying ship, a physics body): it never gimbal-locks, composes with a single
 * multiply, and interpolates smoothly with `slerp`. It is a plain number tuple on
 * purpose: four JSON-serializable numbers, so a `TransformRecord.quaternion` round-
 * trips through the editor/save with no special casing (a `Float32Array` would
 * stringify as `{"0":...}`, not an array). The matrix is only ever the *derived*
 * render form (`toMat4`); the quaternion is the state you keep and evolve.
 *
 * @category Math
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TQuat = [number, number, number, number];

/**
 * Copies whatever array-like `wgpu-matrix` hands back into a plain 4-number tuple.
 * Internal: keeps the public surface returning serializable `TQuat`s rather than the
 * library's `Float32Array`.
 */
const toTuple = (q: ArrayLike<number>): TQuat => [q[0], q[1], q[2], q[3]];

/**
 * The identity rotation `[0, 0, 0, 1]`, no rotation at all. Use it as the starting
 * orientation you then multiply incremental rotations onto.
 *
 * @category Math
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const identity = (): TQuat => [0, 0, 0, 1];

/**
 * Builds a quaternion from yaw/pitch/roll Euler angles (radians), using the **exact
 * same axis order the renderer applies to Euler transforms**: yaw (Y), then pitch
 * (X), then roll (Z). That equivalence is the point: a mesh authored with
 * `rotation`/`rotationX`/`rotationY` can be switched to a `quaternion` built here and
 * face the identical direction, so you only pay the Euler→quat conversion once, up
 * front, and evolve the quaternion from then on.
 *
 * @param x - Pitch, rotation about X, in radians.
 * @param y - Yaw, rotation about Y, in radians.
 * @param z - Roll, rotation about Z, in radians.
 * @returns The turn as a quaternion.
 * @category Math
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const fromEuler = (x: number, y: number, z: number): TQuat =>
    toTuple(quat.fromEuler(x, y, z, 'yxz'));

/**
 * Builds a quaternion that rotates by `angle` radians about the axis `(ax, ay, az)`.
 * The natural way to author "spin this much around this direction": a barrel roll is
 * a rotation about the ship's forward axis, a turn is one about its up axis.
 *
 * @param angle - Rotation about the axis, in radians.
 * @param ax - The axis to turn about. Any length.
 * @param ay - The axis to turn about.
 * @param az - The axis to turn about.
 * @returns The turn as a quaternion.
 * @category Math
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const fromAxisAngle = (ax: number, ay: number, az: number, angle: number): TQuat =>
    toTuple(quat.fromAxisAngle([ax, ay, az], angle));

/**
 * Composes two rotations: the result applies `b` first, then `a` (same convention as
 * matrix multiplication). This is how you accumulate orientation incrementally:
 * `orientation = multiply(deltaSpin, orientation)` each frame rolls a ship a little
 * further without ever touching Euler angles or risking gimbal lock.
 * @param a - The second turn.
 * @param b - The first turn.
 * @returns Both turns together: `b`, then `a`.
 *
 * @category Math
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const multiply = (a: TQuat, b: TQuat): TQuat =>
    toTuple(quat.multiply(a, b));

/**
 * Spherically interpolates from `a` to `b` by `t` in `[0, 1]`: the correct way to
 * blend two orientations (a component-wise lerp warps angular speed and drifts off
 * the unit sphere). Use it to ease a camera or ship toward a target facing.
 *
 * @category Math
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const slerp = (a: TQuat, b: TQuat, t: number): TQuat =>
    toTuple(quat.slerp(a, b, t));

/**
 * Re-normalizes a quaternion back onto the unit sphere. Repeated multiplications
 * accumulate floating-point error that slowly scales the rotation; call this
 * periodically on a long-lived accumulated orientation to keep it a pure rotation.
 * @param q - A quaternion.
 * @returns The same turn, one unit long.
 *
 * @category Math
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const normalize = (q: TQuat): TQuat =>
    toTuple(quat.normalize(q));

/**
 * Derives the 4x4 rotation matrix the GPU actually consumes from a quaternion. This
 * is the one-way bridge from stored orientation to render form, called by the 3D
 * pipeline each frame when a transform carries a `quaternion`.
 *
 * @category Math
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const toMat4 = (q: TQuat, dst?: Mat4): Mat4 =>
    mat4.fromQuat(q, dst) as Float32Array;

/**
 * The inverse of a unit rotation: the turn that undoes `q`. For a unit quaternion that is
 * simply its conjugate (negate the axis, keep `w`), which is why this is exact and cheap where
 * a matrix inverse would be neither.
 *
 * It is what turns a *world* answer back into a **local** one: a box's placement is stored
 * relative to its parent, so anything computed in world space (a physics body's pose, a
 * gizmo drag, a snapped position) has to come back through the parent's inverse rotation
 * before it can be written down.
 *
 * @category Math
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const conjugate = (q: TQuat): TQuat => [-q[0], -q[1], -q[2], q[3]];

/**
 * Rotates a vector by a quaternion: `q · v · q⁻¹`, in its expanded (branch-free) form.
 *
 * The scene graph's composition is expressed in position/rotation/scale rather than in
 * matrices (see `composeWorldTransforms`), and this is the one operation that needs: a child's
 * local offset, turned by its parent's orientation, is where the child actually sits.
 * @param q - The turn.
 * @param v - The vector to turn.
 * @returns The turned vector.
 *
 * @category Math
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const rotateVec3 = (q: TQuat, v: { x: number; y: number; z: number }): { x: number; y: number; z: number } => {
    const [qx, qy, qz, qw] = q;
    // t = 2 · (q_v × v); result = v + w·t + q_v × t
    const tx = 2 * (qy * v.z - qz * v.y);
    const ty = 2 * (qz * v.x - qx * v.z);
    const tz = 2 * (qx * v.y - qy * v.x);
    return {
        x: v.x + qw * tx + (qy * tz - qz * ty),
        y: v.y + qw * ty + (qz * tx - qx * tz),
        z: v.z + qw * tz + (qx * ty - qy * tx),
    };
};
