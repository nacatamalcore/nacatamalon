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
    if (root.name === name) {
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
        if (box.name === name) {
            found.push(box);
        }
        for (const child of box.children) {
            visit(child);
        }
    };
    visit(root);
    return found;
};
