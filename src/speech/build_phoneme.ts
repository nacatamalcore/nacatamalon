import { PHONEMES } from './phonemes';
import type { TPhoneme } from './phonemes';
import type { TVoiceSegment, TVoiceTarget } from './voice';

const WIDTHS: readonly [number, number, number] = [60, 90, 150];
const BURST = 0.012;
const PUFF = 0.04;

/**
 * Where the mouth is for a phoneme, silent: the loudness is set by whoever builds the sound.
 *
 * @internal
 */
export const mouthOf = (phoneme: TPhoneme, formants: readonly [number, number, number] = phoneme.formants): TVoiceTarget => {
    const widths = phoneme.widths ?? WIDTHS;
    return {
        f1: formants[0], f2: formants[1], f3: formants[2], b1: widths[0], b2: widths[1], b3: widths[2],
        voice: 0, aspiration: 0, noise: 0,
        noiseAt: phoneme.noise?.at ?? 3000, noiseWidth: phoneme.noise?.width ?? 2000,
        nasal: phoneme.kind === 'nasal' ? 1 : 0,
    };
};

/**
 * What comes after a phoneme, which a stop's puff of air and an h take their mouth from.
 *
 * @internal
 */
export type TNextSound = { formants: readonly [number, number, number]; vowel: boolean } | undefined;

/**
 * The stretches of sound one phoneme is made of, `length` seconds in all (a stop's burst and puff on
 * top). A vowel is one stretch, gliding if it is a diphthong; a stop is the mouth shut, a burst as it
 * opens and, unvoiced before a vowel, a puff of air; a trill is the tongue hitting three times.
 *
 * @internal
 */
export const buildPhoneme = (name: string, length: number, next: TNextSound, afterS = false): TVoiceSegment[] => {
    const phoneme = PHONEMES[name]!;
    const mouth = mouthOf(phoneme);
    const noise = phoneme.noise?.level ?? 0;
    switch (phoneme.kind) {
        case 'vowel':
        case 'diphthong':
            return [{ length, from: { ...mouth, voice: 1 }, to: phoneme.to ? { ...mouthOf(phoneme, phoneme.to), voice: 1 } : undefined }];
        case 'glide':
            return [{ length, from: { ...mouth, voice: 0.8 } }];
        case 'nasal':
            return [{ length, from: { ...mouth, voice: 0.7 } }];
        case 'fricative':
            return [{ length, from: { ...mouth, voice: phoneme.voiced ? 0.55 : 0, noise } }];
        case 'aspirate':
            return [{ length, from: { ...mouthOf(phoneme, next?.formants ?? phoneme.formants), aspiration: 1 } }];
        case 'tap':
            return [{ length, from: { ...mouth, voice: 0.3 } }];
        case 'trill': {
            const beat = length / 6;
            return Array.from({ length: 6 }, (_, i) => ({ length: beat, from: { ...mouth, voice: i % 2 === 0 ? 0.25 : 0.7 } }));
        }
        case 'plosive': {
            const shut: TVoiceSegment = { length: Math.max(0.01, length - BURST), from: { ...mouth, voice: phoneme.voiced ? 0.12 : 0 } };
            const open: TVoiceSegment = { length: BURST, from: { ...mouth, noise, voice: phoneme.voiced ? 0.4 : 0 }, quick: true };
            if (phoneme.voiced || afterS || !next?.vowel) return [shut, open];
            const puff: TVoiceSegment = { length: PUFF, from: { ...mouthOf(phoneme, next.formants), aspiration: 0.8 } };
            return [shut, open, puff];
        }
        case 'affricate':
            return [
                { length: length * 0.4, from: { ...mouth, voice: phoneme.voiced ? 0.12 : 0 } },
                { length: length * 0.6, from: { ...mouth, noise, voice: phoneme.voiced ? 0.5 : 0 }, quick: true },
            ];
    }
};

/**
 * What a phoneme looks like to the one before it.
 *
 * @internal
 */
export const nextSoundOf = (name: string | undefined): TNextSound => {
    const phoneme = name ? PHONEMES[name] : undefined;
    if (!phoneme) return undefined;
    return { formants: phoneme.formants, vowel: phoneme.kind === 'vowel' || phoneme.kind === 'diphthong' || phoneme.kind === 'glide' };
};

/**
 * Silence for `length` seconds, the mouth left where it was.
 *
 * @internal
 */
export const pauseSegment = (length: number, mouth: TVoiceTarget): TVoiceSegment => ({ length, from: { ...mouth, voice: 0, aspiration: 0, noise: 0 } });
