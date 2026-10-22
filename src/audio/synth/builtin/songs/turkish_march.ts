import type { TSongDoc } from '../../types/t_song';

/**
 * Mozart, Rondo alla Turca (1783): the first phrase, a march for a map or a level, on the NES.
 */
export const song: TSongDoc = {
    format: 1,
    tempo: 120,
    meter: [2, 4],
    voices: {
        pulse1: {
            instrument: 'pluck',
            notes: "b16 a g# a c'8 r8 | d'16 c' b c' e'8 r8 | f'16 e' d#' e' b' a' g#' a' | b'16 a' g#' a' c''4 |\n" +
                "b16 a g# a c'8 r8 | d'16 c' b c' e'8 r8 | f'16 e' d#' e' b' a' g#' a' | b'16 a' g#' a' e'8 a'8 |",
        },
        pulse2: { instrument: 'minor', volume: 0.45, notes: "a4 a | a4 a | e4 e | a4 a | a4 a | a4 a | e4 e | a4 a |" },
        triangle: { instrument: 'bass', notes: 'a,4 e, | a,4 e, | e,4 b,, | a,4 a, | a,4 e, | a,4 e, | e,4 b,, | a,4 a,, |' },
        noise: { notes: Array.from({ length: 8 }, () => '@kick x8 @hat x @snare x @hat x |').join(' '), volume: 0.5 },
    },
};
