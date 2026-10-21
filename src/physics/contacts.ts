import { getPhysicsProviders } from './physics_provider';
import type { TBox } from '../box';

/**
 * What each box's physics body is touching now, as the simulation says: what a collision asked by
 * component or by tag counts besides its rectangles, so a body meets what it touches whether that
 * is told by a hitbox or by the physics.
 */
const contacts = new WeakMap<TBox, Set<TBox>>();

/** The boxes whose contacts are already being told. */
const watched = new WeakSet<TBox>();

const NONE: ReadonlySet<TBox> = new Set();

/**
 * Notes that `a` and `b` started or stopped touching, both ways.
 *
 * @internal
 */
export const noteContact = (a: TBox, b: TBox, started: boolean): void => {
    for (const [one, other] of [[a, b], [b, a]] as const) {
        let set = contacts.get(one);
        if (set === undefined) {
            set = new Set();
            contacts.set(one, set);
        }
        if (started) set.add(other);
        else set.delete(other);
    }
};

/**
 * Lets go of everything `box` touched, both ways: what is destroyed is not touching anything, and a
 * floor that outlives two hundred crates does not keep them.
 */
const forgetContacts = (box: TBox): void => {
    const set = contacts.get(box);
    if (set === undefined) return;
    for (const other of set) contacts.get(other)?.delete(box);
    contacts.delete(box);
};

/** Whether `box` still has a body in a simulation: one taken away touches nothing, whatever it touched. */
const hasBody = (box: TBox): boolean => {
    if (box.destroyed || box.physics === null) return false;
    for (const provider of getPhysicsProviders()) {
        const has = provider.hasBody?.(box);
        if (has !== undefined) return has;
    }
    return true;
};

/**
 * What `box`'s body touches now, as far as it has been told. A body taken away, here or on the
 * other side, touches nothing: its simulation said nothing more about it once it went.
 *
 * @internal
 */
export const contactsOf = (box: TBox): ReadonlySet<TBox> => {
    const set = contacts.get(box);
    if (set === undefined) return NONE;
    if (!hasBody(box)) {
        forgetContacts(box);
        return NONE;
    }
    for (const other of set) {
        if (!hasBody(other)) {
            set.delete(other);
            contacts.get(other)?.delete(box);
        }
    }
    return set;
};

/**
 * Asks whatever simulates `box`'s body to tell its contacts from now on, once. Asked when the body is
 * made, so a touch that begins before anyone asks about it (a crate placed on the floor, a rule made
 * once it has landed) is known all the same: the simulation tells a touch only when it begins. Only
 * the beginning and the end of a touch are told, not every step of it. A box with no body, or one
 * whose body is not there yet, is asked again by the next collision that is about it.
 *
 * @internal
 */
export const watchContacts = (box: TBox): void => {
    if (box.physics === null || watched.has(box)) {
        return;
    }
    for (const provider of getPhysicsProviders()) {
        if (provider.watchContacts?.(box, (other, started) => noteContact(box, other, started)) === true) {
            watched.add(box);
            box.cleanups.push(() => forgetContacts(box));
            return;
        }
    }
};
