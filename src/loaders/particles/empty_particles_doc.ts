import { PARTICLES_FORMAT } from './types/t_particles_doc';
import type { TParticleRange, TParticlesDoc } from './types/t_particles_doc';

/**
 * A new effect that the reader accepts and that shows something at once: a small fountain of white
 * particles that fade and shrink as they fall back.
 *
 * Next to the reader so the two cannot drift: whatever the reader starts asking for, this has to
 * keep giving. Its reach is left unsaid rather than guessed, since nothing has been emitted to
 * measure yet (see `TParticlesBounds`). The two dimensions fall with opposite signs and very
 * different strengths, because one is measured in pixels with y down and the other in units with y
 * up.
 *
 * @param options - Flat or in three dimensions, and what it draws.
 * @returns The new effect.
 *
 * @category Assets & loading
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const emptyParticlesDoc = (options: {
    kind: 'particles2d' | 'particles3d';
    /**
     * A sheet to draw from, relative to the new file.
     */
    atlas?: string;
    /**
     * A picture to draw, relative to the new file. Ignored when `atlas` is given.
     */
    texture?: string;
}): TParticlesDoc => {
    const flat = options.kind === 'particles2d';
    const white = { r: 1, g: 1, b: 1, a: 1 };
    const base = {
        format: PARTICLES_FORMAT,
        atlas: options.atlas ?? null,
        texture: options.atlas !== undefined ? null : options.texture ?? null,
        frame: null,
        anim: null,
        max: 128,
        blend: 'alpha' as const,
        worldSpace: true,
        emission: { rate: 40, burst: 0, duration: 0, loop: true },
        spread: Math.PI / 4,
        life: [0.6, 1.2] as TParticleRange,
        speed: (flat ? [40, 90] : [1, 2]) as TParticleRange,
        size: (flat ? [4, 8] : [0.1, 0.25]) as TParticleRange,
        spin: [0, 0] as TParticleRange,
        damping: 0,
        colorOverLife: [{ t: 0, color: white, alpha: 1 }, { t: 1, color: white, alpha: 0 }],
        sizeOverLife: [{ t: 0, scale: 1 }, { t: 1, scale: 0.2 }],
        collision: null,
        trail: null,
        bounds: null,
        children: [],
        unsupported: {},
    };
    return flat
        ? { ...base, kind: 'particles2d', shape: { kind: 'point' }, direction: -Math.PI / 2, gravity: { x: 0, y: 120 } }
        : { ...base, kind: 'particles3d', shape: { kind: 'point' }, direction: { x: 0, y: 1, z: 0 }, gravity: { x: 0, y: -2, z: 0 } };
};
