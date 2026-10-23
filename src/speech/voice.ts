/**
 * The voice itself: a throat buzzing at the pitch asked for, shaped by the mouth into vowels, with a
 * hiss beside it for the s and the sh. The same idea a computer first sang with, in 1961.
 *
 * The buzz is a pulse of air for every vibration of the vocal folds. It passes through five
 * resonators in a row, the formants, which are what make an "a" an "a": three move with the mouth,
 * two sit high and give the voice its colour. The nose adds a resonance and takes one away. The
 * hiss is noise through a band of its own, added after, because it is made in front of the mouth
 * and not in the throat.
 *
 * Nothing of the browser in it: the same numbers come out in a test, in an editor and on the desktop
 * runtime.
 */

/**
 * Where the mouth is and what the throat does at one moment.
 *
 * @internal
 */
export type TVoiceTarget = {
    f1: number;
    f2: number;
    f3: number;
    b1: number;
    b2: number;
    b3: number;
    /** The buzz, `0` to `1`. */
    voice: number;
    /** Breath through the throat, as in the h. */
    aspiration: number;
    /** The hiss in front of the mouth, and the band it rings in. */
    noise: number;
    noiseAt: number;
    noiseWidth: number;
    /** `1` with the nose open. */
    nasal: number;
};

/**
 * A stretch of sound: where the mouth is when it starts and, for a glide, where it goes. `quick`
 * lets the loudness jump, for the burst of a stop.
 *
 * @internal
 */
export type TVoiceSegment = { length: number; from: TVoiceTarget; to?: TVoiceTarget; quick?: boolean };

/**
 * @internal
 */
export type TVoiceSettings = { sampleRate: number; throat: number; breath: number; volume: number; seed: number };

/**
 * How the voice moves between targets, in seconds: the mouth glides, loudness changes faster, and a
 * burst at once.
 */
const MOUTH_TIME = 0.012;
const LOUDNESS_TIME = 0.005;
const BURST_TIME = 0.0012;

/**
 * How loud the hiss is beside the buzz, which the resonators make much louder than it.
 */
const HISS_GAIN = 1;
const ASPIRATION_GAIN = 0.12;

/**
 * Where the high formants sit, the colour of the voice, and the nose's resonance.
 */
const F4 = 3500;
const F5 = 4500;
const NOSE = 270;

/**
 * A resonance, one formant: a pair of poles that rings at `frequency` and passes the lowest
 * frequencies untouched, so five of them in a row stack their peaks.
 */
const createResonator = () => {
    let a = 1;
    let b = 0;
    let c = 0;
    let y1 = 0;
    let y2 = 0;
    return {
        tune(frequency: number, width: number, sampleRate: number) {
            if (frequency >= sampleRate * 0.46) {
                a = 1; b = 0; c = 0;
                return;
            }
            const r = Math.exp((-Math.PI * width) / sampleRate);
            c = -r * r;
            b = 2 * r * Math.cos((2 * Math.PI * frequency) / sampleRate);
            a = 1 - b - c;
        },
        run(x: number): number {
            const y = a * x + b * y1 + c * y2;
            y2 = y1;
            y1 = y;
            return y;
        },
    };
};

/**
 * The opposite of a resonance: a dip at `frequency`, which is what the nose takes away.
 */
const createAntiresonator = () => {
    let a = 1;
    let b = 0;
    let c = 0;
    let x1 = 0;
    let x2 = 0;
    return {
        tune(frequency: number, width: number, sampleRate: number) {
            const r = Math.exp((-Math.PI * width) / sampleRate);
            const cc = -r * r;
            const bb = 2 * r * Math.cos((2 * Math.PI * frequency) / sampleRate);
            const aa = 1 - bb - cc;
            a = 1 / aa;
            b = -bb / aa;
            c = -cc / aa;
        },
        run(x: number): number {
            const y = a * x + b * x1 + c * x2;
            x2 = x1;
            x1 = x;
            return y;
        },
    };
};

/**
 * A band of noise, at the same height whatever its width: the hiss of a fricative.
 */
const createBand = () => {
    let b0 = 0;
    let b2 = 0;
    let a1 = 0;
    let a2 = 0;
    let x1 = 0;
    let x2 = 0;
    let y1 = 0;
    let y2 = 0;
    return {
        tune(frequency: number, width: number, sampleRate: number) {
            const at = Math.min(frequency, sampleRate * 0.45);
            const w = (2 * Math.PI * at) / sampleRate;
            const alpha = Math.sin(w) * (width / at) / 2;
            const a0 = 1 + alpha;
            b0 = alpha / a0;
            b2 = -alpha / a0;
            a1 = (-2 * Math.cos(w)) / a0;
            a2 = (1 - alpha) / a0;
        },
        run(x: number): number {
            const y = b0 * x + b2 * x2 - a1 * y1 - a2 * y2;
            x2 = x1;
            x1 = x;
            y2 = y1;
            y1 = y;
            return y;
        },
    };
};

/**
 * The air through the vocal folds over one vibration, `phase` from `0` to `1`: it opens slowly,
 * shuts fast and stays shut. The fast shut is what gives a voice its buzz.
 */
const glottalFlow = (phase: number): number => {
    if (phase < 0.4) return 0.5 * (1 - Math.cos((Math.PI * phase) / 0.4));
    if (phase < 0.56) return Math.cos((Math.PI * (phase - 0.4)) / 0.32);
    return 0;
};

