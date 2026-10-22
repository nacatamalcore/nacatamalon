import type { TSongDoc } from '../../types/t_song';

/**
 * Mozart, Eine kleine Nachtmusik (1787): its opening, bright and courtly, for a palace or a title, on the SNES.
 */
export const song: TSongDoc = {
    format: 1,
    chip: 'snes',
    tempo: 130,
    meter: [4, 4],
    echo: {
        delay: 0.12,
        feedback: 0.25,
        volume: 0.2,
    },
    voices: {
        s1: {
            instrument: 'strings',
            notes: "g'4 r8 d'8 g'4 r8 d'8 | g'8 d' g' b' d''4 r4 | c''4 r8 a'8 c''4 r8 a'8 | c''8 a' f#' a' d'4 r4 |",
        },
        s2: {
            instrument: 'strings',
            volume: 0.6,
            notes: 'b2 b | b2. r4 | a2 a | a2. r4 |',
        },
        s3: {
            instrument: 'synth-bass',
            notes: 'g,4 r g, r | g,4 b, d r | d4 r d r | d4 f# d, r |',
        },
    },
};
