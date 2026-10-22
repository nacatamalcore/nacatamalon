import type { TSongDoc } from '../../types/t_song';

/**
 * Fučík, Entry of the Gladiators (1897): the circus march, its tune zigzagging down, on the NES.
 */
export const song: TSongDoc = {
    format: 1,
    tempo: 220,
    meter: [4, 4],
    voices: {
        pulse1: {
            instrument: 'lead',
            notes: "g'8 f#' g' e' f' e' f' d' | e'8 d#' e' c' d' c#' d' b | c'8 b c' a b a# b g | a4 c' e' g' |\n" +
                "g'8 f#' g' e' f' e' f' d' | e'8 d#' e' c' d' c#' d' b | c'8 b c' a b g a b | c'2 r2 |",
        },
        triangle: {
            instrument: 'bass',
            notes: 'c,4 g, c, g, | g,,4 d, g,, d, | f,,4 c, g,, d, | g,,4 d, g,, b,, |\n' +
                'c,4 g, c, g, | g,,4 d, g,, d, | f,,4 c, g,, d, | c,4 g, c,2 |',
        },
        noise: { notes: Array.from({ length: 8 }, () => '@kick x4 @hat x @snare x @hat x |').join(' '), volume: 0.5 },
    },
};