/**
 * Noise from a seed: the same hiss every time.
 */
const createNoise = (seed: number): (() => number) => {
    let state = (seed * 2654435761) >>> 0 || 1;
    return () => {
        state ^= state << 13;
        state >>>= 0;
        state ^= state >>> 17;
        state ^= state << 5;
        state >>>= 0;
        return state / 2147483648 - 1;
    };
};

const MOUTH_KEYS = ['f1', 'f2', 'f3', 'b1', 'b2', 'b3', 'noiseAt', 'noiseWidth', 'nasal'] as const;
const LOUDNESS_KEYS = ['voice', 'aspiration', 'noise'] as const;

/**
 * Plays the segments one after another at the pitch `pitchAt` gives for each moment, in Hz, and
 * hands back the samples, their loudest at `volume`.
 *
 * `pitchAt` is asked for every sample in order, so it may keep its own state.
 *
 * @internal
 */
export const renderVoice = (segments: readonly TVoiceSegment[], pitchAt: (time: number) => number, settings: TVoiceSettings): Float32Array => {
    const { sampleRate, throat, breath, volume } = settings;
    const total = segments.reduce((sum, segment) => sum + segment.length, 0);
    const out = new Float32Array(Math.max(1, Math.ceil(total * sampleRate)));
    if (segments.length === 0) return out;

    const formants = [createResonator(), createResonator(), createResonator(), createResonator(), createResonator()];
    const nosePole = createResonator();
    const noseZero = createAntiresonator();
    const band = createBand();
    const noise = createNoise(settings.seed);
    const hiss = createNoise(settings.seed + 7919);

    const mouth = 1 - Math.exp(-1 / (MOUTH_TIME * sampleRate));
    const loudness = 1 - Math.exp(-1 / (LOUDNESS_TIME * sampleRate));
    const burst = 1 - Math.exp(-1 / (BURST_TIME * sampleRate));
    formants[3]!.tune(F4 * throat, 250, sampleRate);
    formants[4]!.tune(F5 * throat, 200, sampleRate);
    nosePole.tune(NOSE, 100, sampleRate);

    const now: TVoiceTarget = { ...segments[0]!.from, voice: 0, aspiration: 0, noise: 0 };
    const target: TVoiceTarget = { ...now };
    let index = 0;
    let start = 0;
    let phase = 0;
    let flowBefore = 0;

    for (let i = 0; i < out.length; i += 1) {
        const time = i / sampleRate;
        while (index < segments.length - 1 && time >= start + segments[index]!.length) {
            start += segments[index]!.length;
            index += 1;
        }
        const segment = segments[index]!;
        const along = Math.min(1, (time - start) / Math.max(1e-6, segment.length));
        const to = segment.to ?? segment.from;
        for (const key of MOUTH_KEYS) target[key] = segment.from[key] + (to[key] - segment.from[key]) * along;
        for (const key of LOUDNESS_KEYS) target[key] = segment.from[key] + (to[key] - segment.from[key]) * along;
        for (const key of MOUTH_KEYS) now[key] += (target[key] - now[key]) * mouth;
        const step = segment.quick ? burst : loudness;
        for (const key of LOUDNESS_KEYS) now[key] += (target[key] - now[key]) * step;

        if ((i & 7) === 0) {
            formants[0]!.tune(now.f1 * throat, now.b1, sampleRate);
            formants[1]!.tune(now.f2 * throat, now.b2, sampleRate);
            formants[2]!.tune(now.f3 * throat, now.b3, sampleRate);
            noseZero.tune(NOSE + 180 * now.nasal, 100, sampleRate);
            band.tune(now.noiseAt * Math.sqrt(throat), now.noiseWidth, sampleRate);
        }

        const pitch = pitchAt(time);
        phase += pitch / sampleRate;
        if (phase >= 1) phase -= 1;
        const flow = glottalFlow(phase);
        // The change of the flow is what the ear hears, scaled so a low voice is as loud as a high one.
        const buzz = ((flow - flowBefore) * sampleRate) / pitch / 8;
        flowBefore = flow;
        const air = noise();
        const breathe = now.aspiration + breath * now.voice * (flow > 0 ? 1 : 0.25);
        let throatOut = now.voice * buzz + breathe * air * ASPIRATION_GAIN;
        throatOut = noseZero.run(nosePole.run(throatOut));
        for (const formant of formants) throatOut = formant.run(throatOut);
        out[i] = throatOut + band.run(hiss()) * now.noise * HISS_GAIN;
    }

    finish(out, sampleRate, volume);
    return out;
};

/**
 * Takes away any offset from zero, brings the loudest sample to `volume`, and fades the ends so the
 * sound starts and stops without a click.
 */
const finish = (out: Float32Array, sampleRate: number, volume: number): void => {
    let before = 0;
    let after = 0;
    let peak = 0;
    for (let i = 0; i < out.length; i += 1) {
        const value = out[i]! - before + 0.995 * after;
        before = out[i]!;
        after = value;
        out[i] = value;
        peak = Math.max(peak, Math.abs(value));
    }
    const gain = peak > 0 ? volume / peak : 0;
    const fade = Math.min(out.length >> 1, Math.round(sampleRate * 0.004));
    for (let i = 0; i < out.length; i += 1) {
        const edge = Math.min(1, i / fade, (out.length - 1 - i) / fade);
        out[i] = out[i]! * gain * (fade > 0 ? edge : 1);
    }
};
