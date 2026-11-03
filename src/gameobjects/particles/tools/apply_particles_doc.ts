import { bakeColorCurve, bakeScaleCurve } from '../bake_curves';
import { childrenOf, closeParticleState, openParticleState, particleStateOf } from '../particle_state';
import { stopSettingOff } from '../../../loaders/particles/effect_users';
import { resolveAssetPath } from '../../../loaders/resolve_asset_path';
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
    const { file } = emitter;
    const before = file.doc;
    // What it sets off, kept in step with what the new version names: a child named before keeps its
    // file, however it is written. One it did not name before stays out until the effect is loaded
    // anew, since only the loader fetches; and one it names no more is not set off.
    const pathOf = (src: string): string => resolveAssetPath(file.src, src);
    const children = doc.children.map((child) => {
        const at = before?.children.findIndex((named) => pathOf(named.src) === pathOf(child.src)) ?? -1;
        return at >= 0 ? file.children[at] ?? null : null;
    });
    const gone = file.children.filter((child) => child !== null && !children.includes(child));
    file.children = children;
    file.doc = doc;
    const resized = before === null
        || before.kind !== doc.kind
        || before.max !== doc.max
        || (before.trail?.length ?? 0) !== (doc.trail?.length ?? 0);
    for (const each of new Set([...file.bound, emitter])) {
        const state = particleStateOf(each);
        if (state === null || resized) {
            closeParticleState(each);
            openParticleState(each);
            continue;
        }
        state.colorTable = bakeColorCurve(doc.colorOverLife);
        state.scaleTable = bakeScaleCurve(doc.sizeOverLife);
        // The ones still named go on with the particles they have, each with its own: one file named
        // twice is two runs of particles.
        const running = [...state.children];
        state.children = childrenOf(file).map((child) => {
            const at = running.findIndex((was) => was.file === child.file);
            return { ...child, state: at >= 0 ? running.splice(at, 1)[0]!.state : null };
        });
    }
    // Last, with every emitter already off them: this can let one go, picture and all.
    for (const child of gone) {
        stopSettingOff(child!, file);
    }
};
