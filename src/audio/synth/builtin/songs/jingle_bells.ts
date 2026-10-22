import type { TSongDoc } from '../../types/t_song';

/**
 * Jingle Bells (1857): its chorus, merry, for a snow level or a holiday, on the NES.
 */
export const song: TSongDoc = {
    format: 1,
    tempo: 140,
    meter: [4, 4],
    voices: {
        pulse1: {
            instrument: 'lead',
            notes: "e'4 e' e'2 | e'4 e' e'2 | e'4 g' c'4. d'8 | e'1 | f'4 f' f'4. f'8 | f'4 e' e' e'8 e' | e'4 d' d' e' | d'2 g'2 | e'4 e' e'2 | e'4 e' e'2 | e'4 g' c'4. d'8 | e'1 | f'4 f' f'4. f'8 | f'4 e' e' e'8 e' | g'4 g' f' d' | c'1 |",
        },
        triangle: {
            instrument: 'bass',
            notes: 'c,4 g, c, g, | c,4 g, c, g, | c,4 g, c, g, | c,4 g, c, g, | f,4 c f, c | c,4 g, c, g, | g,,4 d, g,, d, | g,,4 d, g,, d, | c,4 g, c, g, | c,4 g, c, g, | c,4 g, c, g, | c,4 g, c, g, | f,4 c f, c | c,4 g, c, g, | g,,4 d, g,, d, | c,4 g, c, g, |',
        },
        noise: {
            volume: 0.45,
            notes: '@hat x8 x x x x x x x | x8 x x x x x x x | x8 x x x x x x x | x8 x x x x x x x | x8 x x x x x x x | x8 x x x x x x x | x8 x x x x x x x | x8 x x x x x x x | x8 x x x x x x x | x8 x x x x x x x | x8 x x x x x x x | x8 x x x x x x x | x8 x x x x x x x | x8 x x x x x x x | x8 x x x x x x x | x8 x x x x x x x |',
        },
    },
};
