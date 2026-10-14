import { bindMotionTracks } from './motion_tracks';
import { sampleTrack } from './sample_track';
import { writeMotionTarget } from './motion_targets';
import type { TRuntimeStore } from '../store';
import type { TMotionDoc } from './types/t_motion_doc';

/**
 * What a preview did: how many tracks moved something, and why each of the others did not.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TMotionPreview = {
    moved: number;
    problems: string[];
};

/**
 * For each game, the value every field a preview has touched had before the first preview touched
 * it: what `endMotionPreview` puts back. Weak, so a game thrown away takes its entry with it.
 */
const before = new WeakMap<TRuntimeStore, Map<Record<string, unknown>, Map<string, unknown>>>();

/**
 * Puts the running scenes where a motion has them at `t` seconds, without playing it: no events
 * happen and nothing moves on by itself. What an editor does while its time cursor is dragged.
 *
 * The first time a field is touched, what it had is kept, and `endMotionPreview` puts it back. Called
 * again, it moves the same fields to another moment.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const previewMotion = (store: TRuntimeStore, doc: TMotionDoc, t: number): TMotionPreview => {
    const bound = bindMotionTracks(store.get('world').scenes, doc, store.get('post').effects);
    let kept = before.get(store);
    if (kept === undefined) {
        kept = new Map();
        before.set(store, kept);
    }
    let moved = 0;
    for (const { track, target, cursor } of bound.tracks) {
        if (target === null) continue;
        let fields = kept.get(target.holder);
        if (fields === undefined) {
            fields = new Map();
            kept.set(target.holder, fields);
        }
        if (!fields.has(target.field)) {
            fields.set(target.field, target.holder[target.field]);
        }
        writeMotionTarget(target, sampleTrack(track, t, cursor));
        moved += 1;
    }
    return { moved, problems: bound.problems };
};

/**
 * Puts back every field a preview touched, as it was before the first one, and says how many.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const endMotionPreview = (store: TRuntimeStore): number => {
    const kept = before.get(store);
    if (kept === undefined) return 0;
    let restored = 0;
    for (const [holder, fields] of kept) {
        for (const [field, value] of fields) {
            if (value === undefined) {
                delete holder[field];
            } else {
                holder[field] = value;
            }
            restored += 1;
        }
    }
    before.delete(store);
    return restored;
};
