import { ALL_LAYERS } from './layers';
import { nanoId } from '../utils';
import type { TPhysicsBodyType } from './types/t_physics';
import type { TRetroBody2d, TRetroCollider2d, TRetroSides } from './types/t_retro_physics';

/**
 * The fields of a retro body that say how it moves and what it is made of, everything but what it is
 * and its shape.
 */
type TRetroSurface = Omit<TRetroBody2d, '_type' | 'id' | 'name' | 'body' | 'collider'>;

/**
 * What a retro body is made of when it says nothing: it keeps none of its speed when stopped, does
 * not slow down on its own, has no limit, falls with the world, weighs one, and meets everything.
 */
const DEFAULT_RETRO: TRetroSurface = {
    enabled: true,
    bounce: 0,
    drag: 0,
    maxSpeed: null,
    gravityScale: 1,
    mass: 1,
    pushable: true,
    solidSides: { up: true, down: true, left: true, right: true },
    bounds: 'pass',
    carries: 1,
    sensor: false,
    layer: 0,
    collidesWith: ALL_LAYERS,
};

/** A number as it is, a pair copied: two bodies made from one options object share no pair. */
const own = <T extends number | { x: number; y: number }>(value: T): T =>
    (typeof value === 'number' ? value : { x: value.x, y: value.y }) as T;

/**
 * A complete retro collider from a partial description: the sibling of `createPhysicsBody2d`, so
 * every record that reaches a document is complete by construction.
 *
 * @param options - What is known: at least what it is and its shape. Everything left out takes its
 *   default.
 * @returns A complete retro collider.
 *
 * @category Physics
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const createRetroBody2d = (
    options: { id?: string; name?: string; body: TPhysicsBodyType; collider: TRetroCollider2d } & Partial<Omit<TRetroSurface, 'solidSides'>> & { solidSides?: Partial<TRetroSides> },
): TRetroBody2d => ({
    _type: 'retro-body-2d',
    id: options.id ?? nanoId(),
    name: options.name ?? 'Body',
    body: options.body,
    collider: options.collider,
    enabled: options.enabled ?? DEFAULT_RETRO.enabled,
    bounce: own(options.bounce ?? DEFAULT_RETRO.bounce),
    drag: options.drag ?? DEFAULT_RETRO.drag,
    // Copied, so two bodies made from one options object do not share a limit a game changes on one.
    maxSpeed: options.maxSpeed === undefined || options.maxSpeed === null ? DEFAULT_RETRO.maxSpeed : own(options.maxSpeed),
    gravityScale: options.gravityScale ?? DEFAULT_RETRO.gravityScale,
    mass: options.mass ?? DEFAULT_RETRO.mass,
    pushable: options.pushable ?? DEFAULT_RETRO.pushable,
    solidSides: { ...DEFAULT_RETRO.solidSides, ...options.solidSides },
    bounds: options.bounds ?? DEFAULT_RETRO.bounds,
    carries: options.carries ?? DEFAULT_RETRO.carries,
    sensor: options.sensor ?? DEFAULT_RETRO.sensor,
    layer: options.layer ?? DEFAULT_RETRO.layer,
    collidesWith: options.collidesWith ?? DEFAULT_RETRO.collidesWith,
});
