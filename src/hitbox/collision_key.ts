import type { TCollisionKey, TCollisionMatch } from './types/t_hitbox';

/**
 * How a collision's match is kept: a component as itself, a tag by its name.
 *
 * @internal
 */
export const collisionKey = (match: TCollisionMatch): TCollisionKey =>
    typeof match === 'function' ? match : typeof match === 'string' ? match : match.name;
