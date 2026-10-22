import type { TSongDoc } from '../../types/t_song';

/**
 * Rimsky-Korsakov, Flight of the Bumblebee (1900): its buzzing run, for a swarm, a panic or a timer, on the Genesis.
 */
export const song: TSongDoc = {
    format: 1,
    chip: 'genesis',
    tempo: 160,
    meter: [2, 4],
    voices: {
        fm1: {
            instrument: 'fm-lead',
            notes: "e''16 d#'' d'' c#'' d'' c#'' c'' b' | c''16 b' a#' a' g#' g' f#' f' | e'16 f' e' d#' e' f' e' d#' | e'16 f' e' d#' e' f' e' d#' |",
        },
        fm2: {
            instrument: 'fm-bass',
            notes: 'a,8 r a, r | a,8 r a, r | e,8 r e, r | e,8 r e, r |',
        },
        psgNoise: {
            notes: '@hat x16 x x x x x x x | x16 x x x x x x x | x16 x x x x x x x | x16 x x x x x x x |',
        },
    },
};
