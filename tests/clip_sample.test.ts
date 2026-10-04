import { afterEach, describe, expect, it } from 'bun:test';
import { sampleClip } from '../src/math/skinning';
import type { TSkeletalClip, TJointPose } from '../src/animation';

/**
 * Reading a movement at a moment in time.
 *
 * The keyframe search is the part worth pinning down: it carries on from where it was, because
 * time nearly always moves forward a little, and a search that starts over every frame makes a long
 * clip cost more the further into it you are. Carrying on is also where the bugs live, so most of
 * what is below is about a frame that is too long, and about time going back to the beginning.
 */

const restingJoint = (): TJointPose => ({ t: [0, 0, 0], r: [0, 0, 0, 1], s: [1, 1, 1] });

/**
 * One bone moved along x through the given keys.
 */
const slide = (times: number[], xs: number[], interpolation: TSkeletalClip['samplers'][0]['interpolation'] = 'LINEAR'): TSkeletalClip => ({
    type: 'clip',
    name: 'slide',
    duration: times[times.length - 1],
    channels: [{ skeleton: 0, joint: 0, path: 'translation', sampler: 0 }],
    samplers: [{
        input: Float32Array.from(times),
        output: Float32Array.from(xs.flatMap((x) => [x, 0, 0])),
        interpolation,
    }],
});

const at = (clip: TSkeletalClip, t: number, poses?: TJointPose[][]): number => {
    const target = poses ?? [[restingJoint()]];
    sampleClip(clip, t, target);
    return target[0][0].t[0];
};

const warnings: string[] = [];
const original = console.warn;
afterEach(() => { console.warn = original; warnings.length = 0; });
const catchWarnings = (): void => { console.warn = (...args: unknown[]) => { warnings.push(args.map(String).join(' ')); }; };

describe('between two keys', () => {
    it('walks evenly from one to the next', () => {
        const clip = slide([0, 1], [0, 10]);

        expect(at(clip, 0)).toBeCloseTo(0);
        expect(at(clip, 0.25)).toBeCloseTo(2.5);
        expect(at(clip, 0.5)).toBeCloseTo(5);
        expect(at(clip, 1)).toBeCloseTo(10);
    });

    it('holds the earlier one when the clip says to step', () => {
        const clip = slide([0, 1], [0, 10], 'STEP');

        expect(at(clip, 0.25)).toBeCloseTo(0);
        expect(at(clip, 0.99)).toBeCloseTo(0);
        expect(at(clip, 1)).toBeCloseTo(10);
    });

    it('settles on the ends rather than running past them', () => {
        const clip = slide([1, 2], [5, 9]);

        expect(at(clip, -4)).toBeCloseTo(5);
        expect(at(clip, 99)).toBeCloseTo(9);
    });

    it('says once that it does not do curved arrivals, and keeps going', () => {
        catchWarnings();
        const clip: TSkeletalClip = {
            type: 'clip',
            name: 'curved',
            duration: 1,
            channels: [{ skeleton: 0, joint: 0, path: 'translation', sampler: 0 }],
            samplers: [{
                input: Float32Array.from([0, 1]),
                // Three blocks a key: the slope in, the value, the slope out.
                output: Float32Array.from([0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 10, 0, 0, 0, 0, 0]),
                interpolation: 'CUBICSPLINE',
            }],
        };

        expect(at(clip, 0.5)).toBeCloseTo(5);
        sampleClip(clip, 0.7, [[restingJoint()]]);
        expect(warnings.filter((w) => w.includes('CUBICSPLINE'))).toHaveLength(1);
    });
});

describe('carrying on from where it was', () => {
    const clip = slide([0, 1, 2, 3, 4], [0, 10, 20, 30, 40]);

    it('walks forward key by key and lands on the right one every time', () => {
        const pose = [[restingJoint()]];
        for (let t = 0; t <= 4; t += 0.5) {
            sampleClip(clip, t, pose);
            expect(pose[0][0].t[0]).toBeCloseTo(t * 10);
        }
    });

    it('does not skip keys when a frame is long enough to cross several', () => {
        const pose = [[restingJoint()]];
        sampleClip(clip, 0.1, pose);
        // A stall, a tab in the background, a breakpoint: three keys crossed at once.
        sampleClip(clip, 3.5, pose);

        expect(pose[0][0].t[0]).toBeCloseTo(35);
    });

    it('starts over when the clip goes round to the beginning', () => {
        const pose = [[restingJoint()]];
        sampleClip(clip, 3.9, pose);
        sampleClip(clip, 0.2, pose);

        expect(pose[0][0].t[0]).toBeCloseTo(2);
    });

    it('gives the same answer whether it was jumped to or walked to', () => {
        const walked = [[restingJoint()]];
        for (let t = 0; t <= 2.4; t += 0.3) {
            sampleClip(clip, t, walked);
        }
        const jumped = [[restingJoint()]];
        sampleClip(jumped === walked ? clip : clip, 2.4, jumped);

        expect(walked[0][0].t[0]).toBeCloseTo(jumped[0][0].t[0]);
    });
});

describe('a file with more than one rig', () => {
    it('writes to the bone of the skeleton the channel names', () => {
        const clip: TSkeletalClip = {
            type: 'clip',
            name: 'both',
            duration: 1,
            channels: [
                { skeleton: 0, joint: 0, path: 'translation', sampler: 0 },
                { skeleton: 1, joint: 1, path: 'translation', sampler: 0 },
            ],
            samplers: [{ input: Float32Array.from([0, 1]), output: Float32Array.from([0, 0, 0, 7, 0, 0]), interpolation: 'LINEAR' }],
        };
        const poses = [[restingJoint()], [restingJoint(), restingJoint()]];
        sampleClip(clip, 1, poses);

        expect(poses[0][0].t[0]).toBeCloseTo(7);
        expect(poses[1][1].t[0]).toBeCloseTo(7);
        expect(poses[1][0].t[0]).toBeCloseTo(0);
    });

    it('walks past a channel whose bone is not there, instead of falling over', () => {
        const clip: TSkeletalClip = {
            type: 'clip',
            name: 'stale',
            duration: 1,
            channels: [{ skeleton: 4, joint: 9, path: 'translation', sampler: 0 }],
            samplers: [{ input: Float32Array.from([0, 1]), output: Float32Array.from([0, 0, 0, 7, 0, 0]), interpolation: 'LINEAR' }],
        };

        expect(() => sampleClip(clip, 0.5, [[restingJoint()]])).not.toThrow();
    });
});
