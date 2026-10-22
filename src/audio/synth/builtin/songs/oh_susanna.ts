import type { TSongDoc } from '../../types/t_song';

/**
 * Foster, Oh! Susanna (1848): bouncy and cheerful, for a farm, a road trip or a western town, on the NES.
 */
export const song: TSongDoc = {
    format: 1,
    tempo: 120,
    meter: [4, 4],
    loop: {
        bar: 2,
    },
    voices: {
        pulse1: {
            instrument: 'lead',
            notes: "r2 r4 c'8 d' | e'4 g' g'4. a'8 | g'4 e' c'4. d'8 | e'4 e' d' c' | d'2. c'8 d' | e'4 g' g'4. a'8 | g'4 e' c'4. d'8 | e'4 e' d' d' | c'2 r4 c'8 d' |",
        },
        triangle: {
            instrument: 'bass',
            notes: 'r1 | c,4 g, c, g, | c,4 g, c, g, | g,,4 d, g,, d, | g,,4 d, g,, d, | c,4 g, c, g, | c,4 g, c, g, | g,,4 d, g,, d, | c,4 g, c, g, |',
        },
        noise: {
            volume: 0.45,
            notes: 'r1 | @kick x4 @snare x @kick x @snare x | @kick x4 @snare x @kick x @snare x | @kick x4 @snare x @kick x @snare x | @kick x4 @snare x @kick x @snare x | @kick x4 @snare x @kick x @snare x | @kick x4 @snare x @kick x @snare x | @kick x4 @snare x @kick x @snare x | @kick x4 @snare x @kick x @snare x |',
        },
    },
};
