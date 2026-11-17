import { ownerOfDrawable } from '../../../box/drawable_owner';
import { mayHaveOverlays } from '../../../post/count_overlays';
import { isOverlayPlace } from '../../../post/overlay_place';
import { splashOf } from '../../../splash/behind_splash';
import { isDebugDrawable } from '../../../debug/draw_debug';
import type { TBox } from '../../../box';
import type { TDrawable } from '../../../gameobjects/types';
import type { TPostEffect } from '../../../post/types/t_post_effect';
import type { TPostCut } from '../../../render/interface';
import type { TRuntimeStore } from '../../../store';
import type { TMaskLevel } from '../../../mask/mask_walk';

/**
 * Where this frame's chain stops for what is drawn over its effects (`useOverlay`): the last effect
 * that runs under it, and what each box was found to be, worked out once a frame.
 *
 * @internal
 */
export type TOverlayFrame = {
    /** The last effect of the chain that runs under what is drawn over the effects. */
    readonly through: number;
    /** Per box: whether it or a box above it is drawn over the effects. */
    readonly boxes: Map<TBox, boolean>;
};

/**
 * What a pass's walk notes for what is drawn over the effects, one entry per drawable like its other
 * lists: the effect it is drawn after, or `-1` for under them all, and the box it was found on, for
 * saying what is in front of what.
 *
 * @internal
 */
export type TOverWalk = { at: number[]; box: Array<TBox | null> };

/**
 * The chain's place for what is drawn over the effects, and where it stops for it: `null` for a game
 * with nothing marked, nothing to run, no effect under the place, or a scene change running, which all
 * draw as they always did.
 *
 * The place is the chain's `{ overlay: true }` entry, or after every effect when there is none.
 *
 * **Not while a scene changes.** Its cover goes first in the chain, and a crossing one keeps a picture
 * of the scene going out from there: moved after some effects, a change of style or of the place
 * halfway would run one of them twice over that picture, or not at all. So the cover stays where it
 * always was, and for as long as the change runs an overlay is drawn with everything else, under the
 * effects and the cover, back over them once the change is over. The same while the engine's splash is
 * on, which is drawn over the game as it fades out.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const overlayFrameOf = (store: TRuntimeStore, chain: TPostEffect[] | null): { chain: TPostEffect[] | null; frame: TOverlayFrame | null } => {
    const { effects, enabled } = store.get('post');
    if (chain === null || !enabled || !mayHaveOverlays(store) || chain[0]!.source === 'transition' || splashOf(store) !== null) {
        return { chain, frame: null };
    }
    // How many of the effects that run come before the place: the chain is built from these, in
    // this order (`buildPostChain`), so it is where the place falls in it.
    let running = 0;
    let place = -1;
    for (const effect of effects) {
        if (isOverlayPlace(effect)) {
            if (effect.enabled && place < 0) {
                place = running;
            }
            continue;
        }
        if (effect.enabled && effect.fragment !== null) {
            running++;
        }
    }
    const under = place < 0 ? running : place;
    return under === 0 ? { chain, frame: null } : { chain, frame: { through: under - 1, boxes: new Map() } };
};

/**
 * What a debug drawing is noted as: neither under the effects nor over them, but drawn where it falls
 * among the rest. It is on top of its scene to be seen, and must not change what the game looks like.
 */
const LOOSE = -2;

/**
 * Whether `box` or a box above it is drawn over the effects.
 */
const isOverlay = (frame: TOverlayFrame, box: TBox): boolean => {
    const known = frame.boxes.get(box);
    if (known !== undefined) {
        return known;
    }
    let found = false;
    for (let at: TBox | null = box; at !== null; at = at.parent) {
        if (at.overlay) {
            found = true;
            break;
        }
    }
    frame.boxes.set(box, found);
    return found;
};

