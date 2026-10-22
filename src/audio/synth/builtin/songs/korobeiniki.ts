import type { TSongDoc } from '../../types/t_song';

/**
 * Korobeiniki, a Russian folk song (1861): quick and catchy, for a puzzle, on the NES.
 */
export const song: TSongDoc = {
    format: 1,
    tempo: 144,
    meter: [4, 4],
    voices: {
        pulse1: {
            instrument: 'lead',
            notes: "e'4 b8 c' d'4 c'8 b | a4 a8 c' e'4 d'8 c' | b4. c'8 d'4 e' | c'4 a a2 | r8 d'4 f'8 a'4 g'8 f' | e'4. c'8 e'4 d'8 c' | b4 b8 c' d'4 e' | c'4 a a2 |",
        },
        pulse2: {
            volume: 0.45,
            notes: "@major e1 | @minor a1 | @major e1 | @minor a1 | @minor d'1 | @major c'1 | @major e1 | @minor a1 |",
        },
        triangle: {
            instrument: 'bass',
            notes: 'e,,8 e, e,, e, e,, e, e,, e, | a,,8 a, a,, a, a,, a, a,, a, | e,,8 e, e,, e, e,, e, e,, e, | a,,8 a, a,, a, a,, a, a,, a, | d,8 d d, d d, d d, d | c,8 c c, c c, c c, c | e,,8 e, e,, e, e,, e, e,, e, | a,,8 a, a,, a, a,, a, a,, a, |',
        },
        noise: {
            volume: 0.5,
            notes: '@kick x8 @hat x @snare x @hat x @kick x x @snare x @hat x | @kick x8 @hat x @snare x @hat x @kick x x @snare x @hat x | @kick x8 @hat x @snare x @hat x @kick x x @snare x @hat x | @kick x8 @hat x @snare x @hat x @kick x x @snare x @hat x | @kick x8 @hat x @snare x @hat x @kick x x @snare x @hat x | @kick x8 @hat x @snare x @hat x @kick x x @snare x @hat x | @kick x8 @hat x @snare x @hat x @kick x x @snare x @hat x | @kick x8 @hat x @snare x @hat x @kick x x @snare x @hat x |',
        },
    },
};
