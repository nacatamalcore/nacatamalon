import { slerp, lerp3 } from './quat';
import type { TJointPose } from '../../animation';

// @ai internal skinning math, not exported from src/index.ts.

/**
 * Blends two local poses joint-by-joint into `out`, weight `t` in `[0, 1]` mixing
 * from `a` (t=0) toward `b` (t=1). Translation and scale lerp; rotation slerps along
 * the shortest arc: the correct way to cross-fade skeletal animation, because the
 * blend happens in local TRS space ("the pose is the boundary") before the palette is
 * built, so a transition looks like the joints rotating between the two clips rather
 * than their skinned vertices lerping straight through the mesh. `out` may alias `a`
 * or `b`. All three arrays must share the skeleton's joint count.
 */
export const blendPoses = (a: TJointPose[], b: TJointPose[], t: number, out: TJointPose[]): void => {
    for (let j = 0; j < out.length; j++) {
        const pa = a[j];
        const pb = b[j];
        const po = out[j];
        lerp3(pa.t, pb.t, t, po.t);
        lerp3(pa.s, pb.s, t, po.s);
        slerp(pa.r, pb.r, t, po.r);
    }
};
