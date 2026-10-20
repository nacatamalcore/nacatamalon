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
 * What `box`'s body touches now, as far as it has been told.
 *
 * @internal
 */
export const contactsOf = (box: TBox): ReadonlySet<TBox> => contacts.get(box) ?? NONE;

/**
 * Asks whatever simulates `box`'s body to tell its contacts from now on, once. Asked by a collision
 * only for a box it is about, so the bodies nothing asks about stay as cheap as they were: reporting
 * contacts has a cost, and the simulation reports a pair when either of the two asked. A box with no
 * body, or one whose body is not there yet, is asked again next time.
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
            return;
        }
    }
};
