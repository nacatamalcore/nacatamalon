import { noteFoundByName } from './named_by_function';
import type { TBox } from './types/t_box';

/**
 * The first thing called `name` inside `root`, looking at `root` itself first and then down through
 * everything in it, or `null` when there is none.
 *
 * What a behaviour uses to reach a named part of what it is attached to: the turret of a tank, the
 * hand a sword goes in, the door that has to slide. `null` is an ordinary answer and has to be
 * handled, because a part can be renamed while the game runs, or come in with another name when a
 * model is exported again. Nothing here throws.
 *
 * Something destroyed is not found, nor anything inside it, even before the end of the frame takes
 * it out: a coin collected this frame is not there to be collected again. To look across the whole
 * scene rather than inside one thing, start from `sceneOf(self)`.
 *
 * By name and not by id, because a name is what an author can type.
 *
 * @param root Where to look.
 * @param name The name to find.
 * @returns The first match, or `null`.
 *
 * @example
 * ```ts
 * registerScript('turret', (self) => {
 *     const place = findObject(self, 'Barrel')?.transform;
 *     if (place === undefined || place === null) return;
 *     useUpdate((delta) => { place.rotationY += delta; });
 * });
 * ```
 *
 * @category Game objects
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const findObject = (root: TBox, name: string): TBox | null => {
    if (root.destroyed) {
        return null;
    }
    if (root.name === name) {
        noteFoundByName(root, name);
        return root;
    }
    for (const child of root.children) {
        const found = findObject(child, name);
        if (found !== null) {
            return found;
        }
    }
    return null;
};

/**
 * Everything called `name` inside `root`, `root` included, in the order `findObject` would meet
 * them. For names shared on purpose: the four wheels of a car, every spawn point of a level.
 *
 * An empty list rather than `null` when nothing matches, so a `for ... of` over it needs no guard.
 * Leaves out what is destroyed, as `findObject` does.
 *
 * @param root Where to look.
 * @param name The name to find.
 * @returns Every match.
 *
 * @category Game objects
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const findObjects = (root: TBox, name: string): TBox[] => {
    const found: TBox[] = [];
    const visit = (box: TBox): void => {
        if (box.destroyed) {
            return;
        }
        if (box.name === name) {
            noteFoundByName(box, name);
            found.push(box);
        }
        for (const child of box.children) {
            visit(child);
        }
    };
    visit(root);
    return found;
};

/**
 * The first box inside `box`, `box` included, that `matches`, leaving out `skip` and what it holds
 * (already looked through, one level further in) and whatever is destroyed.
 */
const firstInside = (box: TBox, matches: (box: TBox) => boolean, skip: TBox | null): TBox | null => {
    if (box === skip || box.destroyed) {
        return null;
    }
    if (matches(box)) {
        return box;
    }
    for (const child of box.children) {
        const found = firstInside(child, matches, skip);
        if (found !== null) {
            return found;
        }
    }
    return null;
};

/**
 * The nearest box to `from` that `matches`: inside `from`, then inside its parent, and so on up to
 * the scene. Each level skips the one it came from, so nothing is looked at twice.
 */
const nearest = (from: TBox, matches: (box: TBox) => boolean): TBox | null => {
    let skip: TBox | null = null;
    for (let scope: TBox | null = from; scope !== null; skip = scope, scope = scope.parent) {
        const found = firstInside(scope, matches, skip);
        if (found !== null) {
            return found;
        }
    }
    return null;
};

/**
 * The box a behaviour's `'box'` setting points at, looked for from `from` outwards: by its id, and,
 * when nothing has that id, by its name. `null` when there is none, or the setting is empty.
 *
 * An editor writes the id, because a name is the first thing that changes: rename the player and
 * every coin that looked for "Player" would stop finding it. A name still works, because that is
 * what a person or an older scene writes by hand.
 *
 * **Nearest first**: the box itself and what it holds, then what its parent holds, and so on up to
 * the scene. A copy (`objectFromDoc`, `copyObject`) gets ids of its own, and a setting naming one of
 * its pieces by id is given the piece's new one; by name, every copy has a "Barrel", and a turret
 * looking for the barrel of its own tank finds its own, not the first tank's. Something outside is
 * still found, one level further out.
 *
 * @param from The box whose setting it is, usually `self`.
 * @param ref The setting's value: an id or a name.
 * @returns The box, or `null`.
 *
 * @example
 * ```ts
 * registerScript('follow', (self, props) => {
 *     let target = findBoxRef(self, String(props.target));
 *     useUpdate(() => {
 *         if (target === null || target.destroyed) target = findBoxRef(self, String(props.target));
 *     });
 * }, [{ key: 'target', type: 'box', default: '' }]);
 * ```
 *
 * @category Game objects
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const findBoxRef = (from: TBox, ref: string): TBox | null => {
    if (ref === '') {
        return null;
    }
    const byId = nearest(from, (box) => box.id === ref);
    if (byId !== null) {
        return byId;
    }
    const byName = nearest(from, (box) => box.name === ref);
    if (byName !== null) {
        noteFoundByName(byName, ref);
    }
    return byName;
};
