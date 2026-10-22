import type { TSongDoc } from '../../types/t_song';

/**
 * Frère Jacques, a French round: four voices coming in one after another, two bars apart, going round for ever, for a village or a school, on the SNES.
 */
export const song: TSongDoc = {
    format: 1,
    chip: 'snes',
    tempo: 110,
    meter: [4, 4],
    echo: {
        delay: 0.12,
        feedback: 0.25,
        volume: 0.2,
    },
    voices: {
        s1: {
            instrument: 'flute',
            notes: "c'4 d' e' c' | c'4 d' e' c' | e'4 f' g'2 | e'4 f' g'2 | g'8 a' g' f' e'4 c' | g'8 a' g' f' e'4 c' | c'4 g c'2 | c'4 g c'2 |",
        },
        s2: {
            instrument: 'marimba',
            notes: "c'4 g c'2 | c'4 g c'2 | c'4 d' e' c' | c'4 d' e' c' | e'4 f' g'2 | e'4 f' g'2 | g'8 a' g' f' e'4 c' | g'8 a' g' f' e'4 c' |",
        },
        s3: {
            instrument: 'guitar',
            notes: 'g8 a g f e4 c | g8 a g f e4 c | c4 g, c2 | c4 g, c2 | c4 d e c | c4 d e c | e4 f g2 | e4 f g2 |',
        },
        s4: {
            instrument: 'strings',
            volume: 0.6,
            notes: 'e4 f g2 | e4 f g2 | g8 a g f e4 c | g8 a g f e4 c | c4 g, c2 | c4 g, c2 | c4 d e c | c4 d e c |',
        },
    },
};
