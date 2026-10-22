import type { TSongDoc } from '../../types/t_song';

/**
 * Beethoven, Für Elise (1810): its opening, on the SNES, a piano in a room. The bar before the loop leads back into the tune.
 */
export const song: TSongDoc = {
    format: 1,
    chip: 'snes',
    tempo: 160,
    meter: [3, 8],
    loop: { bar: 2 },
    echo: { delay: 0.12, feedback: 0.3, volume: 0.25 },
    voices: {
        s1: {
            instrument: 'piano',
            notes: "r8 r8 e'16 d#' | e'16 d#' e' b d' c' | a8 r16 c e a | b8 r16 e g# b | c'8 r16 e e' d#' |\n" +
                "e'16 d#' e' b d' c' | a8 r16 c e a | b8 r16 e c' b | a8 r8 e'16 d#' |",
        },
        s2: {
            instrument: 'piano',
            volume: 0.7,
            notes: 'r4. | r4. | a,,16 e, a, r16 r8 | e,,16 e, g#, r16 r8 | a,,16 e, a, r16 r8 |\n' +
                'r4. | a,,16 e, a, r16 r8 | e,,16 e, g#, r16 r8 | a,,16 e, a, r16 r8 |',
        },
    },
};
