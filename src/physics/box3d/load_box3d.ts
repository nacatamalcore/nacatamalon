import Box3D from 'box3d.js/inline';
import type { Box3DModule } from 'box3d.js/inline';

/**
 * The Box3D WebAssembly runtime, or `null`: the opaque handle every physics call
 * goes through. Excluded from any serialization exactly like a GPU handle: it is pure
 * runtime, reconstructed on load, never part of a save. Re-exported so the world
 * wrapper can type body/world ids off it without importing Embind internals.
 *
 * @category Physics
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TBox3dModule = Box3DModule;

/**
 * A point or a direction as box3d takes it since 0.1: a plain `[x, y, z]` array.
 */
export type TB3Vec3 = [number, number, number];

/**
 * A rotation as box3d takes it since 0.1: `[x, y, z, w]`, the engine's own quaternion order.
 */
export type TB3Quat = [number, number, number, number];

/**
 * The engine's `{ x, y, z }` as box3d's `[x, y, z]`. Every vector crosses into box3d through here,
 * so the two shapes never meet anywhere else.
 */
export const toB3 = (v: { x: number; y: number; z: number }): TB3Vec3 => [v.x, v.y, v.z];

/**
 * box3d's `[x, y, z]` as the engine's `{ x, y, z }`. Copied out on purpose: what box3d hands back
 * can be a view into its memory, and holding one past the next call reads whatever was written there.
 */
export const fromB3 = (v: ArrayLike<number>): { x: number; y: number; z: number } => ({ x: v[0], y: v[1], z: v[2] });

let modulePromise: Promise<TBox3dModule> | null = null;

/**
 * Loads (once) the Box3D WASM runtime and memoizes the promise, so every
 * world in a game shares a single instantiation instead of re-compiling
 * the module per scene. Uses the **inline** build, so the `.wasm` is embedded in the
 * bundle as base64, so it works in the browser with no Vite/loader config and in a
 * headless Node/Bun test with no separate file to resolve. The trade is a slightly
 * larger bundle, paid only by games that actually import the physics adapter.
 *
 * @category Physics
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const loadBox3D = (): Promise<TBox3dModule> => {
    if (!modulePromise) modulePromise = Box3D() as Promise<TBox3dModule>;
    return modulePromise;
};
