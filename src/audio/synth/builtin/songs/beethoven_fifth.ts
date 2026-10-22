import type { TSongDoc } from '../../types/t_song';

/**
 * Beethoven, the opening of the Fifth Symphony (1808): fate knocking, then the storm, on the Genesis.
 * The notes are from a piano reduction in the public domain.
 */
export const song: TSongDoc = {
    format: 1,
    chip: 'genesis',
    tempo: 216,
    meter: [2, 4],
    voices: {
        fm1: {
            instrument: 'fm-brass',
            notes: 'r8 g g g | eb2~ | eb2 | r8 f f f | d2~ | d2~ | d2 |\n' +
                "r8 g g g | r8 ab ab ab | r8 eb' eb' eb' | c'2~ | c'4 r4 | r8 ab ab ab | r8 f' f' f' | d'2~ |\n" +
                "d'8 g' g' f' | eb'2 | d'8 g' g' f' | eb'2 | d'8 g' g' f' | eb'4 r4 | c'4 r4 | g'2~ | g'2 |",
        },
        fm2: {
            instrument: 'fm-strings',
            volume: 0.7,
            notes: 'r8 g, g, g, | eb,2~ | eb,2 | r8 f, f, f, | d,2~ | d,2~ | d,2 |\n' +
                'r2 | r2 | g2~ | g2~ | g8 g g g | r2 | g2~ | g2~ |\n' +
                'g2 | g2 | g2 | g2 | b8 b b b | g4 r4 | f#4 r4 | b2~ | b2 |',
        },
        fm3: {
            instrument: 'fm-bass',
            notes: 'r8 g,, g,, g,, | eb,,2~ | eb,,2 | r8 f,, f,, f,, | d,,2~ | d,,2~ | d,,2 |\n' +
                'r2 | c,2~ | c,2~ | c,2~ | c,4 r4 | b,,2~ | b,,2~ | b,,2~ |\n' +
                'b,,2 | c,2 | b,,2 | c,2 | g,,8 g,, g,, g,, | c,4 r4 | ab,,4 r4 | g,,2~ | g,,2 |',
        },
        fm4: {
            instrument: 'fm-strings',
            volume: 0.6,
            notes: 'r2 | r2 | r2 | r2 | r2 | r2 | r2 |\n' +
                'r2 | eb,2~ | eb,2~ | eb,2~ | eb,4 r4 | d,2~ | d,2~ | d,2~ |\n' +
                'd,2 | eb8 eb eb f | g2~ | g8 eb eb f | d4 d4 | eb4 r4 | c4 r4 | d2~ | d2 |',
        },
    },
};
