import { glottalFlow } from './glottal';

const HARMONICS = 40;
const HIGHEST = 5000;

/**
 * How strong each harmonic of the buzz is, squared, before the mouth: worked out once, the first
 * time something is sung.
 */
let source: Float64Array | null = null;
const sourceOf = (): Float64Array => {
    if (source !== null) return source;
    const steps = 2048;
    source = new Float64Array(HARMONICS);
    for (let k = 1; k <= HARMONICS; k += 1) {
        let re = 0;
        let im = 0;
        for (let n = 0; n < steps; n += 1) {
            const change = ((glottalFlow(((n + 1) % steps) / steps) - glottalFlow(n / steps)) * steps) / 8;
            re += change * Math.cos((2 * Math.PI * k * n) / steps);
            im += change * Math.sin((2 * Math.PI * k * n) / steps);
        }
        source[k - 1] = (4 * (re * re + im * im)) / (steps * steps);
    }
    return source;
};

/**
 * The resonances a level is worked out through, each with its width.
 *
 * @internal
 */
export type TResonances = readonly (readonly [at: number, width: number])[];

/**
 * How loud, as a root mean square, the buzz comes out of the mouth at a pitch: the strength of its
 * harmonics through the resonances, `poles`, and the nose's dip, `zero`.
 *
 * @internal
 */
export const sungLevel = (poles: TResonances, zero: readonly [at: number, width: number], pitch: number, sampleRate: number): number => {
    const strengths = sourceOf();
    const size = poles.length + 1;
    // Each resonance's answer to a frequency is (1 - b - c)² over a polynomial of its cosine.
    const b = new Float64Array(size);
    const c = new Float64Array(size);
    let count = 0;
    for (let i = 0; i < size; i += 1) {
        const [at, width] = i === 0 ? zero : poles[i - 1]!;
        if (at >= sampleRate * 0.46) continue;
        const r = Math.exp((-Math.PI * width) / sampleRate);
        c[count] = -r * r;
        b[count] = 2 * r * Math.cos((2 * Math.PI * at) / sampleRate);
        count += 1;
    }
    let sum = 0;
    for (let k = 1; k <= HARMONICS; k += 1) {
        const frequency = k * pitch;
        if (frequency > HIGHEST || frequency > sampleRate * 0.45) break;
        const cos = Math.cos((2 * Math.PI * frequency) / sampleRate);
        const cosTwice = 2 * cos * cos - 1;
        let power = strengths[k - 1]! * 0.5;
        for (let i = 0; i < count; i += 1) {
            const bi = b[i]!;
            const ci = c[i]!;
            const through = (1 - bi - ci) ** 2 / (1 + bi * bi + ci * ci - 2 * bi * (1 - ci) * cos - 2 * ci * cosTwice);
            power = i === 0 ? power / through : power * through;
        }
        sum += power;
    }
    return Math.sqrt(sum);
};
