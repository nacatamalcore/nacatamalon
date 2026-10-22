import type { TSongDoc } from '../../types/t_song';

/**
 * Beethoven, Ode to Joy, from the Ninth Symphony (1824): bright, for a victory or an ending, on the NES.
 */
export const song: TSongDoc = {
    format: 1,
    tempo: 120,
    meter: [4, 4],
    voices: {
        pulse1: {
            instrument: 'lead',
            notes: "f#'4 f#' g' a' | a' g' f#' e' | d' d' e' f#' | f#'4. e'8 e'2 |\n" +
                "f#'4 f#' g' a' | a' g' f#' e' | d' d' e' f#' | e'4. d'8 d'2 |",
        },
        pulse2: { instrument: 'major', volume: 0.5, notes: "d'1 | a1 | d'1 | a1 | d'1 | a1 | d'1 | a2 d'2 |" },
        triangle: {
            instrument: 'bass',
            notes: 'd,4 f#, a, f#, | a,,4 c#, e, c#, | d,4 f#, a, f#, | a,,4 c#, e, a,, |\n' +
                'd,4 f#, a, f#, | a,,4 c#, e, c#, | d,4 f#, a, f#, | a,,4 c#, d,2 |',
        },
        noise: { notes: Array.from({ length: 8 }, () => '@kick x4 @snare x @kick x @snare x |').join(' '), volume: 0.6 },
    },
};
