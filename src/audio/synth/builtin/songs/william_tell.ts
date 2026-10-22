import type { TSongDoc } from '../../types/t_song';

/**
 * Rossini, the galop of the William Tell Overture (1829): the gallop, for a race or a charge, on the Genesis.
 */
export const song: TSongDoc = {
    format: 1,
    chip: 'genesis',
    tempo: 150,
    meter: [2, 4],
    voices: {
        fm1: {
            instrument: 'fm-brass',
            notes: "e'16 e' e'8 e'16 e' e'8 | e'16 e' e'8 a'8 b'8 | c#''16 c#'' c#''8 c#''16 c#'' c#''8 | c#''16 c#'' c#''8 b'8 a'8 |\n" +
                "e'16 e' e'8 e'16 e' e'8 | e'16 e' e'8 a'8 b'8 | c#''8 a'8 b'8 g#'8 | a'4 r4 |",
        },
        fm2: { instrument: 'slap-bass', notes: 'a,8 e, a, e, | a,8 e, a, e, | a,8 e, a, e, | e,8 b,, e, b,, | a,8 e, a, e, | a,8 e, a, e, | e,8 e, e, e, | a,4 r4 |' },
        fm3: { instrument: 'fm-strings', volume: 0.5, notes: "a2 | a2 | a2 | e2 | a2 | a2 | e2 | a2 |" },
        psgNoise: { notes: Array.from({ length: 8 }, () => '@kick x8 @hat x @snare x @hat x |').join(' ') },
    },
};
