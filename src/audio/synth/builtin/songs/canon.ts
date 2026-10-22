import type { TSongDoc } from '../../types/t_song';

/**
 * Pachelbel, Canon in D: its bass going round, with the tune over it, for an ending or a wedding, on the SNES.
 */
export const song: TSongDoc = {
    format: 1,
    chip: 'snes',
    tempo: 64,
    meter: [4, 4],
    echo: { delay: 0.16, feedback: 0.35, volume: 0.25 },
    voices: {
        s1: { instrument: 'strings', notes: "f#'2 e' | d'2 c#' | b2 a | b2 c#' | f#'2 e' | d'2 c#' | b2 a | b2 c#' |" },
        s2: { instrument: 'piano', volume: 0.6, notes: "r1 | r1 | r1 | r1 | d'4 f#' a' g' | f#'4 d' f#' e' | d'4 b d' a | g4 b a g |" },
        s3: { instrument: 'synth-bass', notes: 'd,2 a,, | b,,2 f#,, | g,,2 d,, | g,,2 a,, | d,2 a,, | b,,2 f#,, | g,,2 d,, | g,,2 a,, |' },
    },
};
