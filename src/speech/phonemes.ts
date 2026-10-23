/**
 * The sounds the voice makes, by the names of the American English phoneme set (the one the free
 * pronouncing dictionaries are written in), with five more for Spanish: its five pure vowels
 * `A E I O U`, the tap `DX` of "pero", the trill `RR` of "perro", `NY` and the jota `X`.
 *
 * Each says where the mouth is, as its three formants in Hz for a man's throat, and how the sound is
 * made: the voice, noise at a place, a stop, the nose.
 */

/**
 * How a phoneme is made, which is what decides how it is built out of the voice's pieces.
 *
 * @internal
 */
export type TPhonemeKind = 'vowel' | 'diphthong' | 'glide' | 'nasal' | 'fricative' | 'plosive' | 'affricate' | 'aspirate' | 'tap' | 'trill';

/**
 * Noise shaped by the mouth: the band it rings in, and how loud it is beside the voice.
 *
 * @internal
 */
export type TPhonemeNoise = { at: number; width: number; level: number };

/**
 * One phoneme.
 *
 * @internal
 */
export type TPhoneme = {
    kind: TPhonemeKind;
    /** The three formants, in Hz. */
    formants: readonly [number, number, number];
    /** Their bandwidths, in Hz. */
    widths?: readonly [number, number, number];
    /** Where a diphthong ends. */
    to?: readonly [number, number, number];
    /** How long it lasts on its own, in seconds. */
    length: number;
    voiced: boolean;
    /** The hiss of a fricative, or the burst of a stop as it opens. */
    noise?: TPhonemeNoise;
};

const S_NOISE: TPhonemeNoise = { at: 6000, width: 2200, level: 0.9 };
const SH_NOISE: TPhonemeNoise = { at: 2900, width: 1800, level: 0.9 };
const F_NOISE: TPhonemeNoise = { at: 6500, width: 6000, level: 0.35 };
const TH_NOISE: TPhonemeNoise = { at: 5500, width: 5000, level: 0.3 };
const X_NOISE: TPhonemeNoise = { at: 1700, width: 1600, level: 0.6 };
const P_BURST: TPhonemeNoise = { at: 1200, width: 2500, level: 0.6 };
const T_BURST: TPhonemeNoise = { at: 4500, width: 3500, level: 0.8 };
const K_BURST: TPhonemeNoise = { at: 2300, width: 1200, level: 0.8 };

const vowel = (formants: TPhoneme['formants'], widths: TPhoneme['widths'], length: number): TPhoneme => ({ kind: 'vowel', formants, widths, length, voiced: true });
const diphthong = (formants: TPhoneme['formants'], to: TPhoneme['formants'], length: number): TPhoneme => ({ kind: 'diphthong', formants, to, length, voiced: true });

/**
 * Every phoneme the voice knows, by name.
 *
 * @internal
 */
