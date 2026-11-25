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

import { glottalFlow } from './glottal';
import { sungLevel } from './sung_level';

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
 * lets the loudness jump, for the burst of a stop. `share`, sung with others, how much of the
 * loudness is this voice's.
 *
 * @internal
 */
export type TVoiceSegment = { length: number; from: TVoiceTarget; to?: TVoiceTarget; quick?: boolean; share?: number };

/**
 * `swell`, given for a voice that sings, how much louder it is at each moment: its vowels are then
 * brought near one loudness, high and low, and the mouth opens for a note above its first formant.
 *
 * @internal
 */
export type TVoiceSettings = { sampleRate: number; throat: number; breath: number; volume: number; seed: number; swell?: (time: number) => number };

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
 * How a voice that sings is kept at one loudness: the level its vowels are brought towards, how much
 * of the way, the furthest it is turned down and up, how fast, in seconds, and how often, in samples
 * (a power of two, like how often the formants are tuned).
 */
const SUNG_LEVEL = 0.9;
const SUNG_EVENNESS = 0.75;
const SUNG_LEAST = 0.2;
const SUNG_MOST = 5;
const SUNG_TIME = 0.012;
const SUNG_EVERY = 64;

/**
 * Below this, what the throat and the hiss do is not heard.
 */
const SILENT = 0.01;

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
 * The voice made a stretch at a time: `write` makes the next `count` samples, into `out` from `at`,
 * or with no `out` only works them out, which is how it is brought to a place in its middle. Its
 * samples are as the throat and the mouth make them, before any level is set: `renderVoice` brings
 * the loudest to a volume, a voice heard as it is made has a level of its own.
 *
 * @internal
 */
export type TVoiceWriter = {
    /** How many samples it makes in all. */
    readonly length: number;
    /** The next sample it makes. */
    readonly position: number;
    write(out: Float32Array | null, at: number, count: number): void;
};

/**
 * Starts the voice on the segments, from the one at `first`, which begins `from` seconds in: the
 * place a voice can start again from silence. `pitchAt` is asked for every sample in order, so it
 * may keep its own state.
 *
 * @internal
 */
