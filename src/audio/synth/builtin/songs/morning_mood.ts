import type { TSongDoc } from '../../types/t_song';

/**
 * Grieg, Morning Mood from Peer Gynt (1875): a flute at sunrise, for the first village, on the SNES.
 */
export const song: TSongDoc = {
    format: 1,
    chip: 'snes',
    tempo: 150,
    meter: [6, 8],
    echo: { delay: 0.2, feedback: 0.35, volume: 0.3 },
    voices: {
        s1: { instrument: 'flute', notes: "g'8 e' d' c' d' e' | g'8 e' d' c' d'16 e' d' e' | g'8 e' g' a' e' a' | g'8 e' d' c'4. |" },
        s2: { instrument: 'strings', volume: 0.5, notes: 'c2. | c2. | f2. | c2. |' },
        s3: { instrument: 'synth-bass', volume: 0.8, notes: 'c,2. | c,2. | f,,2. | c,2. |' },
    },
};
