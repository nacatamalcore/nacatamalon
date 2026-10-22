import type { TSongDoc } from '../../types/t_song';

/**
 * Johann Strauss II, The Blue Danube (1866), the first waltz: slow and swaying, on the SNES.
 */
export const song: TSongDoc = {
    format: 1,
    chip: 'snes',
    tempo: 160,
    meter: [3, 4],
    loop: { bar: 2 },
    echo: { delay: 0.16, feedback: 0.3, volume: 0.25 },
    voices: {
        s1: {
            instrument: 'strings',
            notes: "r2 d4 |\n" +
                "d4 f# a | a2. | r4 a'4 a' | r4 f#'4 f#' | d4 f# a | a2. | r4 a'4 a' | r4 g'4 g' |\n" +
                "c#4 e b | b2. | r4 b'4 b' | r4 g'4 g' | c#4 e b | b2. | r4 b'4 b' | r4 f#'4 f#' |",
        },
        s2: {
            instrument: 'synth-bass',
            notes: 'r2. |\n' +
                'd,4 r2 | d,4 r2 | d,4 r2 | d,4 r2 | d,4 r2 | d,4 r2 | d,4 r2 | a,,4 r2 |\n' +
                'a,,4 r2 | a,,4 r2 | a,,4 r2 | a,,4 r2 | a,,4 r2 | a,,4 r2 | a,,4 r2 | d,4 r2 |',
        },
        s3: {
            instrument: 'piano',
            volume: 0.4,
            notes: 'r2. |\n' +
                'r4 f# a | r4 f# a | r4 f# a | r4 f# a | r4 f# a | r4 f# a | r4 f# a | r4 e g |\n' +
                'r4 e g | r4 e g | r4 e g | r4 e g | r4 e g | r4 e g | r4 e g | r4 f# a |',
        },
    },
};
