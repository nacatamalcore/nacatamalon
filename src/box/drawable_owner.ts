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
 * The drawing each view's stand-in stands in for (`standInFor`). A stand-in is drawn in the drawing's
 * place, so it belongs where the drawing does.
 */
const standingFor = new WeakMap<object, TDrawable>();

/**
 * Remembers that `standIn` is drawn by a view in place of `drawable`.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const noteStandIn = (standIn: object, drawable: TDrawable): void => {
    standingFor.set(standIn, drawable);
};

/**
 * The drawing a view's stand-in stands in for, or `undefined` for anything else.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const standingInFor = (standIn: object): TDrawable | undefined => standingFor.get(standIn);

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
 * Where `drawable` lives, or `undefined` for one that was never attached or has already left. A view's
 * stand-in lives where the drawing it stands in for does.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const ownerOfDrawable = (drawable: TDrawable): { box: TBox; store: TRuntimeStore } | undefined => {
    const owner = owners.get(drawable);
    if (owner !== undefined) {
        return owner;
    }
    const record = standingFor.get(drawable);
    return record === undefined ? undefined : owners.get(record);
};

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
