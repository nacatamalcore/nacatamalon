import { nanoId } from '../utils';
import type { TBox } from '../box/types/t_box';
import type { TPostEffect } from '../post/types/t_post_effect';
import type { TFilter, TFilterOptions } from './types/t_filter';

/**
 * How many objects have a filter right now. While it is 0 the frame keeps no list for them, so a
 * game with no filters pays nothing for there being such a thing.
 */
let filteredCount = 0;

/**
 * The filters each object was given a way to leave, so adding one again after removing it does not
 * give it a second.
 */
const leaving = new WeakMap<TBox, Set<TFilter>>();

/**
 * Whether anything is filtered anywhere.
 *
 * @internal
 */
export const anyFilters = (): boolean => filteredCount > 0;

/**
 * Whether a filter does anything right now: on, and with an effect that is on and has a hook. An
 * effect whose file has not landed has none yet, and a filter of only those draws its objects as
 * they are until it does.
 *
 * @internal
 */
export const filtersNow = (filter: TFilter | null): filter is TFilter =>
    filter !== null && filter.enabled && filter.effects.some((effect) => effect.enabled && effect.fragment !== null);

/**
 * Makes a filter out of effects already made: `useFilter` and a scene's document both come here.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const createFilter = (effects: TPostEffect[], options: Omit<TFilterOptions, 'effects'> = {}, id: string = nanoId()): TFilter => {
    const boxes: TBox[] = [];
    const filter: TFilter = {
        type: 'filter',
        id,
        effects,
        rect: options.rect !== undefined ? { ...options.rect } : null,
        padding: options.padding ?? null,
        enabled: options.enabled ?? true,
        add: (box) => {
            if (box.filter === filter) {
                return;
            }
            if (box.filter !== null) {
                console.warn(`[NacatamalOn] useFilter: '${box.name}' already had a filter, and this one takes its place. An object has one filter; give one filter every effect it needs, or put one object inside the other.`);
                box.filter.remove(box);
            }
            box.filter = filter;
            boxes.push(box);
            filteredCount++;
            let given = leaving.get(box);
            if (given === undefined) {
                given = new Set();
                leaving.set(box, given);
            }
            if (!given.has(filter)) {
                given.add(filter);
                box.cleanups.push(() => filter.remove(box));
            }
        },
        remove: (box) => {
            const at = boxes.indexOf(box);
            if (at < 0) {
                return;
            }
            boxes.splice(at, 1);
            if (box.filter === filter) {
                box.filter = null;
            }
            filteredCount--;
        },
        has: (box) => box.filter === filter,
        boxes,
    };
    return filter;
};

/**
 * Takes a filter away from everything: what it filtered is drawn as it is again. What happens to a
 * filter when the object that made it leaves.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const releaseFilter = (filter: TFilter): void => {
    for (const box of [...filter.boxes]) {
        filter.remove(box);
    }
};
