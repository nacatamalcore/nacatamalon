import { createParticleState } from '../particle_pool';
import { simulateParticles, simulateParticles3d } from '../simulate_particles';
import { PARTICLE_3D_OFFSET, PARTICLE_FLOATS, PARTICLE_OFFSET } from '../../../render/shared/particle_instance';
import type { TParticlesBounds, TParticlesDoc } from '../../../loaders/particles/types/t_particles_doc';

/**
 * The step it runs at, the frame an effect is made for.
 */
const STEP = 1 / 60;

/**
 * A ceiling on the time it runs, so a life of a thousand seconds is not sixty thousand steps.
 */
const MAX_SECONDS = 12;

const WHITE = { r: 1, g: 1, b: 1, a: 1 };
const HERE_2D = { x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1 };
const HERE_3D = new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);

/**
 * How long to run an effect to see where it gets to. One that ends is run until the last particle it
 * will ever make has died; one that loops has no such moment, so it is run for a few lives, enough
 * for it to fill up and for the fastest to get wherever their pull is taking them.
 */
const runLength = (doc: TParticlesDoc): number => {
    const longest = Math.max(doc.life[0], doc.life[1]);
    const seconds = doc.emission.duration > 0 && !doc.emission.loop ? doc.emission.duration + longest : longest * 3;
    return Math.min(Math.max(seconds, STEP), MAX_SECONDS);
};

/**
 * Works out how far an effect reaches, by running it: its speeds, pull, drag and lives together
 * decide it, and no field says it. The engine's own simulation, so the box is where the particles
 * really go.
 *
 * **What is measured is what is drawn**: every particle and every place of its tail, each grown by
 * half its size so the whole picture is inside the box and not just its middle. The same seed every
 * time, so measuring an unchanged effect twice gives the same box. It does not cover the effects it
 * sets off (they are other files, and this reads none) or the scale of whatever holds it (the same
 * effect is placed at different sizes).
 *
 * `null` for an effect that made nothing in the time it ran, which is one only a script fires. That
 * is not a box of nothing: it is "could not be measured", so its reach stays unsaid.
 * @param doc - The effect.
 * @param options - How long to run it for, and how finely.
 * @returns How far it reaches, or `null` when it makes nothing.
 *
 * @category Particles
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const measureParticlesBounds = (
    doc: TParticlesDoc,
    options: {
        /**
         * The run's seed. The same one every time unless given.
         */
        seed?: number;
        /**
         * Room left around what was measured, as a fraction. `0.05` when left out.
         */
        padding?: number;
    } = {},
): TParticlesBounds | null => {
    const state = createParticleState(doc, options.seed ?? 1);
    const padding = options.padding ?? 0.05;
    const flat = doc.kind === 'particles2d';
    const x = flat ? PARTICLE_OFFSET.x : PARTICLE_3D_OFFSET.x;
    const y = flat ? PARTICLE_OFFSET.y : PARTICLE_3D_OFFSET.y;
    const size = flat ? PARTICLE_OFFSET.size : PARTICLE_3D_OFFSET.size;

    const low = { x: Infinity, y: Infinity, z: Infinity };
    const high = { x: -Infinity, y: -Infinity, z: -Infinity };
    let saw = false;

    const steps = Math.ceil(runLength(doc) / STEP);
    for (let step = 0; step < steps; step++) {
        if (doc.kind === 'particles2d') {
            simulateParticles(state, doc, STEP, HERE_2D, true, WHITE, 0);
        } else {
            simulateParticles3d(state, doc, STEP, HERE_3D, true, WHITE);
        }
        for (let i = 0; i < state.instanceCount; i++) {
            const at = i * PARTICLE_FLOATS;
            const half = state.instances[at + size]! / 2;
            const px = state.instances[at + x]!;
            const py = state.instances[at + y]!;
            const pz = flat ? 0 : state.instances[at + PARTICLE_3D_OFFSET.z]!;
            low.x = Math.min(low.x, px - half);
            low.y = Math.min(low.y, py - half);
            low.z = Math.min(low.z, pz - half);
            high.x = Math.max(high.x, px + half);
            high.y = Math.max(high.y, py + half);
            high.z = Math.max(high.z, pz + half);
            saw = true;
        }
    }
    if (!saw) {
        return null;
    }

    const grow = (from: number, to: number) => ({ center: (from + to) / 2, size: (to - from) * (1 + padding) });
    const ax = grow(low.x, high.x);
    const ay = grow(low.y, high.y);
    // A flat effect never leaves its plane, so its depth is none rather than a sliver of padding.
    const az = flat ? { center: 0, size: 0 } : grow(low.z, high.z);
    return { center: { x: ax.center, y: ay.center, z: az.center }, size: { x: ax.size, y: ay.size, z: az.size } };
};
