import { takeSlot } from './particle_pool';
import type { TEmitShape2d, TParticlesDoc2d, TParticleRange } from '../../loaders/particles/types/t_particles_doc';
import type { TParticleOverrides } from './types/t_particles';
import type { TParticleState } from './types/t_particle_pool';
import type { TTransform2d } from '../types/t_transform_2d';

/**
 * The emitter's own space, for an effect whose particles live in it.
 */
const HERE: TTransform2d = { x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1 };

/**
 * One value out of a pair, or the pair's value when both ends are the same.
 */
const pick = (rand: () => number, range: TParticleRange): number =>
    range[0] + (range[1] - range[0]) * rand();

/**
 * Where inside its birth area one particle appears, in the emitter's own space.
 *
 * Only **where**, never which way it then goes: that is `direction` and `spread`, and keeping the
 * two apart is what lets a ring of sparks fly outwards while a bar of rain falls straight down.
 */
const bornAt = (rand: () => number, shape: TEmitShape2d): { x: number; y: number } => {
    switch (shape.kind) {
        case 'point':
            return { x: 0, y: 0 };
        case 'circle': {
            const angle = rand() * Math.PI * 2;
            // The square root is what spreads them evenly over the disc. Without it they bunch in
            // the middle, because a ring twice as far out has twice the room in it.
            const radius = shape.edge ? shape.radius : shape.radius * Math.sqrt(rand());
            return { x: Math.cos(angle) * radius, y: Math.sin(angle) * radius };
        }
        case 'rect':
            return {
                x: (rand() - 0.5) * shape.width,
                y: (rand() - 0.5) * shape.height,
            };
        case 'line': {
            const along = (rand() - 0.5) * shape.length;
            return { x: Math.cos(shape.angle) * along, y: Math.sin(shape.angle) * along };
        }
    }
};

/**
 * Puts one particle into the world, or does nothing if the emitter is full. Hands back the slot it
 * went into, or `-1`, so an effect it sets off at birth knows where it was born.
 *
 * `placement` is where the emitter ended up this frame, everything above it taken into account. It
 * is passed in rather than read off the record, so this stays a function of what it is given: that
 * is what lets the whole simulation be tested without a game, a card or a scene.
 *
 * The emitter's own scale is spent **here, at birth, once**. Positions take each axis and speeds
 * take a single number made from both, so a box stretched along one axis widens where particles
 * appear without bending the direction they fly. It also means a particle keeps whatever scale it
 * was born with, so resizing an emitter mid-flight reaches the cloud over one lifetime instead of
 * snapping it.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const emitOne = (
    state: TParticleState,
    doc: TParticlesDoc2d,
    placement: TTransform2d,
    overrides: TParticleOverrides | undefined,
): number => {
    const slot = takeSlot(state.pool);
    if (slot === -1) {
        return -1;
    }

    const { pool } = state;
    // Its own stream, so lighting a torch cannot shift any other seeded decision in the game.
    const rand = (): number => state.random.rand();
    // One number for anything that is a length rather than a place: a mean of the two axes, taken
    // without their sign so a mirrored emitter makes the same effect rather than an inside-out one.
    const magnitude = (Math.abs(placement.scaleX) + Math.abs(placement.scaleY)) / 2;

    // Kept in the emitter's own space when the effect asks for that: born unplaced, unturned and
    // unscaled, because the emitter's placement is laid over it every frame when it is drawn. That
    // is what makes the cloud travel with the emitter, and placing it here too would place it twice.
    const where = doc.worldSpace ? placement : HERE;
    const travel = doc.worldSpace ? magnitude : 1;

    const local = bornAt(rand, doc.shape);
    const turned = where.rotation;
    const cos = Math.cos(turned);
    const sin = Math.sin(turned);
    const offsetX = local.x * where.scaleX;
    const offsetY = local.y * where.scaleY;

    pool.x[slot] = where.x + offsetX * cos - offsetY * sin;
    pool.y[slot] = where.y + offsetX * sin + offsetY * cos;

    const heading = doc.direction + turned + (rand() - 0.5) * doc.spread;
    const speed = pick(rand, doc.speed) * travel * (overrides?.speedScale ?? 1);
    pool.vx[slot] = Math.cos(heading) * speed;
    pool.vy[slot] = Math.sin(heading) * speed;

    pool.age[slot] = 0;
    pool.life[slot] = Math.max(0.0001, pick(rand, doc.life) * (overrides?.lifeScale ?? 1));
    pool.size[slot] = pick(rand, doc.size) * magnitude * (overrides?.sizeScale ?? 1);
    pool.spin[slot] = pick(rand, doc.spin);
    pool.rotation[slot] = 0;
    return slot;
};
