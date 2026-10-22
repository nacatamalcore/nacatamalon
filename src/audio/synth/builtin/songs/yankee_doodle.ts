import type { TSongDoc } from '../../types/t_song';

/**
 * Yankee Doodle, an old marching tune: a fife and drum, for a parade or a toy soldier, on the NES.
 */
export const song: TSongDoc = {
    format: 1,
    tempo: 120,
    meter: [2, 4],
    voices: {
        pulse1: {
            instrument: 'pluck',
            notes: "c'8 c' d' e' | c'8 e' d'4 | c'8 c' d' e' | c'4 b | c'8 c' d' e' | f'8 e' d' c' | b8 g a b | c'4 c' |",
        },
        triangle: {
            instrument: 'bass',
            notes: 'c,4 g, | c,4 g, | c,4 g, | g,,4 d, | c,4 g, | c,4 g, | g,,4 d, | c,4 c, |',
        },
        noise: {
            volume: 0.5,
            notes: '@snare x8 x x16 x x8 | x8 x x16 x x8 | x8 x x16 x x8 | x8 x x16 x x8 | x8 x x16 x x8 | x8 x x16 x x8 | x8 x x16 x x8 | x8 x x16 x x8 |',
        },
    },
};
