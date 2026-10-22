import type { TSongDoc } from '../../types/t_song';

/**
 * Bach, the Prelude in C from the Well-Tempered Clavier (1722): one broken chord a bar, calm and turning, for a menu or a library, on the SNES.
 */
export const song: TSongDoc = {
    format: 1,
    chip: 'snes',
    tempo: 70,
    meter: [4, 4],
    echo: {
        delay: 0.16,
        feedback: 0.3,
        volume: 0.25,
    },
    voices: {
        s1: {
            instrument: 'piano',
            notes: "c16 e g c' e' g c' e' c e g c' e' g c' e' | c16 d a d' f' a d' f' c d a d' f' a d' f' | b,16 d g d' f' g d' f' b, d g d' f' g d' f' | c16 e g c' e' g c' e' c e g c' e' g c' e' | c16 e a e' a' a e' a' c e a e' a' a e' a' | c16 d f# a d' f# a d' c d f# a d' f# a d' | b,16 d g d' g' g d' g' b, d g d' g' g d' g' | b,16 c e g c' e g c' b, c e g c' e g c' |",
        },
    },
};
