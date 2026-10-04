import type { TJointPose, TSkeleton } from './types/t_skeleton';

/**
 * A bone standing at nothing in particular: where it was made, unturned, unshrunk.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const restingJoint = (): TJointPose => ({ t: [0, 0, 0], r: [0, 0, 0, 1], s: [1, 1, 1] });

/**
 * Copies a pose, so a skeleton's rest position and its live one are never the same objects.
 *
 * They would otherwise be, and then the first frame of any animation would overwrite the rest
 * position it is supposed to be able to return to.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const copyPose = (pose: readonly TJointPose[]): TJointPose[] =>
    pose.map((joint) => ({ t: [...joint.t], r: [...joint.r], s: [...joint.s] } as TJointPose));

/**
 * A skeleton with the bones it was given, standing at rest.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const newSkeleton = (
    key: string,
    parentIndex: Int32Array,
    bindPose: TJointPose[],
    inverseBindMatrices: Float32Array,
    rootMatrices: Float32Array | null = null,
): TSkeleton => ({
    type: 'skeleton',
    key,
    parentIndex,
    bindPose,
    pose: copyPose(bindPose),
    inverseBindMatrices,
    jointMatrices: new Float32Array(bindPose.length * 16),
    rootMatrices,
    posedOn: -1,
});
