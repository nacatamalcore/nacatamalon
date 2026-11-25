import { englishAccent, englishPuff, englishVowel, readEnglish, sayEnglish } from './english_speech';
import { isRunTogether, readSpanish, saySpanish, spanishAccent, spanishPuff, spanishShape, spanishVowel } from './spanish_speech';
import type { TNextSound } from '../build_phoneme';
import type { TPhonemeToken } from '../parse_phonemes';
import type { TPhoneme } from '../phonemes';
import type { TSpeechLanguage } from '../types/t_speech';
import type { TAccentShape } from './melody';
import type { TSaidSound, TSaidToken } from './said';

/**
 * How a language is said.
 *
 * @internal
 */
export type TLanguageSpeech = {
    /** A text as what is said. */
    read: (text: string) => TSaidToken[];
    /** Phonemes as what is said. */
    say: (written: readonly TPhonemeToken[]) => TSaidToken[];
    /** How many times as long a vowel is, the sound after it `after`. */
    vowel: (tokens: readonly TSaidToken[], i: number, after: string | undefined) => number;
    /** A sound where its neighbour takes it. */
    shape: (name: string, phoneme: TPhoneme, next: TNextSound) => TPhoneme;
    /** The air after an unvoiced stop. */
    puff: (sound: TSaidSound) => { length: number; level: number };
    accent: TAccentShape;
};

const stressOf = (token: TSaidToken): number => ('stress' in token ? token.stress : 0);

/**
 * How each language the voice knows is said. `'none'` is said as it is written.
 *
 * @internal
 */
export const SPEECHES: Readonly<Record<Exclude<TSpeechLanguage, 'none'>, TLanguageSpeech>> = {
    en: {
        read: readEnglish,
        say: sayEnglish,
        vowel: (tokens, i, after) => englishVowel(stressOf(tokens[i]!), after),
        shape: (_name, phoneme) => phoneme,
        puff: (sound) => englishPuff(sound.air === true),
        accent: englishAccent,
    },
    es: {
        read: readSpanish,
        say: saySpanish,
        vowel: (tokens, i) => spanishVowel(stressOf(tokens[i]!)) * (isRunTogether(tokens, i) ? 0.55 : 1),
        shape: spanishShape,
        puff: (sound) => spanishPuff(sound.name),
        accent: spanishAccent,
    },
};
