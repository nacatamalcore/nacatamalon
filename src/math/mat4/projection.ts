import { mat4 } from 'wgpu-matrix';
import type { Mat4 } from './index';

/**
 * Creates a perspective projection matrix.
 * @param fovy - Vertical field of view in radians.
 * @param aspect - Viewport width / height.
 * @param near - Near clipping plane distance (must be > 0).
 * @param far - Far clipping plane distance.
 * @since 1.0.0
 */
export const perspective = (fovy: number, aspect: number, near: number, far: number, dst?: Mat4): Mat4 =>
    mat4.perspective(fovy, aspect, near, far, dst) as Float32Array;

/**
 * Creates an orthographic projection matrix.
 * @param left - Left bound of the frustum.
 * @param right - Right bound of the frustum.
 * @param bottom - Bottom bound of the frustum.
 * @param top - Top bound of the frustum.
 * @param near - Near clipping plane distance.
 * @param far - Far clipping plane distance.
 * @since 1.0.0
 */
export const ortho = (
    left: number,
    right: number,
    bottom: number,
    top: number,
    near: number,
    far: number,
    dst?: Mat4,
): Mat4 => mat4.ortho(left, right, bottom, top, near, far, dst) as Float32Array;
