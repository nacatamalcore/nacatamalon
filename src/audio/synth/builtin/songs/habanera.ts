import type { TSongDoc } from '../../types/t_song';

/**
 * Bizet, the Habanera from Carmen (1875): a slow, sultry tune sliding down over a bass that never
 * stops, on the SNES.
 */
export const song: TSongDoc = {
    format: 1,
    chip: 'snes',
    tempo: 72,
    meter: [2, 4],
    loop: { bar: 5 },
    voices: {
        s1: {
            instrument: 'strings',
            notes: "r2 | r2 | r2 | r2 |\n" +
                "r4 d'8 c#' | c'8 c'16 c' b8 bb | a8 a16 a g#8 g | f32 g f16 e f g8 f | e4 d'8 c#' |\n" +
                "c'8 c'16 c' b8 bb | a8 a16 a g#8 g | f32 g f16 e f g8 f | e8 f d4 |",
        },
        s2: { instrument: 'synth-bass', notes: Array.from({ length: 13 }, () => 'd,,8 r16 a,,16 f,8 a,, |').join(' ') },
        s3: { instrument: 'drum-clap', volume: 0.35, notes: Array.from({ length: 13 }, () => "c'8. c'16 c'8 c' |").join(' ') },
    },
};
