import type { TSongDoc } from '../../types/t_song';

/**
 * Beethoven, the Moonlight Sonata's first movement (1801): its rippling chords, slow and dark, for a haunted place or a sad night, on the SNES.
 */
export const song: TSongDoc = {
    format: 1,
    chip: 'snes',
    tempo: 150,
    meter: [12, 8],
    echo: {
        delay: 0.24,
        feedback: 0.4,
        volume: 0.3,
    },
    voices: {
        s1: {
            instrument: 'piano',
            notes: 'g#,8 c# e g#,8 c# e g#,8 c# e g#,8 c# e | g#,8 c# e g#,8 c# e g#,8 c# e g#,8 c# e | a,8 c# e a, c# e a, d f# a, d f# | g#,8 c d# g#, c d# g#, c d# g#, c d# |',
        },
        s2: {
            instrument: 'piano',
            volume: 0.8,
            notes: 'c#,1. | b,,1. | a,,2. f#,,2. | g#,,1. |',
        },
    },
};
