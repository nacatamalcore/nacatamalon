import type { TSongDoc } from '../../types/t_song';

/**
 * Handel, the Hallelujah chorus from Messiah (1741): a choir of four in full glory, on the SNES. The
 * notes are from a score in the public domain.
 */
export const song: TSongDoc = {
    format: 1,
    chip: 'snes',
    tempo: 96,
    meter: [4, 4],
    echo: { delay: 0.12, feedback: 0.25, volume: 0.2 },
    voices: {
        s1: {
            instrument: 'choir',
            notes: "r1 | r1 | r1 | d'4. a8 b a r4 | d'4. a8 b a r8 d'16 d' | d'8 d' r8 d'16 d' d'8 d' r8 d' | c#'8 d'4 c#'8 d'4 r4 | e'4. a8 f#' e' r4 |\n" +
                "e'4. a8 f#' e' r8 e'16 e' | f#'8 e' r8 e'16 e' f#'8 e' r8 e' | f#'8 e' d'4 c#'4 r4 | a2 b4 c#'4 | d'8 d d'4. d'8 c#'4 | b2 a4 r8 e'16 e' | d'8 c#' r8 e'16 e' d'8 c#' r8 e'16 e' | f#'8 e' r8 e'16 e' f#'8 e' r4 |",
        },
        s2: {
            instrument: 'choir',
            volume: 0.55,
            notes: 'r1 | r1 | r1 | a4. a8 g f# r4 | a4. a8 g f# r8 a16 a | b8 a r8 a16 a b8 a r8 a | g8 f# e e f#4 r4 | a4. a8 a a r4 |\n' +
                'a4. a8 a a r8 a16 a | a8 a r8 a16 a a8 a r8 a | a4. g#8 a4 r4 | a2 b,4 c#4 | d8 d d4. d8 c#4 | b,2 a,4 r8 a16 a | a8 a r8 a16 a a8 a r8 a16 a | a8 a r8 a16 a a8 a r4 |',
        },
        s3: {
            instrument: 'choir',
            volume: 0.55,
            notes: 'r1 | r1 | r1 | f#4. d8 d d r4 | f#4. d8 d d r8 d16 d | g8 f# r8 d16 d g8 f# r8 d | e8 a,4 a,8 a,4 r4 | c#4. e8 d c# r4 |\n' +
                'c#4. e8 d c# r8 e16 e | d8 c# r8 e16 e d8 c# r8 e | d8 e f# d e4 r4 | a,2 b,4 c#4 | d8 d, d4. d8 c#4 | b,2 a,4 r8 a,16 a, | f#8 e r8 e16 e f#8 e r8 e16 e | d8 c# r8 e16 e d8 c# r4 |',
        },
        s4: {
            instrument: 'strings',
            volume: 0.8,
            notes: 'd,8 e, f#, d, g, d, f#, a, | d,8 e, f#, d, e, d, r8 f#, | e,8 d, a, a,, d,4 r4 | d,8 d, e, f#, g, d, r4 | d,8 d, e, f#, g, d, r8 f#,16 f#, | g,8 d, r8 f#,16 f#, g,8 d, r8 f#, | e,8 d, a, a,, d, f#, e, d, | a,4. c#8 d a, r4 |\n' +
                'a,4. c#8 d a, r8 c#16 c# | d8 a, r8 c#16 c# d8 a, r8 c# | d8 c# b,4 a,4 r4 | a,2 b,4 c#4 | d8 d, d2 c#4 | b,2 a,4 r8 c#16 c# | d8 a, r8 c#16 c# d8 a, r8 c#16 c# | d8 a, r8 c#16 c# d8 a, r4 |',
        },
        s5: {
            instrument: 'strings',
            volume: 0.45,
            notes: "d'4. a'8 b' a' r4 | d''4. f#'8 g' f#' r8 a' | g'8 f#' e'4 d'8 a b c#' | d'4 r4 d'4. a8 | f#8 d r4 d''4. a'8 | d'8 f#'16 f#' g'8 f#' r8 a'16 a' b'8 a' | r4 r8 c#'8 f#' a' g' f#' | e'4 r4 a'4. e'8 |\n" +
                "c#'4 r4 r8 e'16 e' f#'8 e' | r8 c#''16 c#'' d''8 c#'' r8 c#''16 c#'' d''8 c#'' | f#'8 a'4 g#'8 a' e'16 e' f#'8 e' | a2 b4 c#'4 | d'8 d d'2 c#'4 | b2 a4 r8 a'16 a' | d''8 c#'' r8 a'16 a' d''8 c#'' r8 a'16 a' | d''8 c#''16 c#'' c#''8 a'16 a' d''8 c#'' r4 |",
        },
    },
};
