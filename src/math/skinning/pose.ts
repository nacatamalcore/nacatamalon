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

// CUBICSPLINE warning is emitted at most once, not once per channel per frame.
let warnedCubic = false;

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
 * Samples every channel of `clip` at time `t` (seconds) and writes the results into the poses in
 * place: the one and only thing an animation clip does to a skeleton, so playback, skeleton, and
 * GPU upload stay decoupled ("the pose is the boundary"). `poses` is one entry per skeleton of the
 * model, because a file may hold several rigs and one clip may drive more than one of them.
 * `t` must already be wrapped into `[0, duration]` by the caller (the player owns
 * looping). Times outside a channel's own keyframe range clamp to its first/last key.
 *
 * Interpolation is `LINEAR` (slerp for rotations, lerp for translation/scale) or
 * `STEP` (hold the earlier key). `CUBICSPLINE` output is laid out as
 * `[inTangent, value, outTangent]` per key; it isn't Hermite-interpolated yet: the
 * value samples are LINEAR-blended and a one-time warning is logged. The v1 target
 * (Khronos Fox) is entirely LINEAR, so this covers it exactly.
 */
export const sampleClip = (clip: TSkeletalClip, t: number, poses: TJointPose[][]): void => {
    const cursor = cursorsFor(clip);

    for (let c = 0; c < clip.channels.length; c++) {
        const channel = clip.channels[c];
        const sampler = clip.samplers[channel.sampler];
        const { input, output, interpolation } = sampler;
        const isRotation = channel.path === 'rotation';
        const comps = isRotation ? 4 : 3;

        // CUBICSPLINE stores 3 values (in-tangent, value, out-tangent) per key; we read
        // only the middle value block until real Hermite support lands.
        const block = interpolation === 'CUBICSPLINE' ? comps * 3 : comps;
        const valueOffset = interpolation === 'CUBICSPLINE' ? comps : 0;

        if (interpolation === 'CUBICSPLINE' && !warnedCubic) {
            console.warn('[NacatamalOn] sampleClip: CUBICSPLINE interpolation is not yet supported, falling back to LINEAR on value keyframes.');
            warnedCubic = true;
        }

        const n = input.length;
        let i0: number;
        let i1: number;
        let alpha: number;

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
            const span = input[i1] - input[i0];
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
