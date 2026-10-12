import { newTrackCursor, sampleTrack } from './sample_track';
import { resolveMotionTrack, writeMotionTarget } from './motion_targets';
import type { TBox } from '../box';
import type { TMotionDoc, TMotionTrack } from './types/t_motion_doc';
import type { TMotionTarget } from './motion_targets';
import type { TTrackCursor } from './sample_track';

/**
 * A motion's tracks found on a running scene: each with the field it moves (or `null` when it moves
 * nothing there) and where it was last read.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TBoundTracks = {
    doc: TMotionDoc;
    tracks: Array<{ track: TMotionTrack; target: TMotionTarget | null; cursor: TTrackCursor }>;
    /**
     * Why each track that moves nothing does not, one line each.
     */
    problems: string[];
};

/**
 * Finds every track of a motion on the scenes under `roots`.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const bindMotionTracks = (roots: readonly TBox[], doc: TMotionDoc): TBoundTracks => {
    const problems: string[] = [];
    const tracks = doc.tracks.map((track, i) => {
        const found = resolveMotionTrack(roots, track);
        if (typeof found === 'string') {
            problems.push(`track ${i + 1} (${track.name ?? track.box} ${track.path}): ${found}`);
        }
        return { track, target: typeof found === 'string' ? null : found, cursor: newTrackCursor() };
    });
    return { doc, tracks, problems };
};

/**
 * Puts every field a motion moves where it is at `t` seconds.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const applyMotionTracks = (bound: TBoundTracks, t: number): void => {
    for (const { track, target, cursor } of bound.tracks) {
        if (target !== null) {
            writeMotionTarget(target, sampleTrack(track, t, cursor));
        }
    }
};
