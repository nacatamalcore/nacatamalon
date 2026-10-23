import { PHONEMES } from './phonemes';

/**
 * One sound of an utterance, with its stress (`1` stressed, `2` a little, `0` not), or a pause.
 *
 * @internal
 */
export type TPhonemeToken = { name: string; stress: number } | { pause: number; mark: string };

/**
 * How long each mark stops the voice, in seconds.
 */
const PAUSES: Readonly<Record<string, number>> = { ',': 0.18, ';': 0.25, '.': 0.35, '!': 0.35, '?': 0.35 };

/**
 * Reads phonemes written as text: names separated by spaces, a vowel's stress as a digit after it,
 * and punctuation for pauses. Case does not matter.
 *
 * @internal
 */
export const parsePhonemes = (text: string): TPhonemeToken[] => {
    const tokens: TPhonemeToken[] = [];
    for (const word of text.replace(/([,;.!?])/g, ' $1 ').trim().split(/\s+/)) {
        if (!word) continue;
        if (PAUSES[word] !== undefined) {
            tokens.push({ pause: PAUSES[word]!, mark: word });
            continue;
        }
        const match = /^([a-z]+)([0-2]?)$/i.exec(word);
        const name = match?.[1]?.toUpperCase() ?? '';
        if (!PHONEMES[name]) throw new Error(`speech: "${word}" is not a phoneme the voice knows`);
        tokens.push({ name, stress: match?.[2] ? Number(match[2]) : 0 });
    }
    return tokens;
};
