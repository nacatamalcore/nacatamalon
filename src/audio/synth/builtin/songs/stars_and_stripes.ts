import type { TSongDoc } from '../../types/t_song';

/**
 * Sousa, The Stars and Stripes Forever (1896), the trio: a brass band march, on the NES. The tune is
 * from a piano score in the public domain.
 */
export const song: TSongDoc = {
    format: 1,
    tempo: 220,
    meter: [4, 4],
    voices: {
        pulse1: {
            instrument: 'lead',
            notes: "eb'2 db'4 c'4 | c'2 b4 c'4 | c'1~ | c'2 b4 c'4 | c'2 b4 c'4 | eb'2 c'4. eb'8 | db'1 | bb2 bb2 |\n" +
                "bb2 a4 bb4 | bb2 a4 bb4 | db'1~ | db'2 c'4 bb4 | c'4 eb'2. | f'2. f'4 | bb1~ | bb2 eb'2 |\n" +
                "eb'2 db'4 c'4 | c'2 b4 c'4 | c'1~ | c'2 b4 c'4 | c'2 b4 c'4 | db'4 c'4 bb4. g'8 | bb1 | ab2 ab2 |\n" +
                "ab2 g4 ab4 | cb'2 bb4 ab4 | ab'1~ | ab'4 ab4 bb4 c'4 | eb'8 r8 ab4 bb4 c'4 | eb'8 r8 eb4 f4 c'4 | bb1 | ab4 r4 r2 |",
        },
        pulse2: {
            instrument: 'major',
            volume: 0.45,
            notes: 'r4 ab ab r | r4 ab ab r | r4 ab ab r | r4 ab ab r | r4 ab ab r | r4 ab ab r | r4 eb eb r | r4 eb eb r |\n' +
                'r4 eb eb r | r4 eb eb r | r4 eb eb r | r4 eb eb r | r4 ab ab r | r4 db db r | r4 eb eb r | r4 eb eb r |\n' +
                'r4 ab ab r | r4 ab ab r | r4 ab ab r | r4 ab ab r | r4 c c r | r4 c c r | @minor r4 f f r | r4 f f r |\n' +
                'r4 db db r | @major r4 fb fb r | r4 ab ab r | r4 ab ab r | r4 ab ab r | r4 ab ab r | r4 eb eb r | r4 ab r2 |',
        },
        triangle: {
            instrument: 'bass',
            notes: 'ab,,4 r2 eb,4 | ab,,4 r2 eb,4 | ab,,4 r2 eb,4 | ab,,4 r2 eb,4 | ab,,4 r2 eb,4 | ab,,4 r2 eb,4 | bb,,4 r2 eb,4 | bb,,4 r2 eb,4 |\n' +
                'bb,,4 r2 eb,4 | bb,,4 r2 eb,4 | bb,,4 r2 eb,4 | bb,,4 r2 eb,4 | ab,,4 r2 eb,4 | db,4 r2 ab,,4 | eb,4 r4 bb,,4 r4 | g,,4 r4 eb,4 r4 |\n' +
                'ab,,4 r2 eb,4 | ab,,4 r2 eb,4 | ab,,4 r2 eb,4 | ab,,4 r2 eb,4 | g,,4 r2 c,4 | g,,4 r2 c,4 | f,,4 r2 c,4 | f,,4 r2 c,4 |\n' +
                'fb,,4 r2. | fb,,4 r2. | eb,4 r4 ab,,4 r4 | c,4 r4 eb,4 r4 | c,4 r4 eb,4 r4 | ab,,4 r4 c,4 r4 | g,,4 r4 eb,4 r4 | ab,,4 r4 ab,,4 r4 |',
        },
        noise: { notes: Array.from({ length: 32 }, () => '@kick x4 @hat x @snare x @hat x |').join(' '), volume: 0.5 },
    },
};
