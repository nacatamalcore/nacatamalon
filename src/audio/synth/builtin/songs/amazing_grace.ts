import type { TSongDoc } from '../../types/t_song';

/**
 * Amazing Grace, a hymn (1779): slow and warm, for a sunrise, a farewell or a temple, on the SNES.
 */
export const song: TSongDoc = {
    format: 1,
    chip: 'snes',
    tempo: 80,
    meter: [3, 4],
    loop: {
        bar: 2,
    },
    echo: {
        delay: 0.2,
        feedback: 0.35,
        volume: 0.3,
    },
    voices: {
        s1: {
            instrument: 'flute',
            notes: "r2 g4 | c'2 e'8 c' | e'2 d'4 | c'2 a4 | g2 g4 | c'2 e'8 c' | e'2 d'4 | g'2. | g'2 e'8 g' | e'2 c'4 | g2 a8 c' | a2 g4 | g2 g4 | c'2 e'8 c' | e'2 d'4 | c'2 g4 |",
        },
        s2: {
            instrument: 'strings',
            volume: 0.55,
            notes: 'r2. | e2. | g2. | f2. | e2. | e2. | g2. | g2. | e2. | e2. | f2. | e2. | e2. | e2. | g2. | e2. |',
        },
        s3: {
            instrument: 'choir',
            volume: 0.5,
            notes: 'r2. | c,2. | c,2. | f,2. | c,2. | c,2. | g,,2. | g,,2. | c,2. | c,2. | f,2. | c,2. | c,2. | c,2. | g,,2. | c,2. |',
        },
    },
};
