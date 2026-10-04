import { mat4 } from 'wgpu-matrix';
import type { Mat4 } from './index';
import type { TVec3 } from '../vec3/index';

/**
 * `dst` is where the answer goes when the caller has somewhere to put it.
 *
 * It exists because the 3D path runs once per model per frame, and a matrix made there is rubbish a
 * frame later: the collector clearing it shows up as a stutter rather than as slowness. Passing one
 * of the operands is allowed and is the usual case, because every one of these reads what it needs
 * into locals before it writes anything. `tests/mat4_dst.test.ts` is what keeps that true.
 */

export const translate = (m: Mat4, v: TVec3, dst?: Mat4): Mat4 =>
    mat4.translate(m, [v.x, v.y, v.z], dst) as Float32Array;

export const scale = (m: Mat4, v: TVec3, dst?: Mat4): Mat4 =>
    mat4.scale(m, [v.x, v.y, v.z], dst) as Float32Array;

/**
 * @param angle - Angle in radians.
 * @since 1.0.0
 */
export const rotateX = (m: Mat4, angle: number, dst?: Mat4): Mat4 =>
    mat4.rotateX(m, angle, dst) as Float32Array;

/**
 * @param angle - Angle in radians.
 * @since 1.0.0
 */
export const rotateY = (m: Mat4, angle: number, dst?: Mat4): Mat4 =>
    mat4.rotateY(m, angle, dst) as Float32Array;

/**
 * @param angle - Angle in radians.
 * @since 1.0.0
 */
export const rotateZ = (m: Mat4, angle: number, dst?: Mat4): Mat4 =>
    mat4.rotateZ(m, angle, dst) as Float32Array;

/**
 * Builds a view matrix that looks from `eye` toward `target` with `up` as the
 * world-up hint: i.e. the world→view transform of a camera placed at `eye`. Used
 * to render the scene from a light's point of view for shadow mapping; compose with
 * an ortho/perspective projection to get the light-space matrix.
 *
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const lookAt = (eye: TVec3, target: TVec3, up: TVec3, dst?: Mat4): Mat4 =>
    mat4.lookAt([eye.x, eye.y, eye.z], [target.x, target.y, target.z], [up.x, up.y, up.z], dst) as Float32Array;
