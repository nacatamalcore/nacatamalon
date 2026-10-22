import type { TSongDoc } from '../../types/t_song';

/**
 * Wagner, the Bridal Chorus from Lohengrin (1850), Here Comes the Bride: for a happy ending, on the SNES.
 */
export const song: TSongDoc = {
    format: 1,
    chip: 'snes',
    tempo: 76,
    meter: [4, 4],
    echo: { delay: 0.16, feedback: 0.3, volume: 0.25 },
    voices: {
        s1: {
            instrument: 'brass',
            notes: "r2. c4 | f4. f8 f2 | r2. c4 | g4. e8 f2 | r2. c4 | f4. a#8 a#4 a | g4. f8 e4. f8 | g2 r2 |",
        },
        s2: { instrument: 'strings', volume: 0.6, notes: "r1 | a1 | a1 | a#2 a2 | a1 | a#1 | c'1 | c'1 |" },
        s3: { instrument: 'organ', volume: 0.6, notes: 'r1 | f,1 | f,1 | c,2 f,2 | f,1 | a#,,1 | c,1 | c,1 |' },
    },
};
