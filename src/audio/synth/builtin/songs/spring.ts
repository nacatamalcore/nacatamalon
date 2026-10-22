import type { TSongDoc } from '../../types/t_song';

/**
 * Vivaldi, Spring from The Four Seasons (1725): its opening, bright and birdlike, for a meadow or a new day, on the SNES.
 */
export const song: TSongDoc = {
    format: 1,
    chip: 'snes',
    tempo: 110,
    meter: [4, 4],
    loop: {
        bar: 2,
    },
    echo: {
        delay: 0.12,
        feedback: 0.3,
        volume: 0.2,
    },
    voices: {
        s1: {
            instrument: 'strings',
            notes: "r2. e'4 | g#'4 g#' g#' f#'8 e' | b'2. b'8 a' | g#'4 g#' g#' f#'8 e' | b'2. b'8 a' | g#'4 a'8 b' a'4 g#' | f#'2 r4 e' | f#'2 e'4 e' |",
        },
        s2: {
            instrument: 'strings',
            volume: 0.55,
            notes: "r1 | b1 | b1 | b1 | b1 | c#'2 b | a2 b | g#1 |",
        },
        s3: {
            instrument: 'synth-bass',
            notes: 'r1 | e,1 | e,1 | e,1 | e,1 | c#,2 e, | b,,2 b,, | e,1 |',
        },
    },
};
