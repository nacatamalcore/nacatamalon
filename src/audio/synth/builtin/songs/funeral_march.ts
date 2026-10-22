import type { TSongDoc } from '../../types/t_song';

/**
 * Chopin, the Funeral March from his second sonata (1839): slow and heavy, for a game over, on the SNES.
 */
export const song: TSongDoc = {
    format: 1,
    chip: 'snes',
    tempo: 50,
    meter: [4, 4],
    echo: { delay: 0.2, feedback: 0.35, volume: 0.3 },
    voices: {
        s1: {
            instrument: 'strings',
            notes: "a#4 a#8. a#16 a#4 r4 | c#'8. c'16 c'8. a#16 a#8. a16 a#4 |\n" +
                "a#4 a#8. a#16 a#4 r4 | c#'8. c'16 c'8. a#16 a#8. a16 a#4 |",
        },
        s2: { instrument: 'piano', notes: 'a#,,4 f, a#,, f, | a#,,4 f, a#,, f, | a#,,4 f, a#,, f, | a#,,4 f, a#,,2 |' },
        s3: { instrument: 'organ', volume: 0.5, notes: 'a#,1 | a#,1 | a#,1 | a#,1 |' },
    },
};
