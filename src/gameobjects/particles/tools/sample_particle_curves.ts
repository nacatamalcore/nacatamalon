import { sampleColorStops, sampleScaleStops } from '../bake_curves';
import type { TColor } from '../../../color';
import type { TParticleColorStop, TParticleScaleStop } from '../../../loaders/particles/types/t_particles_doc';

/**
 * The colour an effect's gradient gives at `t` through a particle's life, `0` at birth and `1` at
 * death, written into `out`.
 *
 * The very sum the particles are baked with, so a tool drawing the gradient cannot disagree with
 * the effect it previews. Into `out` so a tool drawing thirty-two steps makes nothing new.
 * @param stops - The effect's colour gradient.
 * @param t - How far through a particle's life, `0` at birth and `1` at death.
 * @param out - Where to write the colour, so a tool drawing every frame allocates nothing.
 * @returns `out`.
 *
 * @category Particles
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const sampleParticleColor = (stops: readonly TParticleColorStop[], t: number, out: TColor): TColor => {
    const [r, g, b, a] = sampleColorStops(stops, t);
    out.r = r;
    out.g = g;
    out.b = b;
    out.a = a;
    return out;
};

/**
 * The size multiplier an effect's curve gives at `t` through a particle's life, by the same sum the
 * particles are baked with.
 * @param stops - The effect's size curve.
 * @param t - How far through a particle's life, `0` at birth and `1` at death.
 * @returns The size multiplier at `t`.
 *
 * @category Particles
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const sampleParticleScale = (stops: readonly TParticleScaleStop[], t: number): number => sampleScaleStops(stops, t);
