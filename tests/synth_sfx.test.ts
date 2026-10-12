import { describe, expect, it } from 'bun:test';
import { renderSfx } from '../src';
import { analyzeAudio } from '../src/authoring';
import type { TSfxPreset } from '../src';

/**
 * Sound effects from presets. Nobody can check by ear in a test, so what is checked is what breaks a
 * game when it is wrong: a sound that is silent, one that distorts, and one that is not the same
 * when asked for again.
 */

const RATE = 44100;
const PRESETS: TSfxPreset[] = ['coin', 'jump', 'hit', 'explosion'];

/**
 * Times a track crosses zero going up, per second: rough, but enough to tell higher from lower.
 */
const rises = (track: Float32Array): number => {
    let count = 0;
    for (let i = 1; i < track.length; i += 1) {
        if (track[i - 1]! < 0 && track[i]! >= 0) {
            count += 1;
        }
    }
    return count / (track.length / RATE);
};

describe('a sound effect', () => {
    for (const preset of PRESETS) {
        it(`'${preset}' is heard, never distorts, and peaks at the volume asked`, () => {
            const sound = renderSfx({ preset });
            const measure = analyzeAudio(sound, RATE);

            expect(measure.duration).toBeGreaterThan(0.05);
            expect(measure.peak).toBeGreaterThan(0.2);
            expect(measure.peak).toBeLessThanOrEqual(0.8 + 1e-6);
            expect(measure.clipped).toBe(0);
            // And it dies away rather than stopping dead.
            expect(Math.abs(sound.at(-1)!)).toBeLessThan(0.1);
        });
    }

    it('is the same sound for the same seed, and another take for another', () => {
        expect(renderSfx({ preset: 'jump', seed: 4 })).toEqual(renderSfx({ preset: 'jump', seed: 4 }));
        expect(renderSfx({ preset: 'jump', seed: 4 })).not.toEqual(renderSfx({ preset: 'jump', seed: 5 }));
    });

    it('goes higher with pitch and lasts what it is asked to', () => {
        const low = renderSfx({ preset: 'coin', length: 0.3 });
        const high = renderSfx({ preset: 'coin', length: 0.3, pitch: 2 });

        expect(high.length).toBe(Math.round(0.3 * RATE));
        expect(rises(high) / rises(low)).toBeCloseTo(2, 0);
    });

    it('is as loud as asked', () => {
        expect(analyzeAudio(renderSfx({ preset: 'coin', volume: 0.4 }), RATE).peak).toBeLessThanOrEqual(0.4 + 1e-6);
    });

    it('says which presets there are when asked for one that is not', () => {
        expect(() => renderSfx({ preset: 'laser' as TSfxPreset })).toThrow("'coin', 'jump', 'hit', 'explosion'");
    });
});
