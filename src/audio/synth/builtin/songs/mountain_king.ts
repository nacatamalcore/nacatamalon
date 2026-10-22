import type { TSongDoc } from '../../types/t_song';

/**
 * Grieg, In the Hall of the Mountain King (1875): the theme on B and again on F sharp, over a pedal, on the Genesis. A chase: speed it up with setTempo as it gets close.
 */
export const song: TSongDoc = {
    format: 1,
    chip: 'genesis',
    tempo: 138,
    meter: [4, 4],
    voices: {
        fm1: {
            instrument: 'fm-lead',
            notes: "b8 c#' d' e' f#' d' f#'4 | f'8 c#' f'4 e'8 c' e'4 | b8 c#' d' e' f#' d' f#' b' | a'8 f#' d' f#' a'2 |\n" +
                "f#'8 g#' a#' b' c#'' a#' c#''4 | d''8 a#' d''4 c#''8 a#' c#''4 | f#'8 g#' a#' b' c#'' a#' c#'' f#'' | e''8 c#'' a#' c#'' e''2 |",
        },
        fm2: {
            instrument: 'slap-bass',
            volume: 0.7,
            notes: 'b,8 c# d e f# d f#4 | f8 c# f4 e8 c e4 | b,8 c# d e f# d f# b | a8 f# d f# a2 |\n' +
                "f#8 g# a# b c#' a# c#'4 | d'8 a# d'4 c#'8 a# c#'4 | f#8 g# a# b c#' a# c#' f#' | e'8 c#' a# c#' e'2 |",
        },
        fm3: {
            instrument: 'fm-bass',
            notes: 'b,,4 b,, b,, b,, | b,,4 b,, b,, b,, | b,,4 b,, b,, b,, | b,,4 b,, b,, b,, |\n' +
                'f#,,4 f#,, f#,, f#,, | f#,,4 f#,, f#,, f#,, | f#,,4 f#,, f#,, f#,, | f#,,4 f#,, f#,, f#,, |',
        },
        psgNoise: { notes: Array.from({ length: 8 }, () => '@kick x4 @snare x @kick x @snare x |').join(' ') },
    },
};
