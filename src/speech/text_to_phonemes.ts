import { spanishToPhonemes } from './languages/spanish';
import type { TSpeechLanguage } from './types/t_speech';

const READERS: Readonly<Record<TSpeechLanguage, (text: string) => string>> = {
    es: spanishToPhonemes,
};

/**
 * Text as the phonemes the voice will say for it, by the rules of its language: what to look at
 * when a word comes out wrong, and what to copy, fix and pass as `phonemes` instead.
 *
 * @param text - Words, with their punctuation.
 * @param language - Default `'es'`.
 * @returns The phonemes, separated by spaces, a vowel's stress as a digit after it.
 *
 * @example
 * ```ts
 * import { textToPhonemes } from 'nacatamalon/speech';
 *
 * textToPhonemes('¿Qué hora es?'); // 'K E1 O1 DX A0 E1 S ?'
 * ```
 *
 * @category Speech
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const textToPhonemes = (text: string, language: TSpeechLanguage = 'es'): string => {
    const read = READERS[language];
    if (!read) throw new Error(`[NacatamalOn] textToPhonemes: there are no rules to read "${language}". Write it as phonemes.`);
    return read(text);
};
