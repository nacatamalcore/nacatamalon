import { isGone } from '../game/loop/runHookUpdates';
import { rectsOverlap } from './hitbox_shape';
import { rectsOf } from './collision_between';
import { componentOf } from '../box/made_by';
import { contactsOf, watchContacts } from '../physics/contacts';
import type { TTurnedRect } from './hitbox_shape';
import type { TBox } from '../box/types/t_box';
import type { TCollisionKey, TCollisionListener } from './types/t_hitbox';
import { isTaggableDrawing } from '../tags/tags';
import type { TTaggable } from '../tags/tags';

/**
 * Something carrying a tag, measured once this frame, with the box it is in: its own for a piece,
 * the one that draws it for a sprite on its own.
 */
type TEntry = { thing: TTaggable; holder: TBox; rects: TTurnedRect[] };

/**
 * Whether an entry can no longer be touched since it was measured: destroyed, in something that has
 * been, or a piece whose hitboxes an earlier call turned all off.
 */
const goneEntry = (entry: TEntry): boolean => {
    if (entry.thing.destroyed || isGone(entry.holder)) return true;
    const thing = entry.thing;
    return 'children' in thing && thing.hitboxes.length > 0 && !thing.hitboxes.some((hitbox) => hitbox.enabled);
};

/**
 * Whether two entries are one thing: the same, or a box and what it draws itself. A crate does not
 * touch its own tagged sprite; two sprites a box draws are two things, and can.
 */
const oneThing = (one: TEntry, other: TEntry): boolean =>
    one.thing === other.thing || one.thing === other.holder || other.thing === one.holder;

/**
 * Whether two things touch: their rectangles share any area, or, for two pieces with physics
 * bodies, the simulation says they touch. A body meets a piece of the right kind whether a hitbox or
 * the physics tells it.
 */
const touch = (one: TEntry, other: TEntry): boolean => {
    if (one.rects.some((rect) => other.rects.some((theirs) => rectsOverlap(rect, theirs)))) return true;
    return 'children' in other.thing && contactsOf(one.holder).has(other.thing as TBox);
};

/**
 * Everything in the scene that one of `wanted` asks for, by what asks: under a tag's name, what
 * carries it; under a component, the pieces made from it. Measured as `collisionBetween` measures: a
 * piece by its hitboxes that are on, or by what it draws; a sprite, text or panel by itself.
 */
const indexMatches = (scene: TBox, wanted: ReadonlySet<TCollisionKey>, reached?: ReadonlySet<TBox>): Map<TCollisionKey, TEntry[]> => {
    const index = new Map<TCollisionKey, TEntry[]>();
    const measured = new Map<TTaggable, TEntry>();
    const note = (key: TCollisionKey, thing: TTaggable, holder: TBox): void => {
        let entry = measured.get(thing);
        if (entry === undefined) {
            entry = { thing, holder, rects: rectsOf(thing) };
            measured.set(thing, entry);
        }
        const list = index.get(key) ?? [];
        if (!list.includes(entry)) list.push(entry);
        index.set(key, list);
    };
    const visit = (box: TBox): void => {
        // Born during this frame's updates: it meets things from the next one.
        if (isGone(box) || (reached !== undefined && !reached.has(box))) return;
        for (const tag of box.tags) if (wanted.has(tag)) note(tag, box as TTaggable, box);
        const made = componentOf(box);
        if (made !== undefined && wanted.has(made)) note(made, box as TTaggable, box);
        // A piece with a body that a collision asks about: from now on its contacts are told.
        if (box.physics !== null && (made !== undefined && wanted.has(made) || box.tags.some((tag) => wanted.has(tag)))) watchContacts(box);
        for (const drawable of box.drawables) {
            if (isTaggableDrawing(drawable) && !drawable.destroyed && drawable.tags !== undefined) {
                for (const tag of drawable.tags) if (wanted.has(tag)) note(tag, drawable, box);
            }
        }
        box.children.forEach(visit);
    };
    visit(scene);
    return index;
};

