import type { TParticleColorStop, TParticleScaleStop } from '../../loaders/particles/types/t_particles_doc';

/**
 * How many steps a life is cut into when its curves are worked out ahead of time.
 *
 * Thirty-two is past what anyone can see on a particle that lives under two seconds, and it makes
 * the lookup one multiply and one floor.
 */
export const CURVE_STEPS = 32;

/**
 * Where a curve stands at `t`, by walking its stops.
 *
 * The slow way, used **once per step when a file lands** rather than once per particle per frame.
 * Exported because a tool that draws the gradient has to get the same answer as the particles do,
 * and a second idea of how two stops meet is how a preview comes to disagree with the thing it
 * previews.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const sampleColorStops = (stops: readonly TParticleColorStop[], t: number): [number, number, number, number] => {
    const first = stops[0]!;
    if (stops.length === 1 || t <= first.t) {
        return [first.color.r, first.color.g, first.color.b, first.alpha];
    }

    for (let i = 1; i < stops.length; i++) {
        const next = stops[i]!;
        if (t > next.t) {
            continue;
        }
        const previous = stops[i - 1]!;
        const span = next.t - previous.t;
        // Two stops at the same place are a hard edge, not a division by nothing.
        const k = span <= 0 ? 1 : (t - previous.t) / span;
        return [
            previous.color.r + (next.color.r - previous.color.r) * k,
            previous.color.g + (next.color.g - previous.color.g) * k,
            previous.color.b + (next.color.b - previous.color.b) * k,
            previous.alpha + (next.alpha - previous.alpha) * k,
        ];
    }

    const last = stops[stops.length - 1]!;
    return [last.color.r, last.color.g, last.color.b, last.alpha];
};

/**
 * The same, for the size multiplier.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const sampleScaleStops = (stops: readonly TParticleScaleStop[], t: number): number => {
    const first = stops[0]!;
    if (stops.length === 1 || t <= first.t) {
        return first.scale;
    }

    for (let i = 1; i < stops.length; i++) {
        const next = stops[i]!;
        if (t > next.t) {
            continue;
        }
        const previous = stops[i - 1]!;
        const span = next.t - previous.t;
        const k = span <= 0 ? 1 : (t - previous.t) / span;
        return previous.scale + (next.scale - previous.scale) * k;
    }

    return stops[stops.length - 1]!.scale;
};

/**
 * Works a colour curve out at every step, once, when the file lands.
 *
 * Walking the stops is fine for one reading and silly for the one place this is actually read from:
 * every living particle, every frame, for each of two curves. At five hundred particles that is a
 * thousand walks a frame to answer a question with thirty-two possible answers.
 *
 * The file stays the list of stops, because that is what a person edits and what round-trips.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const bakeColorCurve = (stops: readonly TParticleColorStop[]): Float32Array => {
    const table = new Float32Array((CURVE_STEPS + 1) * 4);
    for (let i = 0; i <= CURVE_STEPS; i++) {
        const [r, g, b, a] = sampleColorStops(stops, i / CURVE_STEPS);
        table[i * 4] = r;
        table[i * 4 + 1] = g;
        table[i * 4 + 2] = b;
        table[i * 4 + 3] = a;
    }
    return table;
};

/**
 * The same for the size curve.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const bakeScaleCurve = (stops: readonly TParticleScaleStop[]): Float32Array => {
    const table = new Float32Array(CURVE_STEPS + 1);
    for (let i = 0; i <= CURVE_STEPS; i++) {
        table[i] = sampleScaleStops(stops, i / CURVE_STEPS);
    }
    return table;
};
