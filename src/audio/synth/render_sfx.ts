import { createRandom } from '../../math/random';
import { createShiftRegister, pulse } from './oscillators';
import type { TRandomHandle } from '../../math/random';
import type { TSfxOptions, TSfxPreset } from './types/t_song';

/**
 * What one preset is: how long it lasts as it comes, and how to build, from a seed, the function
 * that gives one sample of it at `t` seconds. Built once per sound, so a take is the same every time
 * it is asked for.
 */
type TRecipe = {
    length: number;
    make: (random: TRandomHandle, pitch: number, length: number, sampleRate: number) => (t: number) => number;
};

/**
 * Picks a value near `value`, up to `amount` of it either way: what makes two seeds two takes.
 */
const near = (random: TRandomHandle, value: number, amount: number): number => value * (1 + random.rand(-amount, amount));

/**
 * A square wave whose frequency follows `frequency(t)`, the phase carried from sample to sample so a
 * sweep is smooth and never jumps.
 */
const sweptPulse = (sampleRate: number, duty: number, frequency: (t: number) => number): ((t: number) => number) => {
    let phase = 0;
    return (t) => {
        const value = pulse(phase, duty);
        phase += frequency(t) / sampleRate;
        return value;
    };
};

/**
 * Noise whose speed follows `rate(t)` in steps per second: falling, it is a rumble dying away.
 */
const sweptNoise = (sampleRate: number, rate: (t: number) => number): ((t: number) => number) => {
    const step = createShiftRegister();
    return (t) => step(rate(t) / sampleRate);
};

/**
 * The console's noise at its second-fastest speed, in steps per second: a hiss.
 */
const HISS = 1789773 / 8;

/**
 * A level that wanders: a new random value from `low` to `high` every `every` seconds, slid between
 * so it never jumps. The swell and fall of a crowd, voice by voice.
 */
const wandering = (random: TRandomHandle, length: number, every: number, low: number, high: number): ((t: number) => number) => {
    const points = Array.from({ length: Math.ceil(length / every) + 2 }, () => random.rand(low, high));
    return (t) => {
        const at = t / every;
        const i = Math.floor(at);
        const a = points[i] ?? low;
        const b = points[i + 1] ?? a;
        return a + (b - a) * (at - i);
    };
};

/**
 * Comes in over `rise` seconds and goes over the last `fall`: a sound that swells and dies away
 * rather than starting and stopping dead.
 */
const swell = (t: number, length: number, rise: number, fall: number): number =>
    Math.max(0, Math.min(1, t / rise, (length - t) / fall));

/**
 * Claps at random moments, about `perSecond` of them, each a crack of hiss that is gone in a few
 * hundredths of a second: hands, many of them.
 */
const clapping = (random: TRandomHandle, sampleRate: number, length: number, perSecond: number, pitch: number): ((t: number) => number) => {
    const hiss = sweptNoise(sampleRate, () => HISS * pitch);
    const claps: Array<{ at: number; loud: number }> = [];
    for (let at = random.rand(0, 1 / perSecond); at < length; at += random.rand(0.2, 1.8) / perSecond) {
        claps.push({ at, loud: random.rand(0.3, 1) });
    }
    const decay = near(random, 0.012, 0.2);
    let next = 0;
    const ringing: Array<{ at: number; loud: number }> = [];
    return (t) => {
        while (next < claps.length && claps[next]!.at <= t) {
            ringing.push(claps[next]!);
            next += 1;
        }
        let level = 0;
        for (let i = ringing.length - 1; i >= 0; i -= 1) {
            const clap = ringing[i]!;
            const ring = clap.loud * Math.exp(-(t - clap.at) / decay);
            if (ring < 0.001) {
                ringing.splice(i, 1);
                continue;
            }
            level = Math.max(level, ring);
        }
        return hiss(t) * level;
    };
};

