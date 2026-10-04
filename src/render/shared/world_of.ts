import type { TTransform2d } from '../../gameobjects/types/t_transform_2d';

/**
 * Where a drawable really is: what its own placement says, unless something above it moved it.
 *
 * Anything that asks where a drawable is has to ask this and not its `transform`, or a thing inside
 * a box that moved would be drawn, and touched, where it used to be.
 *
 * `worldTransform` is worked out once per frame while the tree is walked, and is left off entirely
 * when nothing above the drawable has a placement of its own, which is the ordinary case and costs
 * nothing.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const worldOf = (item: { readonly transform: TTransform2d; readonly worldTransform?: TTransform2d }): TTransform2d =>
    item.worldTransform ?? item.transform;
