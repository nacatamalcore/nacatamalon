import type { TSongDoc } from '../../types/t_song';

/**
 * Liszt, the quick dance that closes the Hungarian Rhapsody No. 2 (1847): wild and fast, for a
 * cartoon chase, on the NES.
 */
export const song: TSongDoc = {
    format: 1,
    tempo: 140,
    meter: [2, 4],
    voices: {
        pulse1: {
            instrument: 'lead',
            notes: "b#8 c#' b8. c#'16 | b#8 c#' b8. c#'16 | b#8 c#' a#8. c#'16 | b#8 c#' a#8. c#'16 |\n" +
                "b#8 c#' d#'8. c#'16 | b#8 c#' d#'8. c#'16 | b#8 c#' f#'8. c#'16 | b#8 c#' f#'4 |",
        },
        pulse2: {
            instrument: 'major',
            volume: 0.45,
            notes: 'r8 c#8 r c# | r8 c#8 r c# | r8 f#8 r f# | r8 f#8 r f# | r8 c#8 r c# | r8 c#8 r c# | r8 f#8 r f# | r8 f#8 r f# |',
        },
        triangle: {
            instrument: 'bass',
            notes: 'g#,8 r c#, r | g#,8 r c#, r | f#,8 r c#, r | f#,8 r c#, r | g#,8 r c#, r | g#,8 r c#, r | f#,8 r c#, r | f#,8 r c#, r |',
        },
        noise: { notes: Array.from({ length: 8 }, () => '@kick x8 @hat x @snare x @hat x |').join(' '), volume: 0.5 },
    },
};
