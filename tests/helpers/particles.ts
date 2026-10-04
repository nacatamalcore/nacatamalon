import { createParticleState } from '../../src/gameobjects/particles/particle_pool';
import { parseParticlesDoc } from '../../src/loaders/particles/parse_particles_doc';
import type { TParticlesDoc, TParticlesDoc2d } from '../../src/loaders/particles/types/t_particles_doc';
import type { TParticleState } from '../../src/gameobjects/particles/types/t_particle_pool';
import type { TTransform2d } from '../../src/gameobjects/types/t_transform_2d';

/**
 * An effect built from a partial description, with everything else at its default.
 */
export const effectDoc = (fields: Record<string, unknown> = {}): TParticlesDoc2d =>
    parseParticlesDoc({ kind: 'particles2d', texture: 'p.png', ...fields }, '/test.particles') as TParticlesDoc2d;

/**
 * An emitter's working state for one of those.
 */
export const effectState = (doc: TParticlesDoc, seed = 1): TParticleState => createParticleState(doc, seed);

/**
 * Where an emitter is, when the test does not care.
 */
export const somewhere = (fields: Partial<TTransform2d> = {}): TTransform2d =>
    ({ x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1, ...fields });

/**
 * White, at full opacity: a tint that changes nothing.
 */
export const noTint = { r: 1, g: 1, b: 1, a: 1 };
