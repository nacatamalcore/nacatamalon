import type { TSongDoc } from '../../types/t_song';

/**
 * Twinkle, Twinkle, Little Star, an old French tune: gentle, for a night sky, a lullaby or a first level, on the NES.
 */
export const song: TSongDoc = {
    format: 1,
    tempo: 100,
    meter: [4, 4],
    voices: {
        pulse1: {
            instrument: 'bell',
            notes: "c'4 c' g' g' | a'4 a' g'2 | f'4 f' e' e' | d'4 d' c'2 | g'4 g' f' f' | e'4 e' d'2 | g'4 g' f' f' | e'4 e' d'2 | c'4 c' g' g' | a'4 a' g'2 | f'4 f' e' e' | d'4 d' c'2 |",
        },
        triangle: {
            instrument: 'bass',
            notes: 'c,2 c, | f,2 c, | f,2 c, | g,2 c, | c,2 f, | c,2 g, | c,2 f, | c,2 g, | c,2 c, | f,2 c, | f,2 c, | g,2 c, |',
        },
    },
};
