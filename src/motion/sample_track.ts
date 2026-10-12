import { MOTION_EASES } from './motion_eases';
import type { TMotionTrack } from './types/t_motion_doc';

/**
 * Where a track was last read: the key at or before that moment. Kept by whoever plays the track,
 * one per track.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TTrackCursor = { key: number };

/**
 * A new cursor, at the first key.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const newTrackCursor = (): TTrackCursor => ({ key: 0 });

/**
 * The value a track has at `t` seconds.
 *
 * Before its first key it holds the first, after its last the last. Between two numbers it moves
 * along the curve of the later key; a `true` or `false` holds until the next key. The search carries
 * on from where the cursor was, because time nearly always moves forward a little, and going back
 * (a loop, a seek) searches backwards from there.
 *
 * @param track - The track, its keys in order of time.
 * @param t - The moment, in seconds.
 * @param cursor - Where it was read last; moved to where it is read now.
 * @returns The value.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const sampleTrack = (track: TMotionTrack, t: number, cursor: TTrackCursor): number | boolean => {
    const keys = track.keys;
    let i = Math.min(Math.max(cursor.key, 0), keys.length - 1);
    while (i > 0 && keys[i]!.t > t) {
        i -= 1;
    }
    while (i < keys.length - 1 && keys[i + 1]!.t <= t) {
        i += 1;
    }
    cursor.key = i;

    const from = keys[i]!;
    const to = keys[i + 1];
    if (to === undefined || t <= from.t || typeof from.v !== 'number' || typeof to.v !== 'number') {
        return from.v;
    }
    const progress = (t - from.t) / (to.t - from.t);
    const ease = MOTION_EASES[to.ease ?? 'linear'];
    return from.v + (to.v - from.v) * ease(progress);
};