export const PHONEMES: Readonly<Record<string, TPhoneme>> = {
    AA: vowel([700, 1220, 2600], [130, 70, 160], 0.16),
    AE: vowel([620, 1660, 2430], [70, 150, 320], 0.17),
    AH: vowel([620, 1220, 2550], [80, 50, 140], 0.11),
    AO: vowel([600, 990, 2570], [90, 100, 80], 0.16),
    EH: vowel([530, 1680, 2500], [60, 90, 200], 0.13),
    ER: vowel([470, 1270, 1540], [100, 60, 110], 0.16),
    IH: vowel([400, 1800, 2570], [50, 100, 140], 0.1),
    IY: vowel([310, 2020, 2960], [45, 200, 400], 0.14),
    UH: vowel([450, 1100, 2350], [80, 100, 80], 0.11),
    UW: { kind: 'vowel', formants: [350, 1250, 2200], to: [320, 900, 2200], widths: [65, 110, 140], length: 0.15, voiced: true },
    // The neutral vowel an unstressed AH becomes: "a" in "about".
    AX: vowel([500, 1400, 2300], [80, 80, 140], 0.07),
    AW: diphthong([640, 1230, 2550], [420, 940, 2350], 0.22),
    AY: diphthong([660, 1200, 2550], [400, 1880, 2500], 0.22),
    EY: diphthong([480, 1720, 2520], [330, 2200, 2600], 0.19),
    OW: diphthong([540, 1100, 2300], [450, 900, 2300], 0.19),
    OY: diphthong([550, 960, 2400], [360, 1820, 2450], 0.23),

    A: vowel([700, 1300, 2500], [90, 90, 160], 0.11),
    E: vowel([450, 1900, 2550], [60, 100, 200], 0.1),
    I: vowel([290, 2250, 2950], [45, 200, 350], 0.09),
    O: vowel([480, 920, 2450], [70, 90, 120], 0.1),
    U: vowel([320, 800, 2350], [60, 90, 120], 0.09),

    W: { kind: 'glide', formants: [290, 610, 2150], widths: [50, 80, 60], length: 0.07, voiced: true },
    Y: { kind: 'glide', formants: [260, 2070, 3020], widths: [40, 250, 500], length: 0.07, voiced: true },
    R: { kind: 'glide', formants: [310, 1060, 1380], widths: [70, 100, 120], length: 0.08, voiced: true },
    L: { kind: 'glide', formants: [310, 1050, 2880], widths: [50, 100, 280], length: 0.07, voiced: true },

    M: { kind: 'nasal', formants: [480, 1270, 2130], widths: [40, 200, 200], length: 0.07, voiced: true },
    N: { kind: 'nasal', formants: [480, 1340, 2470], widths: [40, 300, 300], length: 0.07, voiced: true },
    NG: { kind: 'nasal', formants: [480, 2000, 2800], widths: [40, 300, 300], length: 0.08, voiced: true },
    NY: { kind: 'nasal', formants: [480, 2100, 2900], widths: [40, 300, 300], length: 0.08, voiced: true },

    F: { kind: 'fricative', formants: [340, 1100, 2080], length: 0.1, voiced: false, noise: F_NOISE },
    V: { kind: 'fricative', formants: [220, 1100, 2080], length: 0.07, voiced: true, noise: { ...F_NOISE, level: 0.2 } },
    TH: { kind: 'fricative', formants: [320, 1290, 2540], length: 0.1, voiced: false, noise: TH_NOISE },
    DH: { kind: 'fricative', formants: [270, 1290, 2540], length: 0.05, voiced: true, noise: { ...TH_NOISE, level: 0.15 } },
    S: { kind: 'fricative', formants: [320, 1390, 2530], length: 0.11, voiced: false, noise: S_NOISE },
    Z: { kind: 'fricative', formants: [240, 1390, 2530], length: 0.08, voiced: true, noise: { ...S_NOISE, level: 0.5 } },
    SH: { kind: 'fricative', formants: [300, 1840, 2750], length: 0.11, voiced: false, noise: SH_NOISE },
    ZH: { kind: 'fricative', formants: [300, 1840, 2750], length: 0.08, voiced: true, noise: { ...SH_NOISE, level: 0.5 } },
    X: { kind: 'fricative', formants: [400, 1600, 2500], length: 0.09, voiced: false, noise: X_NOISE },
    HH: { kind: 'aspirate', formants: [500, 1500, 2500], length: 0.07, voiced: false },

    P: { kind: 'plosive', formants: [400, 1100, 2150], length: 0.07, voiced: false, noise: P_BURST },
    B: { kind: 'plosive', formants: [400, 1100, 2150], length: 0.06, voiced: true, noise: { ...P_BURST, level: 0.35 } },
    T: { kind: 'plosive', formants: [400, 1600, 2600], length: 0.07, voiced: false, noise: T_BURST },
    D: { kind: 'plosive', formants: [400, 1600, 2600], length: 0.06, voiced: true, noise: { ...T_BURST, level: 0.45 } },
    K: { kind: 'plosive', formants: [300, 1990, 2850], length: 0.07, voiced: false, noise: K_BURST },
    G: { kind: 'plosive', formants: [300, 1990, 2850], length: 0.06, voiced: true, noise: { ...K_BURST, level: 0.45 } },
    CH: { kind: 'affricate', formants: [350, 1800, 2820], length: 0.12, voiced: false, noise: SH_NOISE },
    JH: { kind: 'affricate', formants: [260, 1800, 2820], length: 0.1, voiced: true, noise: { ...SH_NOISE, level: 0.5 } },

    DX: { kind: 'tap', formants: [400, 1600, 2600], length: 0.025, voiced: true },
    RR: { kind: 'trill', formants: [400, 1500, 2500], length: 0.09, voiced: true },
};

/**
 * Whether a phoneme is the heart of a syllable, which is what a sung note holds.
 *
 * @internal
 */
export const isVowel = (name: string): boolean => {
    const kind = PHONEMES[name]?.kind;
    return kind === 'vowel' || kind === 'diphthong';
};
