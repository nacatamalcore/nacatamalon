import { slerp, lerp3 } from './quat';
import type { TQuat, Vec3Tuple } from './quat';
import type { TSkeletalClip, TJointPose } from '../../animation';

// @ai internal skinning math, not exported from src/index.ts.

// Scratch keyframe values, reused across every channel so sampling allocates
// nothing per frame. Safe because channels are processed strictly sequentially.
const q0: TQuat = [0, 0, 0, 1];
const q1: TQuat = [0, 0, 0, 1];
const v0: Vec3Tuple = [0, 0, 0];
const v1: Vec3Tuple = [0, 0, 0];


/**
 * Where each channel's search left off last time, one number per channel.
 *
 * Time nearly always moves forward by a little, so the key wanted this frame is the one found last
 * frame or the one after it. Starting the search from the beginning every frame, which is what the
 * obvious version does, makes a long clip cost more the further into it you are.
 */
const cursors = new WeakMap<TSkeletalClip, Int32Array>();

const cursorsFor = (clip: TSkeletalClip): Int32Array => {
    let held = cursors.get(clip);
    if (held === undefined || held.length !== clip.channels.length) {
        held = new Int32Array(clip.channels.length);
        cursors.set(clip, held);
    }
    return held;
};

const readVec3 = (output: Float32Array, block: number, valueOffset: number, i: number, dst: Vec3Tuple): void => {
    const b = i * block + valueOffset;
    dst[0] = output[b]; dst[1] = output[b + 1]; dst[2] = output[b + 2];
};

const readQuat = (output: Float32Array, block: number, valueOffset: number, i: number, dst: TQuat): void => {
    const b = i * block + valueOffset;
    dst[0] = output[b]; dst[1] = output[b + 1]; dst[2] = output[b + 2]; dst[3] = output[b + 3];
};

/**
 * Where a curved channel is between two keys, written into `dst`, as glTF defines it: the curve
 * that leaves the first key at its own value along its slope out, and reaches the second at its
 * value along its slope in. Each key holds three blocks of `comps` numbers, the slope in, the value
 * and the slope out; a slope is per second, so it is scaled by the time between the two keys.
 *
 * A rotation is curved number by number like the rest and brought back to length one after, which
 * is what the format asks for. Number by number, so nothing is made per frame.
 */
const hermite = (output: Float32Array, comps: number, i0: number, i1: number, s: number, span: number, dst: number[]): void => {
    const s2 = s * s;
    const s3 = s2 * s;
    const fromValue = 2 * s3 - 3 * s2 + 1;
    const fromSlope = (s3 - 2 * s2 + s) * span;
    const toValue = -2 * s3 + 3 * s2;
    const toSlope = (s3 - s2) * span;
    const a = i0 * comps * 3;
    const b = i1 * comps * 3;
    for (let k = 0; k < comps; k++) {
        dst[k] = fromValue * output[a + comps + k] + fromSlope * output[a + 2 * comps + k]
            + toValue * output[b + comps + k] + toSlope * output[b + k];
    }
    if (comps === 4) {
        const length = Math.hypot(dst[0], dst[1], dst[2], dst[3]) || 1;
        dst[0] /= length; dst[1] /= length; dst[2] /= length; dst[3] /= length;
    }
};

/**
 * Samples every channel of `clip` at time `t` (seconds) and writes the results into the poses in
 * place: the one and only thing an animation clip does to a skeleton, so playback, skeleton, and
 * GPU upload stay decoupled ("the pose is the boundary"). `poses` is one entry per skeleton of the
 * model, because a file may hold several rigs and one clip may drive more than one of them.
 * `t` must already be wrapped into `[0, duration]` by the caller (the player owns
 * looping). Times outside a channel's own keyframe range clamp to its first/last key.
 *
 * Interpolation is `LINEAR` (slerp for rotations, lerp for translation/scale), `STEP` (hold the
 * earlier key) or `CUBICSPLINE` (the curve glTF defines, through each key's value along its slopes:
 * see `hermite`).
 */
export const sampleClip = (clip: TSkeletalClip, t: number, poses: TJointPose[][]): void => {
    const cursor = cursorsFor(clip);

    for (let c = 0; c < clip.channels.length; c++) {
        const channel = clip.channels[c];
        const sampler = clip.samplers[channel.sampler];
        const { input, output, interpolation } = sampler;
        const isRotation = channel.path === 'rotation';
        const comps = isRotation ? 4 : 3;

        // A curved channel keeps three blocks a key (the slope in, the value, the slope out): a key
        // on its own is read from the middle one.
        const curved = interpolation === 'CUBICSPLINE';
        const block = curved ? comps * 3 : comps;
        const valueOffset = curved ? comps : 0;

        const n = input.length;
        let i0: number;
        let i1: number;
        let alpha: number;
        let span = 0;

        if (t <= input[0]) {
            i0 = 0; i1 = 0; alpha = 0;
        } else if (t >= input[n - 1]) {
            i0 = n - 1; i1 = n - 1; alpha = 0;
        } else {
            // Carry on from where this channel was, and only start over when time went backwards,
            // which is what looping round to the beginning looks like from here.
            let i = cursor[c];
            if (i >= n - 1 || input[i] > t) {
                i = 0;
            }
            while (i < n - 1 && input[i + 1] <= t) i++;
            cursor[c] = i;
            i0 = i; i1 = i + 1;
            span = input[i1] - input[i0];
            alpha = span > 0 ? (t - input[i0]) / span : 0;
        }

        // STEP holds the earlier keyframe until the next one is reached.
        if (interpolation === 'STEP') {
            i1 = i0; alpha = 0;
        }

        const target = poses[channel.skeleton]?.[channel.joint];
        if (target === undefined) {
            continue;
        }
        const into = isRotation ? target.r : channel.path === 'translation' ? target.t : target.s;
        if (curved && i0 !== i1) {
            hermite(output, comps, i0, i1, alpha, span, into);
            continue;
        }
        if (isRotation) {
            readQuat(output, block, valueOffset, i0, q0);
            readQuat(output, block, valueOffset, i1, q1);
            slerp(q0, q1, alpha, target.r);
        } else {
            readVec3(output, block, valueOffset, i0, v0);
            readVec3(output, block, valueOffset, i1, v1);
            lerp3(v0, v1, alpha, channel.path === 'translation' ? target.t : target.s);
        }
    }
};
