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

/**
 * One bone moved along x through curved keys, each `[slope in, value, slope out]`.
 */
const curved = (times: number[], keys: Array<[number, number, number]>): TSkeletalClip => ({
    type: 'clip',
    name: 'curved',
    duration: times[times.length - 1],
    channels: [{ skeleton: 0, joint: 0, path: 'translation', sampler: 0 }],
    samplers: [{
        input: Float32Array.from(times),
        output: Float32Array.from(keys.flatMap(([into, value, out]) => [into, 0, 0, value, 0, 0, out, 0, 0])),
        interpolation: 'CUBICSPLINE',
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

    it('walks a curved channel along the curve its slopes make, and says nothing about it', () => {
        catchWarnings();
        // Three blocks a key: the slope in, the value, the slope out. Flat slopes: it leaves and
        // arrives gently, slower than an even walk at the ends.
        const flat = curved([0, 1], [[0, 0, 0], [0, 10, 0]]);
        expect(at(flat, 0)).toBeCloseTo(0, 5);
        expect(at(flat, 0.25)).toBeCloseTo(10 * (-2 / 64 + 3 / 16), 5);
        expect(at(flat, 0.5)).toBeCloseTo(5, 5);
        expect(at(flat, 1)).toBeCloseTo(10, 5);
        expect(warnings).toEqual([]);
    });

    it('scales a slope, which is per second, by the time between the two keys', () => {
        // Leaving at one a second over two seconds, arriving flat, both keys at 0.
        const sloped = curved([0, 2], [[0, 0, 1], [0, 0, 0]]);
        // Half way, the slope's share of the curve is an eighth, times two seconds.
        expect(at(sloped, 1)).toBeCloseTo(0.125 * 2, 5);
    });

    it('holds the value of the first and the last key outside them', () => {
        const flat = curved([1, 2], [[5, 3, 5], [5, 7, 5]]);
        expect(at(flat, 0)).toBeCloseTo(3, 5);
        expect(at(flat, 3)).toBeCloseTo(7, 5);
    });

    it('curves a turn number by number and brings it back to a turn', () => {
        const half = Math.SQRT1_2;
        const clip: TSkeletalClip = {
            type: 'clip',
            name: 'curved turn',
            duration: 1,
            channels: [{ skeleton: 0, joint: 0, path: 'rotation', sampler: 0 }],
            samplers: [{
                input: Float32Array.from([0, 1]),
                // Unturned, then a quarter turn about z, both with flat slopes.
                output: Float32Array.from([0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, half, half, 0, 0, 0, 0]),
                interpolation: 'CUBICSPLINE',
            }],
        };
        const poses = [[restingJoint()]];
        sampleClip(clip, 0.5, poses);
        const [x, y, z, w] = poses[0][0].r;
        expect(Math.hypot(x, y, z, w)).toBeCloseTo(1, 6);
        // Half way along flat slopes is half way: an eighth of a turn.
        expect(z).toBeCloseTo(Math.sin(Math.PI / 8), 5);
        expect(w).toBeCloseTo(Math.cos(Math.PI / 8), 5);
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