export const createVoice = (
    segments: readonly TVoiceSegment[],
    pitchAt: (time: number) => number,
    settings: TVoiceSettings,
    first = 0,
    from = 0,
): TVoiceWriter => {
    const { sampleRate, throat, breath } = settings;
    const total = segments.reduce((sum, segment) => sum + segment.length, 0);
    const length = segments.length === 0 ? 1 : Math.max(1, Math.ceil(total * sampleRate));
    let i = Math.min(length, Math.round(from * sampleRate));
    if (segments.length === 0) {
        return {
            length,
            get position() {
                return i;
            },
            write: (out, at, count) => {
                if (out !== null) out.fill(0, at, at + count);
                i += count;
            },
        };
    }

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

    const now: TVoiceTarget = { ...segments[first]!.from, voice: 0, aspiration: 0, noise: 0 };
    const target: TVoiceTarget = { ...now };
    let index = first;
    let start = from;
    let phase = 0;
    let flowBefore = 0;
    // What takes away any offset from zero: the sample before, and what came out for it.
    let before = 0;
    let after = 0;

    const { swell } = settings;
    const gliding = 1 - Math.exp(-1 / (SUNG_TIME * sampleRate));
    let gain = 1;
    let gainTo = 1;
    let gained = false;
    let share = segments[first]!.share ?? 1;

    const sample = (): number => {
        const time = i / sampleRate;
        while (index < segments.length - 1 && time >= start + segments[index]!.length) {
            start += segments[index]!.length;
            index += 1;
        }
        const segment = segments[index]!;
        const silent = now.voice < SILENT && now.aspiration < SILENT && now.noise < SILENT;
        const along = Math.min(1, (time - start) / Math.max(1e-6, segment.length));
        const to = segment.to ?? segment.from;
        for (const key of MOUTH_KEYS) target[key] = segment.from[key] + (to[key] - segment.from[key]) * along;
        for (const key of LOUDNESS_KEYS) target[key] = segment.from[key] + (to[key] - segment.from[key]) * along;
        for (const key of MOUTH_KEYS) now[key] += (target[key] - now[key]) * mouth;
        const step = segment.quick ? burst : loudness;
        for (const key of LOUDNESS_KEYS) now[key] += (target[key] - now[key]) * step;

        const pitch = pitchAt(time);
        if ((i & 7) === 0) {
            let f1 = now.f1 * throat;
            let f2 = now.f2 * throat;
            if (swell) {
                f1 = Math.max(f1, Math.min(1.03 * pitch, 1000));
                f2 = Math.max(f2, f1 * 1.25);
                if (!gained || (i & (SUNG_EVERY - 1)) === 0) {
                    const level = sungLevel(
                        [[NOSE, 100], [f1, now.b1], [f2, now.b2], [now.f3 * throat, now.b3], [F4 * throat, 250], [F5 * throat, 200]],
                        [NOSE + 180 * now.nasal, 100], pitch, sampleRate,
                    );
                    const even = Math.max(SUNG_LEAST, Math.min(SUNG_MOST, (SUNG_LEVEL / level) ** SUNG_EVENNESS));
                    gainTo = even * swell(time);
                    if (!gained) gain = gainTo;
                    gained = true;
                }
            }
            formants[0]!.tune(f1, now.b1, sampleRate);
            formants[1]!.tune(f2, now.b2, sampleRate);
            formants[2]!.tune(now.f3 * throat, now.b3, sampleRate);
            noseZero.tune(NOSE + 180 * now.nasal, 100, sampleRate);
            band.tune(now.noiseAt * Math.sqrt(throat), now.noiseWidth, sampleRate);
        }

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
        let hissOut = band.run(hiss()) * now.noise * HISS_GAIN;
        if (swell) {
            gain += (gainTo - gain) * gliding;
            // A silence has no loudness to glide from.
            share = silent ? segment.share ?? 1 : share + ((segment.share ?? 1) - share) * gliding;
            throatOut *= gain * share;
            hissOut *= share;
        }
        const raw = throatOut + hissOut;
        const value = raw - before + 0.995 * after;
        before = raw;
        after = value;
        return value;
    };

    return {
        length,
        get position() {
            return i;
        },
        write: (out, at, count) => {
            for (let n = 0; n < count; n += 1) {
                const value = i < length ? sample() : 0;
                if (out !== null) out[at + n] = value;
                if (i < length) i += 1;
            }
        },
    };
};

/**
 * Plays the segments one after another at the pitch `pitchAt` gives for each moment, in Hz, and
 * hands back the samples, their loudest at `volume`.
 *
 * `pitchAt` is asked for every sample in order, so it may keep its own state.
 *
 * @internal
 */
export const renderVoice = (segments: readonly TVoiceSegment[], pitchAt: (time: number) => number, settings: TVoiceSettings): Float32Array => {
    const voice = createVoice(segments, pitchAt, settings);
    const out = new Float32Array(voice.length);
    voice.write(out, 0, out.length);
    finish(out, settings.sampleRate, settings.volume);
    return out;
};

/**
 * Brings the loudest sample to `volume`, and fades the ends so the sound starts and stops without a
 * click.
 */
const finish = (out: Float32Array, sampleRate: number, volume: number): void => {
    let peak = 0;
    for (let i = 0; i < out.length; i += 1) peak = Math.max(peak, Math.abs(out[i]!));
    const gain = peak > 0 ? volume / peak : 0;
    const fade = Math.min(out.length >> 1, Math.round(sampleRate * 0.004));
    for (let i = 0; i < out.length; i += 1) {
        const edge = Math.min(1, i / fade, (out.length - 1 - i) / fade);
        out[i] = out[i]! * gain * (fade > 0 ? edge : 1);
    }
};
