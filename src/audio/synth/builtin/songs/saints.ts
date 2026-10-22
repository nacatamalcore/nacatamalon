import type { TSongDoc } from '../../types/t_song';

/**
 * When the Saints Go Marching In, a spiritual: a brass band strutting, for a parade or a celebration, on the NES.
 */
export const song: TSongDoc = {
    format: 1,
    tempo: 160,
    meter: [4, 4],
    voices: {
        pulse1: {
            instrument: 'lead',
            notes: "r4 c' e' f' | g'1 | r4 c' e' f' | g'1 | r4 c' e' f' | g'2 e'2 | c'2 e'2 | d'1 | r4 e' e' d' | c'2. c'4 | e'2 g'2 | g'4 f'2. | r4 e' f' g' | e'2 c'2 | d'2 c'2 | c'1 |",
        },
        pulse2: {
            instrument: 'pluck',
            volume: 0.5,
            notes: 'e8 g e g e g e g | e8 g e g e g e g | e8 g e g e g e g | e8 g e g e g e g | e8 g e g e g e g | e8 g e g e g e g | e8 g e g e g e g | d8 g d g d g d g | e8 g e g e g e g | e8 g e g e g e g | e8 g e g e g e g | f8 a f a f a f a | e8 g e g e g e g | e8 g e g e g e g | d8 g d g d g d g | e8 g e g e g e g |',
        },
        triangle: {
            instrument: 'bass',
            notes: 'c,4 e, g, e, | c,4 e, g, e, | c,4 e, g, e, | c,4 e, g, e, | c,4 e, g, e, | c,4 e, g, e, | c,4 e, g, e, | g,,4 b,, d, b,, | c,4 e, g, e, | c,4 e, g, e, | c,4 e, g, e, | f,4 a, c a, | c,4 e, g, e, | c,4 e, g, e, | g,,4 b,, d, b,, | c,4 e, g, e, |',
        },
        noise: {
            volume: 0.5,
            notes: '@kick x4 @snare x @kick x @snare x | @kick x4 @snare x @kick x @snare x | @kick x4 @snare x @kick x @snare x | @kick x4 @snare x @kick x @snare x | @kick x4 @snare x @kick x @snare x | @kick x4 @snare x @kick x @snare x | @kick x4 @snare x @kick x @snare x | @kick x4 @snare x @kick x @snare x | @kick x4 @snare x @kick x @snare x | @kick x4 @snare x @kick x @snare x | @kick x4 @snare x @kick x @snare x | @kick x4 @snare x @kick x @snare x | @kick x4 @snare x @kick x @snare x | @kick x4 @snare x @kick x @snare x | @kick x4 @snare x @kick x @snare x | @kick x4 @snare x @kick x @snare x |',
        },
    },
};
