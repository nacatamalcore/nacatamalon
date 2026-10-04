import type { TDrawable } from '../gameobjects/types';
import type { TRuntimeStore } from '../store';
import type { TBox } from './types/t_box';

/**
 * Who a drawable belongs to: the box holding it and the game it is running in.
 *
 * Kept here rather than on the record, and weakly, for the same reason as `trackLoad`: a record
 * stays plain serializable data, and one nobody holds any more takes its entry with it.
 *
 * The game is part of it because `destroy` is called from gameplay code, long after the active
 * game pointer has been cleared, so the drawable itself has to be able to say where it lives.
 */
const owners = new WeakMap<TDrawable, { box: TBox; store: TRuntimeStore }>();

/**
 * Remembers where `drawable` was placed. Called by the creator right after it attaches it.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const trackDrawableOwner = (drawable: TDrawable, box: TBox, store: TRuntimeStore): void => {
    owners.set(drawable, { box, store });
};

/**
 * Where `drawable` lives, or `undefined` for one that was never attached or has already left.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const ownerOfDrawable = (drawable: TDrawable): { box: TBox; store: TRuntimeStore } | undefined => owners.get(drawable);

/**
 * Drops the link once `drawable` is out of the tree, so asking again says it has no owner.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const forgetDrawableOwner = (drawable: TDrawable): void => {
    owners.delete(drawable);
};
