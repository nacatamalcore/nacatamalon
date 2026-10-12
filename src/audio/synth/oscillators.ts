/**
 * The waves of an 8-bit console, one sample at a time, with nothing of the browser in them: the same
 * numbers come out in a test, in the editor and on the desktop runtime.
 *
 * Each returns a value between `-1` and `1`.
 */

/**
 * How fast the console's processor runs, which is what its noise is clocked from.
 */
const CPU_HZ = 1789773;

/**
 * The sixteen speeds the noise can run at, in processor cycles per step: short is a hiss, long a
 * rumble.
 */
const NOISE_PERIODS = [4, 8, 16, 32, 64, 96, 128, 160, 202, 254, 380, 508, 762, 1016, 2034, 4068];

/**
 * The frequency of a MIDI pitch, tuned to the A of 440 Hz.
 *
 * @internal
 */
export const frequencyOf = (pitch: number): number => 440 * 2 ** ((pitch - 69) / 12);

/**
 * A square wave that spends `duty` of each cycle up. Moved so it sits around zero whatever its
 * duty, and scaled back so it still never leaves `-1..1`: a thin pulse off centre would click when
 * a note starts and stops.
 *
 * @internal
 */
export const pulse = (phase: number, duty: number): number => {
    const offset = 2 * duty - 1;
    return ((phase % 1 < duty ? 1 : -1) - offset) / (1 + Math.abs(offset));
};

/**
 * The console's triangle: not smooth but 32 steps, down from the top and back up, which is the grain
 * its bass has.
 *
 * @internal
 */
export const triangle = (phase: number): number => {
    const step = Math.floor((phase % 1) * 32);
    const level = step < 16 ? 15 - step : step - 16;
    return level / 7.5 - 1;
};

/**
 * The console's noise: a 15-bit shift register, stepped `steps` times a sample (fractions carry
 * over), heard as its lowest bit. How fast it is stepped is what it sounds like.
 *
 * @internal
 */
export const createShiftRegister = (): ((steps: number) => number) => {
    let register = 1;
    let clock = 0;
    return (steps) => {
        clock += steps;
        while (clock >= 1) {
            const feedback = (register ^ (register >> 1)) & 1;
            register = (register >> 1) | (feedback << 14);
            clock -= 1;
        }
        return register & 1 ? -1 : 1;
    };
};

/**
 * How many times a second the noise is stepped for a pitch: one of the console's sixteen speeds,
 * higher pitch, more of a hiss.
 *
 * @internal
 */
export const noiseRateOf = (pitch: number): number => {
    const index = Math.min(NOISE_PERIODS.length - 1, Math.max(0, Math.round((96 - pitch) / 4)));
    return CPU_HZ / NOISE_PERIODS[index]!;
};

/**
 * Noise at one of the console's speeds, chosen by the pitch, one sample a call.
 *
 * @internal
 */
export const createNoise = (pitch: number, sampleRate: number): (() => number) => {
    const step = createShiftRegister();
    const steps = noiseRateOf(pitch) / sampleRate;
    return () => step(steps);
};
