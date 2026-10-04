/**
 * The shapes a flat collider can take, measured on its object: the object's placement moves, turns
 * and stretches it.
 *
 * `plane` is an endless floor along the object's own `y = 0`, solid **below it on screen**, which with
 * y growing downwards is the side where `y` is larger.
 *
 * @category Particles
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TParticleColliderShape2d =
    | { kind: 'rect'; width: number; height: number }
    | { kind: 'circle'; radius: number }
    | { kind: 'plane' };

/**
 * The shapes a collider in three dimensions can take, measured on its object.
 *
 * `plane` is an endless floor through the object's own origin, solid below it, with +y up. Turn the
 * object and it becomes a slope or a wall.
 *
 * @category Particles
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TParticleColliderShape3d =
    | { kind: 'box'; size: [number, number, number] }
    | { kind: 'sphere'; radius: number }
    | { kind: 'plane' };

/**
 * Something solid in a flat scene, as far as particles are concerned.
 *
 * It belongs to the scene and not to any effect: every effect that says how it collides runs into
 * it. It is placed by the object it is on, so a moving platform takes its collider with it.
 *
 * @category Particles
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TParticleCollider2d = {
    readonly type: 'particle-collider-2d';
    id: string;
    shape: TParticleColliderShape2d;
    /**
     * Whether particles run into it. Turning it off keeps it, ready to turn on again.
     */
    enabled: boolean;
};

/**
 * Something solid in a scene in three dimensions, as far as particles are concerned. The same thing
 * as the flat one, one dimension up.
 *
 * @category Particles
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TParticleCollider3d = {
    readonly type: 'particle-collider-3d';
    id: string;
    shape: TParticleColliderShape3d;
    /**
     * Whether particles run into it. Turning it off keeps it, ready to turn on again.
     */
    enabled: boolean;
};
