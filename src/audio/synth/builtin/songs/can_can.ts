import type { TSongDoc } from '../../types/t_song';

/**
 * Offenbach, Galop infernal, the can-can (1858): fast and silly, for a bonus or a race, on the NES.
 */
export const song: TSongDoc = {
    format: 1,
    tempo: 152,
    meter: [2, 4],
    voices: {
        pulse1: {
            instrument: 'lead',
            notes: "c'4 d'16 f' e' d' | g'8 g' g'16 a' e' f' | d'8 d' d'16 f' e' d' | c'16 c'' b' a' g' f' e' d' |\n" +
                "c'4 d'16 f' e' d' | g'8 g' g'16 a' e' f' | d'8 d' d'16 f' e' d' | c'16 g' d' e' c'4 |",
        },
        pulse2: { instrument: 'stab', volume: 0.5, notes: "c'8 r c' r | g8 r g r | g8 r g r | c'8 r c' r | c'8 r c' r | g8 r g r | g8 r g r | c'8 r c'4 |" },
        triangle: {
            instrument: 'bass',
            notes: 'c,8 g, c, g, | g,,8 d, g,, d, | g,,8 d, g,, d, | c,8 g, c, g, | c,8 g, c, g, | g,,8 d, g,, d, | g,,8 d, g,, d, | c,8 g, c,4 |',
        },
        noise: { notes: Array.from({ length: 8 }, () => '@kick x8 @hat x @snare x @hat x |').join(' '), volume: 0.5 },
    },
};
