/**
 * Who holds each loaded thing: a picture, a sheet, an effect another one sets off.
 *
 * This file only writes down "X holds Y" and answers whether anyone still holds Y, and who. It frees
 * nothing on the card, looks in no cache and knows nothing of which things may go: that is
 * `release_asset.ts`. What it does keep is what `releaseAsset` left waiting on a thing still held,
 * and it calls that when the last holder lets go, without knowing what it is.
 *
 * Before, five places kept this each in their own way (who uses each sheet, who wears each picture,
 * who sets off each effect, a look through the caches, and a mark for what the game asked for), each
 * with its own copy of the same rule, and most of the bugs came from a gap between them. It is one
 * table now, and the rule is written once.
 *
 * A holder stops counting once it is let go of, or, for one that holds only while it is drawn (an
 * effect written in code, or one taken out of the game), once it has no emitter left.
 */

/**
 * Something that holds: a loaded file, an effect written in code, a map, or the game itself.
 *
 * @internal
 */
type THolder = { readonly status?: string; readonly bound?: readonly unknown[] };

/**
 * What a wait is for: letting the thing go, or a holder letting go of what it holds once nothing
 * sets it off any more. One of each per thing, so asking again does not leave two behind.
 *
 * @internal
 */
type TWaitFor = 'release' | 'forget';

/**
 * The game, as a holder: what it asked for with a loader of its own stays until it lets go of it,
 * whatever else names it. It never stops counting.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const GAME: THolder = Object.freeze({});

/** Who holds each thing. */
const holdersByThing = new WeakMap<object, Set<THolder>>();

/** What each holder holds, so one leaving lets go of everything at once. */
const thingsByHolder = new WeakMap<THolder, Set<object>>();

/** Holders that count only while they have an emitter. Held weakly, so being one keeps nothing alive. */
const whileDrawn = new WeakSet<THolder>();

/** Holders that hold nothing for anyone any more, but still know what they took: a model that failed. */
const notCounting = new WeakSet<THolder>();

/**
 * What is waiting on each thing until nobody holds it, one per kind of wait, with the holder that
 * wait does not count, if any.
 */
const waits = new WeakMap<object, Map<TWaitFor, { finish: () => void; except: THolder | undefined }>>();

/**
 * Whether `holder` still counts: the game always; anyone else until let go of, and, for one that
 * holds only while drawn, while it has an emitter.
 */
const counts = (holder: THolder): boolean =>
    holder === GAME
    || (holder.status !== 'released' && !notCounting.has(holder)
        && (!whileDrawn.has(holder) || (holder.bound?.length ?? 0) > 0));

/**
 * Whether anyone that counts, other than `except`, holds `thing`. Holders that no longer count are
 * taken off it on the way; what they took is still known (`heldBy`) until they let go of it.
 */
const isHeld = (thing: object, except?: THolder): boolean => {
    const holders = holdersByThing.get(thing);
    if (holders === undefined) {
        return false;
    }
    let held = false;
    for (const holder of holders) {
        if (!counts(holder)) {
            holders.delete(holder);
        } else if (holder !== except) {
            held = true;
        }
    }
    return held;
};

/**
 * Calls what waits on `thing` and finds nobody holding it any more. Each wait is taken off before it
 * runs, so one that finds the thing held again and waits once more is kept.
 */
const settle = (thing: object): void => {
    const waiting = waits.get(thing);
    if (waiting === undefined) {
        return;
    }
    for (const [waitFor, { finish, except }] of [...waiting]) {
        if (!isHeld(thing, except) && waiting.get(waitFor)?.finish === finish) {
            waiting.delete(waitFor);
            finish();
        }
    }
    if (waiting.size === 0 && waits.get(thing) === waiting) {
        waits.delete(thing);
    }
};

