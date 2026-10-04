import { ALL_LAYERS } from './layers';
import { nanoId } from '../utils';
import type {
    TCollider2d, TCollider3d, TPhysicsBody2d, TPhysicsBody3d, TPhysicsBodyType, TPhysicsSurface,
} from './types/t_physics';

/**
 * What a collider is made of when it says nothing.
 *
 * Rapier's own documented defaults, chosen so that filling them in explicitly changes nothing: a
 * body written before the record existed behaves the same once it has one.
 */
const DEFAULT_SURFACE: TPhysicsSurface = {
    restitution: 0,
    friction: 0.5,
    density: 1,
    sensor: false,
    layer: 0,
    collidesWith: ALL_LAYERS,
};

/**
 * The six fields of a surface, taken from what was asked for and filled in from the defaults.
 */
const surface = (options: Partial<TPhysicsSurface>): TPhysicsSurface => ({
    restitution: options.restitution ?? DEFAULT_SURFACE.restitution,
    friction: options.friction ?? DEFAULT_SURFACE.friction,
    density: options.density ?? DEFAULT_SURFACE.density,
    sensor: options.sensor ?? DEFAULT_SURFACE.sensor,
    layer: options.layer ?? DEFAULT_SURFACE.layer,
    collidesWith: options.collidesWith ?? DEFAULT_SURFACE.collidesWith,
});

/**
 * A complete flat collider from a partial description.
 *
 * The factory exists so that "a rectangular collider" is one call instead of six fields somebody can
 * forget: **every record that reaches a document is complete by construction**, which is what lets
 * the format promise that a scene means the same thing whoever simulates it.
 * @param options - What is known: at least its shape. Everything left out takes its default.
 * @returns A complete collider.
 *
 * @category Physics
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const createPhysicsBody2d = (
    options: { id?: string; name?: string; body: TPhysicsBodyType; collider: TCollider2d } & Partial<TPhysicsSurface>,
): TPhysicsBody2d => ({
    _type: 'physics2d',
    id: options.id ?? nanoId(),
    name: options.name ?? 'Body',
    body: options.body,
    collider: options.collider,
    ...surface(options),
});

/**
 * A complete collider in three dimensions from a partial description: the sibling of
 * {@link createPhysicsBody2d}, filling in the same defaults.
 * @param options - What is known: at least its shape. Everything left out takes its default.
 * @returns A complete collider.
 *
 * @category Physics
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const createPhysicsBody3d = (
    options: {
        id?: string;
        name?: string;
        body: TPhysicsBodyType;
        collider: TCollider3d;
        offset?: [number, number, number];
    } & Partial<TPhysicsSurface>,
): TPhysicsBody3d => ({
    _type: 'physics3d',
    id: options.id ?? nanoId(),
    name: options.name ?? 'Body',
    body: options.body,
    collider: options.collider,
    offset: options.offset ?? [0, 0, 0],
    ...surface(options),
});
