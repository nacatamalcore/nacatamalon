import type { TSongDoc } from '../../types/t_song';

/**
 * Greensleeves, an old English tune: wistful, for a tavern or a long road, on the SNES.
 */
export const song: TSongDoc = {
    format: 1,
    chip: 'snes',
    tempo: 150,
    meter: [6, 8],
    echo: { delay: 0.16, feedback: 0.3, volume: 0.25 },
    voices: {
        s1: { instrument: 'flute', notes: "r4 r8 r4 a8 | c'4 d'8 e'8. f'16 e'8 | d'4 b8 g8. a16 b8 | c'4 a8 a8. g#16 a8 | b4 g#8 e4 a8 |" },
        s2: { instrument: 'guitar', volume: 0.7, notes: 'r2. | a,8 e a c\' a e | g,8 d g b g d | a,8 e a c\' a e | e,8 b, e g# e b, |' },
    },
};
