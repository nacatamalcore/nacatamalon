// Straight from its file: the box barrel reaches the store, and the store creates the pointer.
import { rootOf } from '../box/root_of';
import { ownerOfDrawable } from '../box/drawable_owner';
import type { TBox } from '../box';
import type { TSpriteEvents } from './types/t_sprite_events';
import type { TPointerPicture } from './types/t_pointer_picture';

/**
 * What can react to the pointer: a sprite, a text, a nine-slice or a set of shapes by itself, or a
 * whole object, which reacts as one thing to a pointer over any of its pieces or its children's.
 *
 * @internal
 */
export type TPointerTarget = TPointerPicture | TBox;

/**
 * Something that reacts to the pointer: the part of the scene it belongs to, and every set of events
 * connected to it, in the order they were connected. It listens for as long as one is left.
 *
 * @internal
 */
export type TListeningSprite = { box: TBox; connections: TSpriteEvents[] };

/**
 * Something that waits for a click on boxes told by what they are rather than one by one (a rule's
 * name or tag): which boxes, and what is done when one is clicked.
 *
 * @internal
 */
export type TClickClaim = { matches(box: TBox): boolean; click(box: TBox): void };

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

const NO_CLAIMS: ReadonlySet<TClickClaim> = new Set();

const claimed = (box: TBox, claims: ReadonlySet<TClickClaim>): boolean => {
    const scene = rootOf(box);
    if (scene.paused || scene.held) return false;
    for (const claim of claims) if (claim.matches(box)) return true;
    return false;
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
export const topmostListening = (hits: ReadonlyArray<TPointerPicture>, listening: Map<TPointerTarget, TListeningSprite>, claims: ReadonlySet<TClickClaim> = NO_CLAIMS): TPointerTarget | null =>
    answeringPointer(hits, listening, claims).target;

/**
 * The same, with the box of the picture that decided: what a claim is looked for from, up. A picture
 * somebody claims covers what is below as one that listens does, and takes nothing from what listens
 * above it: a rule on a button's label leaves the button a button.
 *
 * @internal
 */
export const answeringPointer = (hits: ReadonlyArray<TPointerPicture>, listening: Map<TPointerTarget, TListeningSprite>, claims: ReadonlySet<TClickClaim>): { target: TPointerTarget | null; from: TBox | null } => {
    for (const sprite of hits) {
        const from: TBox | null = ownerOfDrawable(sprite)?.box ?? null;
        const own = listening.get(sprite);
        let target: TPointerTarget | null = null;
        if (own !== undefined) {
            if (answers(sprite, own, listening)) target = sprite;
            else continue;
        }
        let isClaimed = false;
        for (let box = from; box !== null; box = box.parent) {
            if (target === null) {
                const entry = listening.get(box);
                if (entry !== undefined && answers(box, entry, listening)) target = box;
            }
            isClaimed ||= claims.size > 0 && !box.destroyed && claimed(box, claims);
        }
        if (target !== null || isClaimed) return { target, from };
    }
    return { target: null, from: null };
};
