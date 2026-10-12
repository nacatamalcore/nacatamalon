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
};

/**
 * How long a sound effect takes to come in, in seconds: just enough not to click.
 */
const ATTACK = 0.002;

/**
 * Makes a sound effect from a preset, the way the 8-bit consoles made theirs: a coin, a jump, a hit,
 * an explosion. A seed is one take on the preset, always the same one; another seed, another take.
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