/**
 * Notes, for every drawing of a pass not noted yet, whether it asks to be drawn over the effects, by
 * the box it was found on or one above it. Called once a scene's drawings are sorted, before what
 * stands in for an emitter, a map layer, a shape or lines is made and before a text is its letters,
 * which take what it was noted. `boxes`, counted from `start`, is the box the walk found each on.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const noteOver = (
    frame: TOverlayFrame,
    walk: TOverWalk,
    drawables: ReadonlyArray<unknown>,
    boxes: ReadonlyArray<TBox> | null = null,
    start = 0,
    levels: ReadonlyArray<TMaskLevel | null> | null = null,
): void => {
    for (let i = walk.at.length; i < drawables.length; i++) {
        // The box the walk found it on, which is where it is drawn from: a map from a file has no
        // maker of its own and can be laid in two places at once. Where it was made otherwise.
        const box = boxes?.[i - start] ?? ownerOfDrawable(drawables[i] as TDrawable)?.box ?? null;
        if (isDebugDrawable(drawables[i] as TDrawable)) {
            walk.at.push(LOOSE);
            walk.box.push(box);
            continue;
        }
        let over = box !== null && isOverlay(frame, box);
        // A filter or a soft mask draws what its object holds as one picture, in one place: an overlay
        // inside one whose object is not stays with it, under the effects.
        if (over) {
            for (let level = levels?.[i] ?? null; level !== null; level = level.parent) {
                const layered = level.filter !== null || level.mask?.soft === true;
                if (layered && level.box !== null && !isOverlay(frame, level.box)) {
                    over = false;
                    sayInside(box!, level.box, level.filter !== null ? 'filter' : 'soft mask');
                    break;
                }
            }
        }
        walk.at.push(over ? frame.through : -1);
        walk.box.push(box);
    }
};

/**
 * Says once that an overlay stays under the effects because the filter or soft mask it is in is on a
 * box that is not one.
 */
const sayInside = (box: TBox, holder: TBox, what: string): void => {
    if (told.has(box)) {
        return;
    }
    told.add(box);
    console.warn(
        `[NacatamalOn] useOverlay: '${box.name}' is drawn over the screen effects, but it is inside the ${what} of '${holder.name}', ` +
        `which is not, and a ${what} draws what it holds as one picture, in one place: it stays under them with it. Make '${holder.name}' an overlay too.`,
    );
};

/** The boxes already told that they stay under the effects, so each is said once. */
const told = new WeakSet<TBox>();

/**
 * Settles what is drawn over the effects in a pass, in place: what asked for it when nothing after
 * it is under them, and nothing otherwise, since drawing it later would put it in front of what is in
 * front of it. Each box that stays under is said once.
 *
 * Afterwards the list only grows from the start of the pass to its end, which is what lets it be cut
 * (`cutsOf`).
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const settleOver = (walk: TOverWalk): void => {
    const { at, box } = walk;
    let least = Infinity;
    let leastBy = -1;
    for (let i = at.length - 1; i >= 0; i--) {
        // A debug drawing holds nothing under: it goes with what is drawn before it, below.
        if (at[i] === LOOSE) {
            continue;
        }
        if (at[i]! > least) {
            at[i] = -1;
            const who = box[i] ?? null;
            if (who !== null && !told.has(who)) {
                told.add(who);
                const front = box[leastBy] ?? null;
                console.warn(
                    `[NacatamalOn] useOverlay: '${who.name}' is drawn over the screen effects, but ${front === null ? 'something' : `'${front.name}'`}, ` +
                    'which is not, is drawn in front of it, so it stays under them, in its place. Draw it in front of that (a higher ' +
                    'zIndex, or a scene started after), or make that an overlay too.',
                );
            }
        }
        if (at[i]! < least) {
            least = at[i]!;
            leastBy = i;
        }
    }
    let before = -1;
    for (let i = 0; i < at.length; i++) {
        if (at[i] === LOOSE) {
            at[i] = before;
        } else {
            before = at[i]!;
        }
    }
};

/**
 * Where a pass's list, settled, goes from under the effects to over some of them: before each such
 * drawing the chain runs up to the effect it is drawn after. `undefined` when nothing is over any.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const cutsOf = (at: readonly number[]): TPostCut[] | undefined => {
    let cuts: TPostCut[] | undefined;
    let now = -1;
    for (let i = 0; i < at.length; i++) {
        const here = at[i]!;
        if (here > now) {
            (cuts ??= []).push({ at: i, through: here });
            now = here;
        }
    }
    return cuts;
};
