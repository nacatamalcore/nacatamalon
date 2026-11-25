import { englishToPhonemes } from './languages/english';
import { spanishToPhonemes } from './languages/spanish';
import type { TSpeechLanguage } from './types/t_speech';

const READERS: Readonly<Partial<Record<TSpeechLanguage, (text: string) => string>>> = {
    en: englishToPhonemes,
    es: spanishToPhonemes,
};

/**
 * Text as the phonemes the voice will say for it, by the rules of its language: what to look at
 * when a word comes out wrong, and what to copy, fix and pass as `phonemes` instead. Phonemes do
 * not say where words begin nor which ones ask or stand out, so a text passed that way loses a little
 * of how `renderSpeech` says it. Pass its `language` too.
 *
 * @param text - Words, with their punctuation.
 * @param language - Default `'en'`.
 * @returns The phonemes, separated by spaces, a vowel's stress as a digit after it.
 *
 * @example
 * ```ts
 * import { textToPhonemes } from 'nacatamalon/speech';
 *
 * textToPhonemes('Hello, player!'); // 'HH AH0 L OW1 , P L EY1 ER0 !'
 * textToPhonemes('¿Qué hora es?', 'es'); // 'K E1 O1 DX A0 E1 S ?'
 * ```
 *
 * @category Speech
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const textToPhonemes = (text: string, language: TSpeechLanguage = 'en'): string => {
    const read = READERS[language];
    if (!read) throw new Error(`[NacatamalOn] textToPhonemes: there are no rules to read "${language}". Write it as phonemes.`);
    return read(text);
};
