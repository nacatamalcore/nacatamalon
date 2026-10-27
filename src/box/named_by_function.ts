import { gameOfBox } from './box_game';
import type { TBox } from './types/t_box';
import { firstTimeIn } from '../utils/first_time_in';

/**
 * The boxes `useSpawn` named after their component's function because it was given no name, and
 * have not been named since. Weak, so a box gone is forgotten with it.
 */
const namedByFunction = new WeakSet<TBox>();

/**
 * Remembers that `box` is called after its component's function, a name a published build does not
 * keep, until something names it: marked before its body runs, so a body that names itself
 * (`useSelf().name = 'Crate'`, even the same word as its function) is a name of its own, which a
 * build keeps.
 */
export const markNamedByFunction = (box: TBox): void => {
    namedByFunction.add(box);
    let name = box.name;
    Object.defineProperty(box, 'name', {
        configurable: true,
        enumerable: true,
        get: () => name,
        set: (next: string) => {
            name = next;
            namedByFunction.delete(box);
        },
    });
};

/**
 * Told by everything that finds a box by name, each time it does: warns, once a name, when the box
 * found has its function's name.
 *
 * The one moment the mistake can be seen. A published build shortens function names, so there the
 * lookup simply finds nothing, and nothing can say why; while developing it still works, and this
 * is the only sign that it will not. It needs no telling apart of the two: once shortened, the name
 * looked for no longer matches, and this never fires.
 */
export const noteFoundByName = (box: TBox, name: string): void => {
    // Once per name and game, so a lookup made every frame says it once.
    if (!namedByFunction.has(box) || !firstTimeIn(gameOfBox(box), `found by function name: ${name}`)) {
        return;
    }
    console.warn(
        `[NacatamalOn] '${name}' was found by its component's function name, which a published build ` +
        `shortens, so it would not be found there. Give it the name: useSpawn(${name}, '${name}').`,
    );
};
