// @ai: advanced API, most engine users will not need Mat4 directly. Used internally by the renderer for transforms and projections.
import { mat4 } from 'wgpu-matrix';

export type Mat4 = Float32Array

export const create = (): Mat4 => mat4.identity() as Float32Array;

/**
 * Puts a matrix back to identity, in the place it already occupies.
 *
 * The twin of `create` for anything being reused: without it, starting a fresh composition in a
 * matrix you already have would mean remembering to clear every entry the last one left behind, and
 * forgetting is a wrong answer rather than a crash.
 */
export const identity = (dst: Mat4): Mat4 => mat4.identity(dst) as Float32Array;

export * from './transform';
export * from './projection';
export * from './ops';
