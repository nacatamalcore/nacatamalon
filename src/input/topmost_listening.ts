// Straight from its file: the box barrel reaches the store, and the store creates the pointer.
import { rootOf } from '../box/root_of';
import { ownerOfDrawable } from '../box/drawable_owner';
import type { TBox } from '../box';
import type { TSprite } from '../gameobjects/sprite/types/t_sprite';
import type { TText } from '../gameobjects/text/types/t_text';
import type { TNineSlice } from '../gameobjects/nine_slice/types/t_nine_slice';
import type { TSpriteEvents } from './types/t_sprite_events';

/**
 * What can react to the pointer: a sprite, a text or a nine-slice by itself, or a whole object, which
 * reacts as one thing to a pointer over any of its pieces or its children's.
 *
 * @internal
 */
export type TPointerTarget = TSprite | TText | TNineSlice | TBox;

/**
 * Something that reacts to the pointer: the part of the scene it belongs to, and every set of events
 * connected to it, in the order they were connected. It listens for as long as one is left.
 *
 * @internal
 */
export type TListeningSprite = { box: TBox; connections: TSpriteEvents[] };

/**
 * Whether a target is still worth answering: not destroyed, and in a scene that runs and shows.
 */
const answers = (target: TPointerTarget, entry: TListeningSprite, listening: Map<TPointerTarget, TListeningSprite>): boolean => {
    if (target.destroyed) {
        listening.delete(target);
        return false;
    }
    const scene = rootOf(entry.box);
    return !scene.paused && !scene.held;
};

/**
 * What answers the pointer on top, from hits already ordered top first.
 *
 * For each hit, the drawable itself if it listens, or else the nearest object it belongs to that
 * listens (its own box, or one above it). The first hit that has one decides, so the more specific
 * wins: a listening sprite inside a listening object answers for itself.
 *
 * Only what listens counts, so a shadow or a glow over a button does not steal its click, unless it
 * belongs to an object that listens, in which case it is part of that object. What is in a paused
 * scene does not count either: it neither reacts nor covers what is below, and the same goes for a
 * scene held behind a transition, which is not even being drawn. Destroyed targets found on the way
 * are forgotten here.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const topmostListening = (hits: ReadonlyArray<TSprite | TText | TNineSlice>, listening: Map<TPointerTarget, TListeningSprite>): TPointerTarget | null => {
    for (const sprite of hits) {
        const own = listening.get(sprite);
        if (own !== undefined) {
            if (answers(sprite, own, listening)) return sprite;
            continue;
        }
        let box: TBox | null = ownerOfDrawable(sprite)?.box ?? null;
        while (box !== null) {
            const entry = listening.get(box);
            if (entry !== undefined && answers(box, entry, listening)) return box;
            box = box.parent;
        }
    }
    return null;
};
