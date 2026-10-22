import type { TSongDoc } from '../../types/t_song';

/**
 * Bach, the opening of the Toccata and Fugue in D minor: an organ for a castle or the last boss, on the SNES.
 */
export const song: TSongDoc = {
    format: 1,
    chip: 'snes',
    tempo: 60,
    meter: [4, 4],
    echo: { delay: 0.24, feedback: 0.5, volume: 0.35 },
    voices: {
        s1: {
            instrument: 'organ',
            notes: "a'16 g' a'2.. | g'16 f' e' d' c#'4 d'2 | a16 g a2.. | g16 f e d c#4 d2 |",
        },
        s2: { instrument: 'organ', volume: 0.7, notes: "a16 g a2.. | g16 f e d c#4 d2 | a,16 g, a,2.. | g,16 f, e, d, c#,4 d,2 |" },
        s3: { instrument: 'choir', volume: 0.5, notes: 'd,1 | a,,2 d,2 | d,,1 | a,,,2 d,,2 |' },
    },
};