/**
 * Notes that `by` holds `thing`. Holding it twice is holding it once, and one already let go of takes
 * nothing. `whileDrawn` makes `by` count only while it has an emitter, from now on.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const hold = (thing: object, by: THolder, options?: { whileDrawn?: boolean }): void => {
    if (by !== GAME && by.status === 'released') {
        return;
    }
    if (options?.whileDrawn === true) {
        whileDrawn.add(by);
    }
    let holders = holdersByThing.get(thing);
    if (holders === undefined) {
        holders = new Set();
        holdersByThing.set(thing, holders);
    }
    holders.add(by);
    // The game is held on to by nothing that ends, so it keeps no list of its own: what it holds is
    // known only from each thing's side, which goes with the thing, and the game holds nothing in
    // memory after it is gone. Nothing ever asks what the game holds.
    if (by === GAME) {
        return;
    }
    let things = thingsByHolder.get(by);
    if (things === undefined) {
        things = new Set();
        thingsByHolder.set(by, things);
    }
    things.add(thing);
};

/**
 * Takes `by` off `thing`. If nobody that counts holds it any more, what waits on it runs.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const drop = (thing: object, by: THolder): void => {
    holdersByThing.get(thing)?.delete(by);
    thingsByHolder.get(by)?.delete(thing);
    settle(thing);
};

/**
 * Takes `by` off everything it holds, as when it leaves the game: what waits on any of them runs once
 * nobody that counts holds it.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const dropAll = (by: THolder): void => {
    const things = thingsByHolder.get(by);
    if (things === undefined) {
        return;
    }
    thingsByHolder.delete(by);
    for (const thing of things) {
        holdersByThing.get(thing)?.delete(by);
    }
    for (const thing of things) {
        settle(thing);
    }
};

/**
 * Lets go of everything `by` holds if it no longer counts: one that holds only while drawn, whose
 * last emitter has gone. It takes them again with `hold` when it is drawn again.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const dropIdle = (by: THolder): void => {
    if (!counts(by)) {
        dropAll(by);
    }
};

/**
 * Makes `by` hold nothing for anyone from now on, while still knowing what it took, so letting it go
 * later finds them: a model that failed on the way, after fetching some of its pictures. What waits
 * on those may run now.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const stopCounting = (by: THolder): void => {
    notCounting.add(by);
    // Off each thing now, so who holds it reads the same whenever it is asked; still known from its
    // own side. A copy: what runs may take or let go of more.
    for (const thing of [...(thingsByHolder.get(by) ?? [])]) {
        holdersByThing.get(thing)?.delete(by);
        settle(thing);
    }
};

/**
 * Makes `by` count, from now on, only while it has an emitter: an effect taken out of the game,
 * which nothing lets go of any more.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const holdOnlyWhileDrawn = (by: THolder): void => {
    whileDrawn.add(by);
};

/**
 * Whether anyone that counts, other than `leaving`, holds `thing`. `leaving` may be `GAME`, to ask
 * whether anything else does.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const heldByOthers = (thing: object, leaving?: THolder): boolean => isHeld(thing, leaving);

/**
 * Runs `finish` now if nobody that counts, other than `except`, holds `thing`, or else once the last
 * of them lets go. A second wait of the same kind on the same thing takes the place of the first.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const whenFree = (thing: object, waitFor: TWaitFor, finish: () => void, except?: THolder): void => {
    if (!isHeld(thing, except)) {
        // One of the same kind asked before is this one's to finish now.
        waits.get(thing)?.delete(waitFor);
        finish();
        return;
    }
    let waiting = waits.get(thing);
    if (waiting === undefined) {
        waiting = new Map();
        waits.set(thing, waiting);
    }
    waiting.set(waitFor, { finish, except });
};

/**
 * Everyone noted as holding `thing`, whether they still count or not.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const holdersOf = (thing: object): THolder[] => [...(holdersByThing.get(thing) ?? [])];

/**
 * Everything `by` is noted as holding.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const heldBy = (by: THolder): object[] => [...(thingsByHolder.get(by) ?? [])];
