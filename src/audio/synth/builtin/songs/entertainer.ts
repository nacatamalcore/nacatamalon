import type { TSongDoc } from '../../types/t_song';

/**
 * Joplin, The Entertainer (1902): a rag, for a shop or a lobby, on the SNES.
 */
export const song: TSongDoc = {
    format: 1,
    chip: 'snes',
    tempo: 80,
    meter: [2, 4],
    loop: { bar: 2 },
    voices: {
        s1: {
            instrument: 'piano',
            notes: "r4 r8 d'16 d#' | e'16 c''8 e'16 c''8 e'16 c''~ | c''4. c''16 d'' | d#''16 e'' c'' d'' e''8 b'16 d'' | c''4. d'16 d#' |",
        },
        s2: { instrument: 'piano', volume: 0.6, notes: "r2 | c8 e g e | c8 e g e | g,8 f b f | c8 e g r8 |" },
        s3: { instrument: 'synth-bass', notes: 'r2 | c,4 g,, | c,4 c, | g,,4 g,, | c,4 r4 |' },
    },
};
