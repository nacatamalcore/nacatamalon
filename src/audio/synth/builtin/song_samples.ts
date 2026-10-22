import type { TSongSample } from '../types/t_song';

/**
 * The samples the engine has, made here by the engine's own code rather than recorded, so there is
 * nobody's recording in them and nothing to credit: a drum kit, an orchestra hit and a zap for the
 * `dpcm` voice and the SNES, and instruments for the SNES (a piano, strings, a choir…). Each comes
 * out the same every time.
 *
 * The drums sound as they are on `c'`, on both consoles. The instruments sound as they are on middle
 * C, and the ones that are held (strings, an organ) start again from a stretch of whole waves, so a
 * long note does not click as it goes round.
 */

/**
 * The rate they are made at. The `dpcm` voice brings them down to the console's own.
 */
const RATE = 44100;

/**
 * One of the engine's samples: its name, what it is, and how it is made.
 *
 * @category Audio
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TSongSampleInfo = {
    /**
     * What an instrument's `sample` calls it, after `nacatamalon:`.
     */
    key: string;
    label: string;
    description: string;
};

/**
 * Noise that is the same every time: a small generator with a fixed start.
 */
const noiseFrom = (seed: number): (() => number) => {
    let state = seed;
    return () => {
        state = (state * 1664525 + 1013904223) >>> 0;
        return state / 2 ** 31 - 1;
    };
};

/**
 * A sample `seconds` long, each value worked out from its time.
 */
const make = (seconds: number, at: (time: number, index: number) => number): Float32Array => {
    const out = new Float32Array(Math.round(seconds * RATE));
    for (let i = 0; i < out.length; i += 1) {
        out[i] = Math.max(-1, Math.min(1, at(i / RATE, i)));
    }
    return out;
};

/**
 * A tone whose pitch falls from `from` to `to` Hz, its phase carried so it never clicks.
 */
const falling = (from: number, to: number, fall: number): ((time: number) => number) => {
    let phase = 0;
    let last = 0;
    return (time) => {
        const hz = to + (from - to) * Math.exp(-time / fall);
        phase += 2 * Math.PI * hz * (time - last);
        last = time;
        return Math.sin(phase);
    };
};

/**
 * A wave made of harmonics, `weights[k]` of the `k + 1`th, at `hz`, `seconds` long.
 */
const harmonics = (hz: number, seconds: number, weights: number[], shape: (time: number, harmonic: number) => number = () => 1): Float32Array =>
    make(seconds, (t) => {
        let sum = 0;
        for (let k = 0; k < weights.length; k += 1) sum += weights[k]! * shape(t, k + 1) * Math.sin(2 * Math.PI * hz * (k + 1) * t);
        return sum;
    });

/**
 * A held instrument: its wave at a pitch whose cycle is a whole number of samples, so the stretch it
 * starts again from is whole cycles and goes round without a click. The note it sounds as is worked
 * out from the pitch it really has.
 */
const held = (cycle: number, seconds: number, weights: number[], attack: (time: number) => number = () => 1): TMade => {
    const hz = RATE / cycle;
    const samples = harmonics(hz, seconds, weights);
    for (let i = 0; i < samples.length; i += 1) samples[i]! *= attack(i / RATE);
    const peak = samples.reduce((most, value) => Math.max(most, Math.abs(value)), 0) || 1;
    for (let i = 0; i < samples.length; i += 1) samples[i]! *= 0.9 / peak;
    const cycles = Math.floor((samples.length * 0.5) / cycle);
    return { samples, root: 69 + 12 * Math.log2(hz / 440), loopStart: samples.length - cycles * cycle };
};

/**
 * A struck instrument that dies away, played once: its harmonics each fading at their own speed.
 */
const struck = (hz: number, seconds: number, weights: number[], fades: number[]): TMade => {
    const samples = harmonics(hz, seconds, weights, (t, k) => Math.exp(-t / (fades[k - 1] ?? fades[fades.length - 1]!)));
    const peak = samples.reduce((most, value) => Math.max(most, Math.abs(value)), 0) || 1;
    for (let i = 0; i < samples.length; i += 1) samples[i]! *= 0.9 / peak;
    return { samples, root: 69 + 12 * Math.log2(hz / 440) };
};

type TMade = { samples: Float32Array; root?: number; loopStart?: number };

/** Middle C, the note the instruments are made at, and the C above, where the drums sound as they are. */
const MIDDLE_C = 261.6256;
const DRUM_ROOT = 72;

const SAW = Array.from({ length: 24 }, (_, k) => 1 / (k + 1));
const SQUAREISH = Array.from({ length: 24 }, (_, k) => (k % 2 === 0 ? 1 / (k + 1) : 0.08 / (k + 1)));

const INSTRUMENT_MAKERS: Record<string, () => TMade> = {
    piano: () => struck(MIDDLE_C, 2.2, [1, 0.55, 0.35, 0.22, 0.12, 0.08, 0.05], [1.1, 0.7, 0.45, 0.3, 0.2, 0.15, 0.1]),
    marimba: () => struck(MIDDLE_C, 1, [1, 0, 0, 0.35, 0, 0, 0, 0, 0, 0.1], [0.45, 0.2, 0.2, 0.12, 0.1, 0.1, 0.1, 0.1, 0.1, 0.05]),
    guitar: () => struck(MIDDLE_C, 1.6, [1, 0.7, 0.5, 0.35, 0.25, 0.18, 0.12, 0.08], [0.9, 0.55, 0.35, 0.25, 0.18, 0.12, 0.09, 0.07]),
    'synth-bass': () => struck(MIDDLE_C / 2, 1.2, SAW.slice(0, 12), [0.8, 0.4, 0.25, 0.18, 0.13, 0.1, 0.08, 0.07, 0.06, 0.05, 0.04, 0.04]),
    strings: () => held(Math.round(RATE / MIDDLE_C), 1, SAW.map((w, k) => w * Math.exp(-k / 9))),
    brass: () => held(Math.round(RATE / MIDDLE_C), 1, SAW.map((w, k) => w * Math.exp(-k / 14))),
    flute: () => held(Math.round(RATE / MIDDLE_C), 1, [1, 0.12, 0.05]),
    organ: () => held(Math.round(RATE / MIDDLE_C), 0.6, [1, 0.8, 0.5, 0.6, 0, 0.4, 0, 0.3]),
    choir: () => held(Math.round(RATE / MIDDLE_C), 1, [0.6, 0.9, 1, 0.7, 0.35, 0.5, 0.4, 0.2, 0.1, 0.05]),
    'square-lead': () => held(Math.round(RATE / MIDDLE_C), 0.6, SQUAREISH),
};

