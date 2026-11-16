import { describe, expect, it } from 'bun:test';
import { computeModelMatrix } from '../src/render/shared/compute_mvp_3d';
import { transformForward } from '../src/render/shared/transform_basis';
import type { TTransform3d } from '../src/gameobjects/types/t_transform_3d';

/**
 * Which way each 3D turn goes, as `TTransform3d` and `llms.txt` say it: the convention every game
 * written for this engine leans on, so it cannot change without this saying so.
 */

const STILL: TTransform3d = { x: 0, y: 0, z: 0, rotation: 0, rotationX: 0, rotationY: 0, scaleX: 1, scaleY: 1, scaleZ: 1, quaternion: null };
const QUARTER = Math.PI / 2;

const turned = (turn: Partial<TTransform3d>, v: [number, number, number]) => {
    const m = computeModelMatrix({ ...STILL, ...turn });
    return [0, 1, 2].map((r) => Math.round((m[r]! * v[0] + m[4 + r]! * v[1] + m[8 + r]! * v[2]) * 1e6) / 1e6 + 0);
};

describe('which way a 3D turn goes', () => {
    it('turns left as seen from above with rotationY', () => {
        expect(turned({ rotationY: QUARTER }, [1, 0, 0])).toEqual([0, 0, -1]);
        expect(turned({ rotationY: QUARTER }, [0, 0, -1])).toEqual([-1, 0, 0]);
    });

    it('looks up with rotationX', () => {
        expect(turned({ rotationX: QUARTER }, [0, 0, -1])).toEqual([0, 1, 0]);
        expect(turned({ rotationX: QUARTER }, [0, 1, 0])).toEqual([0, 0, 1]);
    });

    it('turns about z against the clock as the camera sees it with rotation', () => {
        expect(turned({ rotation: QUARTER }, [1, 0, 0])).toEqual([0, 1, 0]);
    });

    it('turns Y first, so rotationX looks up from wherever rotationY turned to', () => {
        const s = Math.SQRT1_2;
        expect(turned({ rotationY: QUARTER, rotationX: QUARTER / 2 }, [0, 0, -1])).toEqual([-s, s, 0].map((n) => Math.round(n * 1e6) / 1e6));
    });

    it('turns a camera the same way: an unturned one looks along -z', () => {
        const forward = (turn: Partial<TTransform3d>) => {
            const f = transformForward({ ...STILL, ...turn });
            return [f.x, f.y, f.z].map((n) => Math.round(n * 1e6) / 1e6 + 0);
        };
        expect(forward({})).toEqual([0, 0, -1]);
        expect(forward({ rotationY: QUARTER })).toEqual([-1, 0, 0]);
        expect(forward({ rotationX: QUARTER })).toEqual([0, 1, 0]);
    });
});
