import { bakeColorCurve, bakeScaleCurve } from '../bake_curves';
import { closeParticleState, openParticleState, particleStateOf } from '../particle_state';
import type { TParticles } from '../types/t_particles';
import type { TParticles3d } from '../types/t_particles_3d';
import type { TParticlesDoc } from '../../../loaders/particles/types/t_particles_doc';

/**
 * Puts a new version of an effect into an emitter that is already running, keeping the particles
 * that are in the air: what an effect editor does on every edit, so the cloud changes shape under
 * the person editing it instead of starting again at every keystroke.
 *
 * The curves are worked out again and everything else is read from the effect on the next frame.
 * What cannot be changed in place starts the emitter again: how many it may hold, how long its
 * tails are, or which dimension it is in, since each of those decides how big its arrays are.
 *
 * It changes the effect's file for every emitter following it, which is what a game with one
 * preview in it wants. A game never calls this: its effects are the files it ships with.
 * @param emitter - The running emitter.
 * @param doc - The new version of its effect.
 *
 * @category Particles
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const applyParticlesDoc = (emitter: TParticles | TParticles3d, doc: TParticlesDoc): void => {
    const before = emitter.file.doc;
    emitter.file.doc = doc;
    const state = particleStateOf(emitter);
    const resized = before === null
        || before.kind !== doc.kind
        || before.max !== doc.max
        || (before.trail?.length ?? 0) !== (doc.trail?.length ?? 0);
    if (state === null || resized) {
        closeParticleState(emitter);
        openParticleState(emitter);
        return;
    }
    state.colorTable = bakeColorCurve(doc.colorOverLife);
    state.scaleTable = bakeScaleCurve(doc.sizeOverLife);
};
