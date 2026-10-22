import type { TSongDoc } from '../../types/t_song';

/**
 * Petzold, the Minuet in G (once said to be Bach's): a dance for a palace or a menu, on the NES.
 */
export const song: TSongDoc = {
    format: 1,
    tempo: 132,
    meter: [3, 4],
    voices: {
        pulse1: { instrument: 'soft', notes: "d'4 g8 a b c' | d'4 g g | e'4 c'8 d' e' f#' | g'4 g g | c'4 d'8 c' b a | b4 c'8 b a g | f#4 g8 a b g | a2. |" },
        pulse2: { volume: 0.5, duty: 0.25, notes: "b2. | b2. | c'2. | b2. | a2. | g2. | d2. | f#2. |" },
        triangle: { notes: 'g,2. | b,2. | c2. | b,2. | a,2. | g,2. | d2 d,4 | d,2. |' },
        noise: { notes: 'x4 r r | x4 r r | x4 r r | x4 r r | x4 r r | x4 r r | x4 r r | x4 x8 x x4 |', volume: 0.5 },
    },
};
