/**
 * How the values between two keys are reached.
 *
 * `'LINEAR'` walks evenly from one to the next, and is what every file this engine has been shown
 * uses. `'STEP'` holds the earlier one until the next arrives, which is how a blinking light or a
 * flicking tail is authored. `'CUBICSPLINE'` carries a slope at each key for a softer arrival; it
 * is read but walked evenly for now, with one warning.
 *
 * @category Animation
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TInterpolation = 'LINEAR' | 'STEP' | 'CUBICSPLINE';

/**
 * One thing a clip moves: a part of one bone, and where to read its values.
 *
 * It names **which skeleton** as well as which bone, because a file is allowed to hold more than
 * one rig and one clip may drive several of them.
 *
 * @category Animation
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TSkeletalChannel = {
    skeleton: number;
    joint: number;
    path: 'translation' | 'rotation' | 'scale';
    sampler: number;
};

/**
 * A run of values over time: when each key is, and what it says.
 *
 * `output` is one long run of numbers, three to a key for a move or a size and four for a turn.
 *
 * @category Animation
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TSkeletalSampler = {
    /**
     * When each key is, in seconds, in order.
     */
    input: Float32Array;
    output: Float32Array;
    interpolation: TInterpolation;
};

/**
 * One named movement of a skeleton: walking, running, being hit.
 *
 * Named apart from a sprite's `TAnimationClip`, which is a run of pictures. The two are the same
 * idea in the two halves of the engine and share nothing at all.
 *
 * It is plain data and holds nothing that is running. Two characters playing the same clip at
 * different moments share this and keep their own time, which is what makes a crowd cheap.
 *
 * @category Animation
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TSkeletalClip = {
    readonly type: 'clip';
    name: string;
    /**
     * How long it lasts, in seconds: the latest key any of its runs reaches.
     */
    duration: number;
    channels: TSkeletalChannel[];
    samplers: TSkeletalSampler[];
};
