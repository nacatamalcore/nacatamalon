import type { TSongDoc } from '../../types/t_song';

/**
 * Bizet, the Toreador song from Carmen (1875), the refrain: a swagger, on the Genesis.
 */
export const song: TSongDoc = {
    format: 1,
    chip: 'genesis',
    tempo: 108,
    meter: [4, 4],
    voices: {
        fm1: {
            instrument: 'fm-brass',
            notes: "c'4. d'8 c'4 a4 | a4 g8 a bb4 a4 | g4. bb8 a4 f4 | g2 c2 |\n" +
                "c'4. d'8 c'4 a4 | a4 g8 a bb4 a4 | g4 a8 bb a4 g4 | f2 r2 |",
        },
        fm2: { instrument: 'fm-strings', volume: 0.5, notes: 'a1 | a1 | bb1 | bb1 | a1 | d1 | bb1 | a1 |' },
        fm3: {
            instrument: 'fm-bass',
            notes: 'f,4 c, f, c, | f,4 c, f, c, | c,4 g,, c, g,, | c,4 g,, c, e, |\n' +
                'f,4 c, f, c, | bb,,4 f, bb,, f, | c,4 g,, c, g,, | f,4 c, f,2 |',
        },
        psgNoise: { notes: Array.from({ length: 8 }, () => '@kick x4 @snare x @kick x @snare x |').join(' ') },
    },
};
