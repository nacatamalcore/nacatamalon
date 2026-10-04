import { trsToMat4 } from './trs';
import type { TSkeleton } from '../../animation';

// @ai internal skinning math, not exported from src/index.ts.

/**
 * Multiplies two column-major matrices held inside bigger runs, writing into a third.
 *
 * Its own thing rather than the general one because this runs twice per bone per frame, and the
 * general one hands back a new matrix every time it is called.
 */
const multiplyInto = (a: Float32Array, ai: number, b: Float32Array, bi: number, out: Float32Array, oi: number): void => {
    for (let column = 0; column < 4; column++) {
        const b0 = b[bi + column * 4];
        const b1 = b[bi + column * 4 + 1];
        const b2 = b[bi + column * 4 + 2];
        const b3 = b[bi + column * 4 + 3];
        for (let row = 0; row < 4; row++) {
            out[oi + column * 4 + row] =
                a[ai + row] * b0 + a[ai + 4 + row] * b1 + a[ai + 8 + row] * b2 + a[ai + 12 + row] * b3;
        }
    }
};

/**
 * Room for one bone's own placement, reused: bones are worked out strictly one after another.
 */
const local = new Float32Array(16);

/**
 * Room for where every bone ended up, kept per skeleton and grown only when a bigger one turns up.
 */
const scratch = new WeakMap<TSkeleton, Float32Array>();

const roomFor = (skeleton: TSkeleton, count: number): Float32Array => {
    const held = scratch.get(skeleton);
    if (held !== undefined && held.length >= count * 16) {
        return held;
    }
    const made = new Float32Array(count * 16);
    scratch.set(skeleton, made);
    return made;
};

/**
 * Works out what the graphics card reads, from how the skeleton is standing right now.
 *
 * Bones are walked front to back. They are stored parents first, so by the time one is reached the
 * bone it hangs from is already worked out and one pass is enough, with nothing to recurse into:
 *
 *   `world[j]  = parent < 0 ? local[j] : world[parent] · local[j]`
 *   `matrix[j] = world[j] · inverseBindMatrix[j]`
 *
 * The result moves a corner from where it was modelled to where the bones have put it, **in the
 * skeleton's own space**: where the model itself stands is applied on top, by the shader, so a
 * character is still placed and turned like anything else.
 *
 * **`frame` is what stops this being done twice.** Several models can share one skeleton, and both
 * of them would pose it identically; a shadow pass would do it a third time. Handing the frame
 * number in means the answer is worked out once and read as many times as needed.
 */
export const computeJointMatrices = (skeleton: TSkeleton, frame: number): void => {
    if (skeleton.posedOn === frame) {
        return;
    }
    skeleton.posedOn = frame;

    const { parentIndex, pose, inverseBindMatrices, jointMatrices, rootMatrices } = skeleton;
    const count = pose.length;
    const worlds = roomFor(skeleton, count);

    for (let j = 0; j < count; j++) {
        const at = j * 16;
        const parent = parentIndex[j];
        trsToMat4(pose[j], local, 0);
        if (parent < 0) {
            // Whatever the rig is kept inside comes first: a file that turns its whole scene
            // upright turned this bone too, and the numbers undoing the rest position know it.
            if (rootMatrices === null) {
                worlds.set(local, at);
            } else {
                multiplyInto(rootMatrices, at, local, 0, worlds, at);
            }
        } else {
            // Its own placement, carried by whatever it hangs from.
            multiplyInto(worlds, parent * 16, local, 0, worlds, at);
        }
        multiplyInto(worlds, at, inverseBindMatrices, at, jointMatrices, at);
    }
};
