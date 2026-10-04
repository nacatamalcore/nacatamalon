import { describe, expect, it } from 'bun:test';
import { bakeColorCurve, bakeScaleCurve, CURVE_STEPS, sampleColorStops, sampleScaleStops } from '../src/gameobjects/particles/bake_curves';
import { getColor } from '../src/color';

/**
 * The curves a particle walks as it ages, and the table they are turned into.
 *
 * The table is the whole point: walking the stops is fine once and silly where it is actually read
 * from, which is every living particle, every frame, for two curves at a time. What has to hold is
 * that the fast answer and the slow one agree.
 */

const stops = (...pairs: [number, string][]) =>
    pairs.map(([t, hex]) => ({ t, color: getColor(hex), alpha: 1 }));

describe('reading a colour curve', () => {
    it('holds at the first stop before it, and the last one after', () => {
        const curve = stops([0.25, '#ff0000'], [0.75, '#0000ff']);

        expect(sampleColorStops(curve, 0)[0]).toBeCloseTo(1, 5);
        expect(sampleColorStops(curve, 1)[2]).toBeCloseTo(1, 5);
    });

    it('meets in the middle between two stops', () => {
        const curve = stops([0, '#000000'], [1, '#ffffff']);

        expect(sampleColorStops(curve, 0.5)[0]).toBeCloseTo(0.5, 5);
    });

    it('is a constant when there is only one stop', () => {
        const curve = stops([0.4, '#336699']);

        expect(sampleColorStops(curve, 0)).toEqual(sampleColorStops(curve, 1));
    });

    it('is a hard edge when two stops sit at the same place', () => {
        // No division by a span of nothing, and the second one wins: that is a cut, which is a
        // thing somebody might want.
        const curve = stops([0, '#000000'], [0.5, '#000000'], [0.5, '#ffffff'], [1, '#ffffff']);

        expect(sampleColorStops(curve, 0.49)[0]).toBeCloseTo(0, 5);
        expect(sampleColorStops(curve, 0.51)[0]).toBeCloseTo(1, 5);
    });
});

describe('the table it is turned into', () => {
    it('agrees with walking the stops, at every step it holds', () => {
        const curve = stops([0, '#ffffff'], [0.35, '#ff9d2e'], [1, '#8c1d00']);
        const table = bakeColorCurve(curve);

        for (let i = 0; i <= CURVE_STEPS; i++) {
            const [r, g, b] = sampleColorStops(curve, i / CURVE_STEPS);
            expect(table[i * 4]!).toBeCloseTo(r, 5);
            expect(table[i * 4 + 1]!).toBeCloseTo(g, 5);
            expect(table[i * 4 + 2]!).toBeCloseTo(b, 5);
        }
    });

    it('does the same for the size curve', () => {
        const curve = [{ t: 0, scale: 0.6 }, { t: 0.3, scale: 1 }, { t: 1, scale: 0.35 }];
        const table = bakeScaleCurve(curve);

        for (let i = 0; i <= CURVE_STEPS; i++) {
            expect(table[i]!).toBeCloseTo(sampleScaleStops(curve, i / CURVE_STEPS), 5);
        }
    });

    it('covers both ends, so a particle at its first and last frame reads a real value', () => {
        const table = bakeScaleCurve([{ t: 0, scale: 2 }, { t: 1, scale: 5 }]);

        expect(table).toHaveLength(CURVE_STEPS + 1);
        expect(table[0]!).toBeCloseTo(2, 5);
        expect(table[CURVE_STEPS]!).toBeCloseTo(5, 5);
    });
});
