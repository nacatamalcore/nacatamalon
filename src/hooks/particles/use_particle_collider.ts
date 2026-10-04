import { createRecord } from '../../gameobjects/create_record';
import { getActiveBox } from '../../store';
import type {
    TParticleCollider2d, TParticleCollider3d, TParticleColliderShape2d, TParticleColliderShape3d,
} from '../../gameobjects/particles/colliders/t_particle_collider';

/**
 * Puts it on the object being built, replacing one it already had, and says so if it did.
 */
const attach = <T extends TParticleCollider2d | TParticleCollider3d>(caller: string, collider: T): T => {
    const box = getActiveBox();
    if (box === null) {
        throw new Error(`[NacatamalOn] ${caller}: call it inside a scene body, or inside something created with useSpawn.`);
    }
    if (box.particleCollider !== null) {
        console.warn(`[NacatamalOn] ${caller}: this object already stops particles, so the shape it had is replaced. Put the second one on its own object.`);
    }
    box.particleCollider = collider;
    return collider;
};

/**
 * Makes this object solid to particles in a flat scene: sparks bounce off it and rain ends on it.
 *
 * The shape is measured on the object, so it moves, turns and stretches with it. It only stops the
 * effects whose file says how they collide; every other effect goes straight through, which is what
 * smoke and glows want.
 *
 * One per object. A staircase is one object per step, each with its own.
 *
 * @param options The shape, and whether it starts on.
 * @returns The collider, to turn off and on with `enabled`.
 *
 * @example
 * ```ts
 * const Ledge = () => {
 *     useTransform({ x: 200, y: 300 });
 *     useParticleCollider2d({ shape: { kind: 'rect', width: 120, height: 16 } });
 * };
 * ```
 *
 * @category Particles
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const useParticleCollider2d = (options: { shape: TParticleColliderShape2d; enabled?: boolean }): TParticleCollider2d =>
    attach('useParticleCollider2d', createRecord('particle-collider-2d', {
        shape: options.shape,
        enabled: options.enabled ?? true,
    }) as TParticleCollider2d);

/**
 * Makes this object solid to particles in three dimensions. The same thing as the flat one, with a
 * box, a ball or an endless floor.
 *
 * @param options The shape, and whether it starts on.
 * @returns The collider, to turn off and on with `enabled`.
 *
 * @example
 * ```ts
 * const Step = (y: number, z: number) => {
 *     useTransform({ y, z });
 *     createMesh({ geometry: useCubeGeometry() });
 *     useParticleCollider3d({ shape: { kind: 'box', size: [1, 1, 1] } });
 * };
 * ```
 *
 * @category Particles
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const useParticleCollider3d = (options: { shape: TParticleColliderShape3d; enabled?: boolean }): TParticleCollider3d =>
    attach('useParticleCollider3d', createRecord('particle-collider-3d', {
        shape: options.shape,
        enabled: options.enabled ?? true,
    }) as TParticleCollider3d);
