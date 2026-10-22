import type { TSongDoc } from '../../types/t_song';

/**
 * Wagner, Ride of the Valkyries (1856), the call: a charge on horseback through the sky, on the
 * Genesis.
 */
export const song: TSongDoc = {
    format: 1,
    chip: 'genesis',
    tempo: 300,
    meter: [9, 8],
    loop: { bar: 2 },
    voices: {
        fm1: {
            instrument: 'fm-brass',
            notes: "r4. r4. r4 r16 f#16 |\n" +
                "b8. f#16 b8 d'4. b4. | d'8. b16 d'8 f#'4. d'4. | b8. f#16 b8 d'4. b4. | d'8. b16 d'8 f#'4. d'4 r16 f#16 |",
        },
        fm2: {
            instrument: 'fm-strings',
            volume: 0.45,
            notes: "r4. r4. r4. |\n" +
                "b16 c#' b c#' b c#' b c#' b c#' b c#' b c#' b c#' b c#' | a16 b a b a b a b a b a b a b a b a b |\n" +
                "b16 c#' b c#' b c#' b c#' b c#' b c#' b c#' b c#' b c#' | a16 b a b a b a b a b a b a b a b a b |",
        },
        fm3: { instrument: 'fm-bass', notes: 'r4. r4. r4. | b,,4. b,,4. b,,4. | d,4. d,4. d,4. | b,,4. b,,4. b,,4. | d,4. d,4. d,4. |' },
        psgNoise: { volume: 0.6, notes: 'r4. r4. r4. |' + Array.from({ length: 4 }, () => ' @kick x8 @hat x x @snare x @hat x x @snare x @hat x x |').join('') },
    },
};