const MAKERS: Record<string, () => Float32Array> = {
    kick: () => {
        const tone = falling(160, 45, 0.04);
        return make(0.35, (t) => tone(t) * Math.exp(-t / 0.12));
    },
    snare: () => {
        const noise = noiseFrom(7);
        const tone = falling(220, 180, 0.02);
        return make(0.25, (t) => noise() * 0.7 * Math.exp(-t / 0.07) + tone(t) * 0.5 * Math.exp(-t / 0.03));
    },
    clap: () => {
        const noise = noiseFrom(11);
        // Three hands just apart, then the room.
        const burst = (t: number) => [0, 0.012, 0.024].reduce((sum, at) => sum + (t >= at ? Math.exp(-(t - at) / 0.006) : 0), 0);
        let last = 0;
        return make(0.3, (t) => {
            // Its lows taken away, as a clap has none.
            const raw = noise();
            const high = raw - last;
            last = raw;
            return high * 0.8 * (burst(t) * 0.7 + Math.exp(-t / 0.08) * 0.5);
        });
    },
    tom: () => {
        const tone = falling(220, 110, 0.08);
        return make(0.45, (t) => tone(t) * Math.exp(-t / 0.16));
    },
    orch: () => {
        // A C major chord in three octaves, every note a bright wave of its own, cut short together.
        const notes = [130.81, 196, 261.63, 329.63, 392, 523.25];
        return make(0.4, (t) => {
            let sum = 0;
            for (const hz of notes) {
                const phase = (t * hz) % 1;
                sum += (2 * phase - 1) * 0.22;
            }
            const attack = Math.min(1, t / 0.004);
            return sum * attack * Math.exp(-t / 0.13);
        });
    },
    zap: () => {
        let phase = 0;
        let last = 0;
        return make(0.25, (t) => {
            const hz = 100 + 1500 * Math.exp(-t / 0.05);
            phase += hz * (t - last);
            last = t;
            return (phase % 1 < 0.5 ? 0.6 : -0.6) * Math.exp(-t / 0.1);
        });
    },
};

/**
 * The samples the engine has, by what an instrument's `sample` calls them after `nacatamalon:`.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const SONG_SAMPLES: readonly TSongSampleInfo[] = [
    { key: 'piano', label: 'Piano', description: 'A piano note dying away: middle C as it is.' },
    { key: 'strings', label: 'Strings', description: 'A section of strings, held for as long as the note.' },
    { key: 'brass', label: 'Brass', description: 'Brass, bright and held.' },
    { key: 'flute', label: 'Flute', description: 'A soft, round flute, held.' },
    { key: 'organ', label: 'Organ', description: 'An organ, held.' },
    { key: 'choir', label: 'Choir', description: 'Voices singing "ah", held.' },
    { key: 'marimba', label: 'Marimba', description: 'A wooden bar struck, short.' },
    { key: 'guitar', label: 'Guitar', description: 'A plucked string dying away.' },
    { key: 'synth-bass', label: 'Synth bass', description: 'A bass that dies away: its note is the C below middle C as it is.' },
    { key: 'square-lead', label: 'Square lead', description: 'A hollow square wave, held.' },
    { key: 'kick', label: 'Kick', description: 'A kick drum: a low thump that drops.' },
    { key: 'snare', label: 'Snare', description: 'A snare drum: a crack with a short rattle.' },
    { key: 'clap', label: 'Clap', description: 'Hands clapping, three at once.' },
    { key: 'tom', label: 'Tom', description: 'A tom drum; lower notes make it a lower tom.' },
    { key: 'orch', label: 'Orchestra hit', description: 'A chord hit by the whole band at once.' },
    { key: 'zap', label: 'Zap', description: 'A laser that falls.' },
];

const made = new Map<string, TSongSample>();

/**
 * One of the engine's samples by its key (`'kick'`, or `'nacatamalon:kick'`), made the first time
 * it is asked for and kept, or `undefined` when there is none of that name.
 *
 * @internal
 */
export const builtinSample = (key: string): TSongSample | undefined => {
    const name = key.startsWith('nacatamalon:') ? key.slice('nacatamalon:'.length) : key;
    const instrument = INSTRUMENT_MAKERS[name];
    if (instrument !== undefined) {
        let sample = made.get(name);
        if (sample === undefined) {
            const { samples, root, loopStart } = instrument();
            sample = { samples, sampleRate: RATE, ...(root !== undefined ? { root } : {}), ...(loopStart !== undefined ? { loopStart } : {}) };
            made.set(name, sample);
        }
        return sample;
    }
    const maker = MAKERS[name];
    if (maker === undefined) {
        return undefined;
    }
    let sample = made.get(name);
    if (sample === undefined) {
        sample = { samples: maker(), sampleRate: RATE, root: DRUM_ROOT };
        made.set(name, sample);
    }
    return sample;
};
