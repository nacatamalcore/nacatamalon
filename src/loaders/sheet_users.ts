import type { TLoadedAtlas } from './atlas/types/t_loaded_atlas';

/**
 * Something that uses a sheet it did not load for the game: an effect, from a file or written in
 * code, or a map. `bound` is an effect's emitters.
 */
type TSheetUser = { status: string; bound?: readonly unknown[] };

/**
 * Who uses each sheet, from the moment they ask for it.
 *
 * Kept here rather than found by looking through the game's caches when one of them goes, because
 * not every user is in a cache: an effect written in code never is, and a map is only given its sheet
 * once the sheet has landed. Looking only in the caches let a file that went take a sheet still
 * wanted by either.
 */
const users = new WeakMap<TLoadedAtlas, Set<TSheetUser>>();

/**
 * Users that count only while something draws them: effects written in code. Nothing lets one of
 * those go (it is in no cache, so `releaseAsset` never sees it), so what ends its hold on a sheet is
 * its last emitter going. Held weakly, so being one keeps nothing alive.
 */
const whileDrawn = new WeakSet<TSheetUser>();

/**
 * Sheets something let go of while another still used them, with what finishes letting them go:
 * when the last effect written in code on one stops being drawn, nothing else would.
 */
const waiting = new WeakMap<TLoadedAtlas, () => void>();

/**
 * Notes that `by` uses `sheet`. `drawn` for one that counts only while it has emitters.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const noteSheetUser = (sheet: TLoadedAtlas, by: TSheetUser, drawn = false): void => {
    let held = users.get(sheet);
    if (held === undefined) {
        held = new Set();
        users.set(sheet, held);
    }
    held.add(by);
    if (drawn) {
        whileDrawn.add(by);
    }
};

/**
 * Whether `user` still wants its sheet: not let go of, and, for one that counts only while drawn,
 * with an emitter.
 */
const wants = (user: TSheetUser): boolean =>
    user.status !== 'released' && (!whileDrawn.has(user) || (user.bound?.length ?? 0) > 0);

/**
 * Takes `by` off `sheet` once it no longer wants it: an effect written in code whose last emitter
 * has gone. A sheet that was let go of while it was drawn goes now, if nothing else uses it.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const dropIdleSheetUser = (sheet: TLoadedAtlas, by: TSheetUser): void => {
    if (!wants(by)) {
        users.get(sheet)?.delete(by);
        const finish = waiting.get(sheet);
        if (finish !== undefined) {
            waiting.delete(sheet);
            // Asked again from the start: what else may use it is decided there, not here.
            finish();
        }
    }
};

/**
 * Takes `by` off `sheet` for good: a map let go of, or one that could not be loaded. A sheet the game
 * let go of while that map used it goes now, if nothing else uses it, since a map never takes its
 * sheet with it.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const stopUsingSheet = (sheet: TLoadedAtlas, by: TSheetUser): void => {
    users.get(sheet)?.delete(by);
    const finish = waiting.get(sheet);
    if (finish !== undefined) {
        waiting.delete(sheet);
        finish();
    }
};

/**
 * Notes that letting go of `sheet` waits on something still using it, and what to do to try again
 * once an effect written in code on it stops being drawn.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const releaseWhenUnused = (sheet: TLoadedAtlas, finish: () => void): void => {
    waiting.set(sheet, finish);
};

/**
 * Takes `by` off `sheet`, and says whether anything still wanting it, other than what was let go of,
 * is left.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const leaveSheet = (sheet: TLoadedAtlas, by: TSheetUser): boolean => {
    const held = users.get(sheet);
    if (held === undefined) {
        return false;
    }
    held.delete(by);
    for (const user of held) {
        if (!wants(user)) {
            held.delete(user);
        }
    }
    return held.size > 0;
};

/**
 * Everything noted as using `sheet`, for a test to see that nothing gone is still held.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const sheetUsersOf = (sheet: TLoadedAtlas): TSheetUser[] => [...(users.get(sheet) ?? [])];
