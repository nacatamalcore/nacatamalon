import type { TSongDoc } from '../../types/t_song';

/**
 * Saint-Saëns, Danse macabre (1874), the opening: midnight strikes twelve, and Death tunes his
 * fiddle to A and E flat, on the Genesis.
 */
export const song: TSongDoc = {
    format: 1,
    chip: 'genesis',
    tempo: 160,
    meter: [3, 4],
    loop: { bar: 5 },
    voices: {
        fm1: { instrument: 'fm-bell', notes: "d'4 d' d' | d'4 d' d' | d'4 d' d' | d'4 d' d' | r2. | r2. | r2. | r2. |" },
        fm2: { instrument: 'fm-strings', notes: "r2. | r2. | r2. | r2. | a'2 r4 | a'2 r4 | a'4 a' r4 | a'2 r4 |" },
        fm3: { instrument: 'fm-strings', notes: "r2. | r2. | r2. | r2. | eb''2 r4 | eb''2 r4 | eb''4 eb'' r4 | eb''2 r4 |" },
        fm4: { instrument: 'fm-bass', volume: 0.7, notes: 'd,2. | d,2. | d,2. | d,2. | g,,4 d, r4 | g,,4 d, r4 | g,,4 d, r4 | d,4 a,, r4 |' },
    },
};