const RECIPES: Record<TSfxPreset, TRecipe> = {
    // Two notes a fourth apart, the second ringing out.
    coin: {
        length: 0.3,
        make: (random, pitch, length, sampleRate) => {
            const first = near(random, 988, 0.06) * pitch;
            const turn = near(random, 0.06, 0.2);
            const wave = sweptPulse(sampleRate, random.choose([0.25, 0.5]), (t) => (t < turn ? first : first * (4 / 3)));
            return (t) => wave(t) * (t < turn ? 1 : 1 - (t - turn) / (length - turn));
        },
    },
    // A square going up, quicker at first, fading as it climbs.
    jump: {
        length: 0.25,
        make: (random, pitch, length, sampleRate) => {
            const from = near(random, 220, 0.1) * pitch;
            const rise = near(random, 2.6, 0.15);
            const wave = sweptPulse(sampleRate, random.choose([0.125, 0.25]), (t) => from * rise ** Math.sqrt(t / length));
            return (t) => wave(t) * (1 - t / length);
        },
    },
    // A burst of hiss over a thud falling away, gone almost at once.
    hit: {
        length: 0.15,
        make: (random, pitch, length, sampleRate) => {
            const hiss = sweptNoise(sampleRate, () => HISS * pitch);
            const from = near(random, 330, 0.1) * pitch;
            const thud = sweptPulse(sampleRate, 0.5, (t) => from * 0.25 ** (t / length));
            const mix = near(random, 0.6, 0.15);
            return (t) => (hiss(t) * mix + thud(t) * (1 - mix)) * Math.exp(-t / (length / 4));
        },
    },
    // Noise that starts as a crack and slows into a rumble.
    explosion: {
        length: 0.8,
        make: (random, pitch, length, sampleRate) => {
            const from = near(random, 55930, 0.15) * pitch;
            const to = near(random, 1762, 0.15) * pitch;
            const rumble = sweptNoise(sampleRate, (t) => from * (to / from) ** (t / length));
            return (t) => rumble(t) * Math.exp(-t / (length / 3));
        },
    },
    // A stand full of people: two murmurs of noise, low and high, each rising and falling on its
    // own, coming in and dying away. Long, for under a game; make it as long as needed.
    crowd: {
        length: 2.5,
        make: (random, pitch, length, sampleRate) => {
            const low = sweptNoise(sampleRate, () => near(random, 6000, 0.2) * pitch);
            const high = sweptNoise(sampleRate, () => near(random, 22000, 0.2) * pitch);
            const lowLevel = wandering(random, length, near(random, 0.09, 0.2), 0.35, 1);
            const highLevel = wandering(random, length, near(random, 0.05, 0.2), 0.2, 0.8);
            return (t) => (low(t) * lowLevel(t) * 0.6 + high(t) * highLevel(t) * 0.4) * swell(t, length, 0.3, 0.5);
        },
    },
    // An ovation: the crowd roaring up and the clapping over it, loudest early on, then dying down.
    cheer: {
        length: 3,
        make: (random, pitch, length, sampleRate) => {
            const roar = sweptNoise(sampleRate, () => near(random, 9000, 0.2) * pitch);
            const roarLevel = wandering(random, length, near(random, 0.07, 0.2), 0.5, 1);
            const hands = clapping(random, sampleRate, length, near(random, 30, 0.2), pitch);
            const peak = near(random, 0.25, 0.2) * length;
            return (t) => {
                const level = t < peak ? t / peak : (1 - (t - peak) / (length - peak)) ** 1.5;
                return (roar(t) * roarLevel(t) * 0.45 + hands(t) * 0.55) * level;
            };
        },
    },
    // A referee's whistle: a high note warbling fast as the pea inside spins, a breath of hiss
    // over it, and a short tail.
    whistle: {
        length: 0.6,
        make: (random, pitch, length, sampleRate) => {
            const note = near(random, 2600, 0.05) * pitch;
            const trill = near(random, 28, 0.15);
            const wave = sweptPulse(sampleRate, 0.5, (t) => note * (1 + 0.03 * Math.sin(2 * Math.PI * trill * t)));
            const breath = sweptNoise(sampleRate, () => HISS * pitch);
            return (t) => {
                const warble = 0.75 + 0.25 * Math.sin(2 * Math.PI * trill * t);
                return (wave(t) * warble * 0.85 + breath(t) * 0.15) * swell(t, length, 0.01, 0.08);
            };
        },
    },
    // A wooden bat on the ball: a crack of hiss gone in a few thousandths of a second, over a
    // hollow knock that drops and dies quickly.
    bat: {
        length: 0.25,
        make: (random, pitch, length, sampleRate) => {
            const crack = sweptNoise(sampleRate, () => HISS * pitch);
            const from = near(random, 560, 0.1) * pitch;
            const knock = sweptPulse(sampleRate, 0.5, (t) => from * 0.7 ** (t / length));
            const sharp = near(random, 0.004, 0.2);
            const ring = near(random, 0.035, 0.2);
            return (t) => crack(t) * Math.exp(-t / sharp) * 0.55 + knock(t) * Math.exp(-t / ring) * 0.45;
        },
    },
};

/**
 * How long a sound effect takes to come in, in seconds: just enough not to click.
 */
const ATTACK = 0.002;

/**
 * Makes a sound effect from a preset, the way the 8-bit consoles made theirs: a coin, a jump, a hit,
 * an explosion; and for a game with people in it, a crowd, a cheer with clapping, a referee's
 * whistle, a wooden bat on a ball. A seed is one take on the preset, always the same one; another
 * seed, another take. `crowd` and `cheer` are long, for under a scene: `length` makes them as long as
 * needed.
 *
 * Nothing of the browser is used, so the same options give the same samples anywhere.
 *
 * @param options - Which preset, and how it differs from it.
 * @param sampleRate - Samples per second. Default `44100`.
 * @returns The samples, between `-volume` and `volume`.
 *
 * @example
 * ```ts
 * const coin = renderSfx({ preset: 'coin', seed: 3 });
 * const lowJump = renderSfx({ preset: 'jump', pitch: 0.5 });
 * const stands = renderSfx({ preset: 'crowd', length: 8 });
 * ```
 *
 * @category Audio
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const renderSfx = (options: TSfxOptions, sampleRate = 44100): Float32Array => {
    const recipe = RECIPES[options.preset];
    if (recipe === undefined) {
        throw new Error(`[NacatamalOn] renderSfx: there is no preset called '${options.preset}'. There are ${Object.keys(RECIPES).map((name) => `'${name}'`).join(', ')}.`);
    }
    const random = createRandom(options.seed ?? 1);
    const length = Math.max(0.01, options.length ?? near(random, recipe.length, 0.1));
    const volume = Math.min(1, Math.max(0, options.volume ?? 0.8));
    const sample = recipe.make(random, Math.max(0.01, options.pitch ?? 1), length, sampleRate);

    const out = new Float32Array(Math.round(length * sampleRate));
    const attack = ATTACK * sampleRate;
    for (let i = 0; i < out.length; i += 1) {
        out[i] = sample(i / sampleRate) * Math.min(1, i / attack) * volume;
    }
    return out;
};
