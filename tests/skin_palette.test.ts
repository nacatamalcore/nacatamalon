import { describe, expect, it } from 'bun:test';
import * as quat from '../src/math/quat';
import { computeJointMatrices } from '../src/math/skinning';
import { newSkeleton } from '../src/animation';
import type { TJointPose, TSkeleton } from '../src/animation';

/**
 * What the graphics card is handed: the matrix that carries a corner from where it was modelled to
 * where the bones have put it.
 *
 * The test that matters most here is the dull one. **At rest, every one of those matrices must
 * leave a corner exactly where it was**, because the rest position and what undoes it are supposed
 * to cancel. If they are composed the wrong way round the model still moves, plausibly, and is
 * wrong everywhere: this is the check that says so.
 */

const rest = (t: [number, number, number] = [0, 0, 0]): TJointPose => ({ t, r: [0, 0, 0, 1], s: [1, 1, 1] });

/**
 * What undoes a placement that is only a move.
 */
const undoMove = (x: number, y: number, z: number): number[] =>
    [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, -x, -y, -z, 1];

/**
 * Where a corner ends up under bone `j`.
 */
const moved = (skeleton: TSkeleton, j: number, x: number, y: number, z: number): [number, number, number] => {
    const m = skeleton.jointMatrices;
    const at = j * 16;
    return [
        m[at] * x + m[at + 4] * y + m[at + 8] * z + m[at + 12],
        m[at + 1] * x + m[at + 5] * y + m[at + 9] * z + m[at + 13],
        m[at + 2] * x + m[at + 6] * y + m[at + 10] * z + m[at + 14],
    ];
};

const close = (got: [number, number, number], want: [number, number, number]): void => {
    expect(got[0]).toBeCloseTo(want[0], 4);
    expect(got[1]).toBeCloseTo(want[1], 4);
    expect(got[2]).toBeCloseTo(want[2], 4);
};

/**
 * A hip at the origin with a knee two above it, each knowing how to undo where it rests.
 */
const limb = (): TSkeleton => newSkeleton(
    'limb',
    Int32Array.from([-1, 0]),
    [rest([0, 0, 0]), rest([0, 2, 0])],
    Float32Array.from([...undoMove(0, 0, 0), ...undoMove(0, 2, 0)]),
);

describe('the palette at rest', () => {
    it('leaves every corner exactly where it was', () => {
        const skeleton = limb();
        computeJointMatrices(skeleton, 1);

        close(moved(skeleton, 0, 3, 1, 4), [3, 1, 4]);
        close(moved(skeleton, 1, 3, 1, 4), [3, 1, 4]);
    });

    it('goes back to leaving it there after being moved and put back', () => {
        const skeleton = limb();
        skeleton.pose[0].t = [10, 0, 0];
        computeJointMatrices(skeleton, 1);
        expect(moved(skeleton, 0, 0, 0, 0)[0]).toBeCloseTo(10);

        skeleton.pose[0].t = [0, 0, 0];
        computeJointMatrices(skeleton, 2);
        close(moved(skeleton, 0, 3, 1, 4), [3, 1, 4]);
    });
});

describe('the palette when a bone moves', () => {
    it('moves what hangs off that bone and nothing else', () => {
        const skeleton = limb();
        skeleton.pose[1].t = [0, 5, 0];
        computeJointMatrices(skeleton, 1);

        close(moved(skeleton, 1, 0, 2, 0), [0, 5, 0]);
        // The hip did not move, so anything weighted to it stayed.
        close(moved(skeleton, 0, 1, 1, 1), [1, 1, 1]);
    });

    it('carries a bone along when the one it hangs from turns', () => {
        const skeleton = limb();
        // A quarter turn about z at the hip: what was two above ends up two to the left.
        skeleton.pose[0].r = quat.fromAxisAngle(0, 0, 1, Math.PI / 2);
        computeJointMatrices(skeleton, 1);

        close(moved(skeleton, 1, 0, 2, 0), [-2, 0, 0]);
    });

    it('turns a corner around its own bone, not around the world', () => {
        const skeleton = limb();
        skeleton.pose[1].r = quat.fromAxisAngle(0, 0, 1, Math.PI / 2);
        computeJointMatrices(skeleton, 1);

        // A corner one to the right of the knee swings to one above it.
        close(moved(skeleton, 1, 1, 2, 0), [0, 3, 0]);
    });
});

describe('doing the work once', () => {
    it('skips a rebuild that was already done this frame', () => {
        const skeleton = limb();
        computeJointMatrices(skeleton, 7);

        // Two models sharing one skeleton would both ask. The second must cost nothing, and the
        // way to tell is that a pose changed in between is NOT picked up.
        skeleton.pose[0].t = [50, 0, 0];
        computeJointMatrices(skeleton, 7);
        expect(moved(skeleton, 0, 0, 0, 0)[0]).toBeCloseTo(0);

        computeJointMatrices(skeleton, 8);
        expect(moved(skeleton, 0, 0, 0, 0)[0]).toBeCloseTo(50);
    });

    it('asks for no memory once it is warm', () => {
        const skeleton = limb();
        computeJointMatrices(skeleton, 1);

        // Whatever room it needs was taken on the first pass and is reused after that. Measured by
        // the one thing a test can see: the palette is the same array, written over in place.
        const before = skeleton.jointMatrices;
        for (let frame = 2; frame < 60; frame++) {
            skeleton.pose[0].t = [frame, 0, 0];
            computeJointMatrices(skeleton, frame);
        }
        expect(skeleton.jointMatrices).toBe(before);
        expect(moved(skeleton, 0, 0, 0, 0)[0]).toBeCloseTo(59);
    });
});
