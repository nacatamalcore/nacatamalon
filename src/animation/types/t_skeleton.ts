import type { TQuat } from '../../math/quat';

/**
 * Where one bone sits relative to the bone above it: a move, a turn and a size.
 *
 * Kept as three separate things rather than one matrix because that is how animation writes it: a
 * clip turns a shoulder without touching where it is, and two poses can only be mixed sensibly one
 * part at a time.
 *
 * @category Animation
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TJointPose = {
    t: [number, number, number];
    r: TQuat;
    s: [number, number, number];
};

/**
 * The bones of a model, and how they are standing right now.
 *
 * It comes out of a file that was rigged: the bones themselves, which bone hangs from which, how
 * they stand at rest, and what it takes to undo that rest position. Animation writes `pose` and
 * nothing else; the graphics card reads `jointMatrices` and nothing else. That line down the middle
 * is what keeps playing an animation, posing a skeleton and drawing it three separate problems.
 *
 * Bones are a flat list, **parents before their children**, so working out where each one ended up
 * is one pass from the front with nothing to recurse into.
 *
 * @category Animation
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TSkeleton = {
    readonly type: 'skeleton';
    /**
     * What it is kept under: the model's name, plus which of its skeletons this is.
     */
    key: string;
    /**
     * The bone each one hangs from, `-1` for one that hangs from nothing.
     */
    parentIndex: Int32Array;
    /**
     * How it stands when nothing is playing.
     */
    bindPose: TJointPose[];
    /**
     * How it stands now. The only thing an animation writes.
     */
    pose: TJointPose[];
    /**
     * What undoes the rest position, 16 numbers a bone.
     */
    inverseBindMatrices: Float32Array;
    /**
     * What the graphics card reads, 16 numbers a bone. Worked out from `pose` each frame.
     */
    jointMatrices: Float32Array;
    /**
     * What sits above the bones that hang from nothing, 16 numbers a bone, or `null` when nothing
     * does.
     *
     * A rig is usually kept inside something: a file exported from Blender puts everything under
     * one node that turns the whole scene upright. That turn is part of where a bone is, and the
     * numbers undoing the rest position were written knowing it. Left out, the model is drawn a
     * quarter turn away from where it belongs, and only on files that have such a node, which is
     * why it is easy to ship without noticing.
     */
    rootMatrices: Float32Array | null;
    /**
     * Which frame `jointMatrices` was last worked out on, so several models sharing one skeleton
     * do the work once between them. `-1` before it has ever been done.
     */
    posedOn: number;
};