/**
 * One `useCollisionWith`: the box it is on, measured as `collisionBetween` measures it, against
 * everything its match asks for. What it touches is kept from one frame to the next, which is what
 * `'start'` and `'end'` are told from.
 */
const collideWith = (owner: TBox, listener: Extract<TCollisionListener, { kind: 'with' }>, index: Map<TCollisionKey, TEntry[]>): void => {
    watchContacts(owner);
    const mine: TEntry = { thing: owner as TTaggable, holder: owner, rects: rectsOf(owner) };
    const now = new Set<TTaggable>();
    for (const other of index.get(listener.match) ?? []) {
        if (oneThing(mine, other) || now.has(other.thing) || goneEntry(other)) continue;
        if (touch(mine, other)) {
            now.add(other.thing);
        }
    }
    const before = listener.touching;
    listener.touching = now;
    // Each asked at the moment of calling: an earlier call may have destroyed either.
    const alive = (thing: TTaggable): boolean => !thing.destroyed && ('children' in thing ? !isGone(thing) : true);
    const call = (other: TTaggable): void => {
        if (!isGone(owner) && alive(other)) listener.callback(other);
    };
    if (listener.when === 'touching') {
        now.forEach(call);
    } else if (listener.when === 'start') {
        for (const other of now) if (!before.has(other)) call(other);
    } else {
        // Something destroyed did not stop touching: it is gone, and is not called with.
        for (const other of before) if (!now.has(other)) call(other);
    }
};

/**
 * Compares, once a scene's updates are over, what every `useCollisionBetween` and `useCollisionWith`
 * of it asks about, by tag or by component, and calls each listener for every pair touching.
 *
 * **Every frame they touch, not only the first** (unless a `useCollisionWith` asked for `'start'` or
 * `'end'`). A character blinking inside an enemy after a hit has to be hurt again once the blinking
 * ends, and a listener told only when touching began would never hear of it.
 *
 * Each thing is measured once, where the updates left it. A listener that destroys one of the two
 * (or anything above it) is not called with it again this frame, so a bullet hits one enemy and
 * not the three behind it; one that turns a hitbox off is obeyed by the pairs still to come.
 *
 * @param scene The scene, whose things are compared.
 * @param touching The boxes the update walk noted: those with something to compare.
 * @param reached Every box the update walk reached; one born after it is left for the next frame.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const runCollisions = (scene: TBox, touching: readonly TBox[], reached?: ReadonlySet<TBox>): void => {
    const owners = touching.filter((box) => box.collisionCallbacks.length > 0);
    if (owners.length === 0) {
        return;
    }

    const wanted = new Set<TCollisionKey>();
    for (const owner of owners) {
        for (const listener of owner.collisionCallbacks) {
            if (listener.kind === 'with') {
                wanted.add(listener.match);
            } else {
                wanted.add(listener.a);
                wanted.add(listener.b);
            }
        }
    }
    const index = indexMatches(scene, wanted, reached);

    for (const owner of owners) {
        for (const listener of [...owner.collisionCallbacks]) {
            if (listener.kind === 'with') {
                collideWith(owner, listener, index);
                continue;
            }
            const first = index.get(listener.a);
            const second = index.get(listener.b);
            if (first === undefined || second === undefined) {
                continue;
            }
            const same = listener.a === listener.b;
            // One call for a pair, however many of their rectangles touch.
            const called = new Set<string>();
            for (const one of first) {
                for (const other of second) {
                    if (oneThing(one, other)) {
                        continue;
                    }
                    const key = same && other.thing.id < one.thing.id ? `${other.thing.id}:${one.thing.id}` : `${one.thing.id}:${other.thing.id}`;
                    if (called.has(key) || !touch(one, other)) {
                        continue;
                    }
                    // Asked at the moment of calling: an earlier call may have destroyed either, or
                    // the listener.
                    if (goneEntry(one) || goneEntry(other) || isGone(owner)) {
                        continue;
                    }
                    called.add(key);
                    listener.callback(one.thing, other.thing);
                }
            }
        }
    }
};
