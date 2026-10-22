import type { TSongDoc } from '../../types/t_song';

/**
 * Satie, Gymnopédie No. 1 (1888): slow and still, for the credits or a calm place, on the SNES.
 */
export const song: TSongDoc = {
    format: 1,
    chip: 'snes',
    tempo: 72,
    meter: [3, 4],
    loop: { bar: 3 },
    echo: { delay: 0.24, feedback: 0.4, volume: 0.3 },
    voices: {
        s1: {
            instrument: 'flute',
            notes: "r2. | r2. | r2 f#'4 | a'4 g' f#' | c#'4 b c#' | d'4 a2 | f#2. | r2. |",
        },
        s2: { instrument: 'piano', volume: 0.6, notes: 'g,,4 b, d | d,,4 a, c# | g,,4 b, d | d,,4 a, c# | g,,4 b, d | d,,4 a, c# | g,,4 b, d | d,,4 a, c# |' },
    },
};
