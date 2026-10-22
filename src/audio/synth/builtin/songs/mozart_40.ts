import type { TSongDoc } from '../../types/t_song';

/**
 * Mozart, the opening of the Symphony No. 40 in G minor (1788): restless, urgent strings, on the SNES.
 */
export const song: TSongDoc = {
    format: 1,
    chip: 'snes',
    tempo: 210,
    meter: [4, 4],
    loop: { bar: 2 },
    voices: {
        s1: {
            instrument: 'strings',
            notes: "r2. eb'8 d' | d'4 eb'8 d' d'4 eb'8 d' | d'4 bb'4 r4 bb'8 a' | g'4 g'8 f' eb'4 eb'8 d' | c'4 c'4 r4 d'8 c' |\n" +
                "c'4 d'8 c' c'4 d'8 c' | c'4 a'4 r4 a'8 g' | f#'4 f#'8 eb' d'4 d'8 c' | bb4 bb4 r4 eb'8 d' |",
        },
        s2: {
            instrument: 'strings',
            volume: 0.35,
            notes: 'r1 | bb8 bb bb bb bb bb bb bb | bb8 bb bb bb bb bb bb bb | bb8 bb bb bb bb bb bb bb | a8 a a a a a a a |\n' +
                'a8 a a a a a a a | a8 a a a a a a a | a8 a a a a a a a | bb8 bb bb bb bb bb bb bb |',
        },
        s3: {
            instrument: 'strings',
            volume: 0.35,
            notes: 'r1 | d8 d d d d d d d | d8 d d d d d d d | d8 d d d d d d d | f#8 f# f# f# f# f# f# f# |\n' +
                'f#8 f# f# f# f# f# f# f# | f#8 f# f# f# f# f# f# f# | f#8 f# f# f# f# f# f# f# | d8 d d d d d d d |',
        },
        s4: { instrument: 'strings', volume: 0.7, notes: 'r1 | g,2 g, | g,2 g, | g,2 g, | d,2 d, | d,2 d, | d,2 d, | d,2 d, | g,2 g, |' },
    },
};
