import { isGone } from '../game/loop/runHookUpdates';
import { hitboxRect, rectsOverlap } from './hitbox_shape';
import type { TTurnedRect } from './hitbox_shape';
import type { TBox } from '../box/types/t_box';
import type { THitbox } from './types/t_hitbox';

type TEntry = { box: TBox; hitbox: THitbox; rect: TTurnedRect };

/**
 * Compares the groups every `useOverlap` of one scene names, once its updates are over, and calls
 * each listener once for every pair of objects touching.
 *
 * **Every frame they touch, not only the first.** A character blinking inside an enemy after a hit
 * has to be hurt again once the blinking ends, and a listener told only when touching began would
 * never hear of it. A bullet or a coin is destroyed on its first call anyway.
 *
 * Each object is measured once, where the updates left it. A listener that destroys one of the two
 * (or anything above it) is not called with it again this frame, so a bullet hits one enemy and
 * not the three behind it; one that turns a hitbox off is obeyed at once, by the pairs still to come.
 *
 * @param touching The boxes the update walk noted: those with hitboxes and those listening.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const runOverlaps = (touching: readonly TBox[]): void => {
    if (!touching.some((box) => box.overlapCallbacks.length > 0)) {
        return;
    }

    const groups = new Map<string, TEntry[]>();
    for (const box of touching) {
        if (isGone(box)) {
            continue;
        }
        for (const hitbox of box.hitboxes) {
            if (!hitbox.enabled) {
                continue;
            }
            const entries = groups.get(hitbox.group) ?? [];
            entries.push({ box, hitbox, rect: hitboxRect(box, hitbox) });
            groups.set(hitbox.group, entries);
        }
    }

    for (const owner of touching) {
        for (const listener of [...owner.overlapCallbacks]) {
            const first = groups.get(listener.a);
            const second = groups.get(listener.b);
            if (first === undefined || second === undefined) {
                continue;
            }
            const same = listener.a === listener.b;
            // One call for a pair of objects, however many of their hitboxes touch.
            const called = new Set<string>();
            for (const one of first) {
                for (const other of second) {
                    if (one.box === other.box) {
                        continue;
                    }
                    const key = same && other.box.id < one.box.id ? `${other.box.id}:${one.box.id}` : `${one.box.id}:${other.box.id}`;
                    if (called.has(key) || !rectsOverlap(one.rect, other.rect)) {
                        continue;
                    }
                    // Asked at the moment of calling: an earlier call may have destroyed either, or
                    // the listener, or turned a hitbox off.
                    if (!one.hitbox.enabled || !other.hitbox.enabled || isGone(one.box) || isGone(other.box) || isGone(owner)) {
                        continue;
                    }
                    called.add(key);
                    listener.callback(one.box, other.box);
                }
            }
        }
    }
};
