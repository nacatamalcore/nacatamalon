import { spanishPieces } from './spanish';
import { strongerOf } from './emphasis';
import { closes } from './said';
import type { TAccentShape } from './melody';
import type { TSaidToken } from './said';
import type { TPhonemeToken } from '../parse_phonemes';
import type { TNextSound } from '../build_phoneme';
import type { TPhoneme } from '../phonemes';

/**
 * How Spanish is said, beyond which sounds its letters are: what each sound becomes beside the ones
 * around it, how words run into each other, and how a phrase's pitch moves. Sounds
 * written as phonemes go through it too, but for what needs to know the words.
 */

const PAUSES: Readonly<Record<string, number>> = { ',': 0.2, ';': 0.32, '.': 0.4, '!': 0.4, '?': 0.4 };
const VOWELS: ReadonlySet<string> = new Set(['A', 'E', 'I', 'O', 'U']);
/** Two of these that meet across words are said once. */
const JOINED: ReadonlySet<string> = new Set([...VOWELS, 'S', 'L', 'N', 'RR']);
const LIPS: ReadonlySet<string> = new Set(['P', 'B', 'M']);
const BACK: ReadonlySet<string> = new Set(['K', 'G', 'X']);

/** "Nuestro" leans on the noun after it ("nuestro padre"), and is said whole after it ("padre nuestro"). */
const POSSESSIVE = /^(nuestr|vuestr)[oa]s?$/;
const INTERROGATIVE = /^(qué|quién|quiénes|cómo|dónde|cuándo|cuál|cuáles|cuánto|cuánta|cuántos|cuántas)$/;
/** What may come before the word that asks: "¿y de dónde…?". */
const BEFORE_IT: ReadonlySet<string> = new Set(['y', 'o', 'a', 'de', 'en', 'con', 'por', 'para', 'desde', 'hasta', 'sobre', 'pues', 'mas', 'pero']);

const isWord = (piece: string | undefined): boolean => piece !== undefined && /^[a-záéíóúüñ]/.test(piece);

const asksWhatFrom = (pieces: readonly { text: string }[], from: number): boolean => {
    let i = from;
    while (i < pieces.length && BEFORE_IT.has(pieces[i]!.text)) i += 1;
    return i < pieces.length && INTERROGATIVE.test(pieces[i]!.text);
};

/**
 * Spanish text as what is said: its sounds, each as it is beside its neighbours, and its pauses.
 *
 * @internal
 */
export const readSpanish = (text: string): TSaidToken[] => {
    const pieces = spanishPieces(text);
    const tokens: TSaidToken[] = [];
    let sentence = 0;
    let asks = false;
    let asksWhat = false;
    let begins = false;
    pieces.forEach((piece, i) => {
        if (piece.text === '¿') {
            asks = true;
            begins = true;
            asksWhat = asksWhatFrom(pieces, i + 1);
            return;
        }
        if (!piece.phonemes) {
            const mark = piece.text;
            if (mark === '?' && !asks) {
                asks = true;
                asksWhat = asksWhatFrom(pieces, sentence);
                begins = !pieces.slice(sentence, i).some((one) => !one.phonemes);
            }
            tokens.push({ pause: PAUSES[mark]!, mark, asks, asksWhat, begins });
            begins = false;
            if (closes(mark)) {
                asks = false;
                asksWhat = false;
                sentence = i + 1;
            }
            return;
        }
        const leans = (piece.emphasis === undefined || piece.emphasis === 'reduced') && POSSESSIVE.test(piece.text) && isWord(pieces[i + 1]?.text);
        piece.phonemes.forEach((phoneme, k) => {
            const name = phoneme.replace(/\d$/, '');
            const stress = leans || name === phoneme ? 0 : Number(phoneme.slice(-1));
            const before = tokens[tokens.length - 1];
            if (k === 0 && before && 'name' in before && before.name === name && JOINED.has(name)) {
                // It is the sound of whichever word brings its stress.
                if (stress > before.stress) before.emphasis = piece.emphasis;
                else if (stress === before.stress) before.emphasis = strongerOf(before.emphasis, piece.emphasis);
                before.stress = Math.max(before.stress, stress);
            } else tokens.push({ name, stress, first: k === 0, emphasis: piece.emphasis });
        });
    });
    return besideOthers(tokens);
};

/**
 * The sounds as they are beside each other.
 */
const besideOthers = (tokens: readonly TSaidToken[]): TSaidToken[] => {
    const nameAt = (i: number): string | undefined => {
        const token = tokens[i];
        return token && 'name' in token ? token.name : undefined;
    };
    return tokens.map((token, i) => {
        if (!('name' in token)) return token;
        const after = tokens[i + 1];
        return { ...token, name: saidAs(token.name, nameAt(i - 1), nameAt(i + 1), after !== undefined && 'first' in after && after.first) };
    });
};

/**
 * What a sound becomes beside its neighbours: an n is made where the next consonant is ("un beso" is
 * an m), and before a w only when that begins the next word ("un huevo", not "nuevo"), and b, d and g only shut the mouth after a pause, a nasal or, the d, an l.
 */
const saidAs = (name: string, before: string | undefined, after: string | undefined, afterBegins: boolean): string => {
    if (name === 'N' && after) return LIPS.has(after) ? 'M' : BACK.has(after) || (after === 'W' && afterBegins) ? 'NG' : name;
    if (!before || before === 'N' || before === 'M') return name;
    if (name === 'B') return 'BH';
    if (name === 'D') return before === 'L' ? name : 'DDH';
    if (name === 'G') return 'GH';
    return name;
};

/**
 * Whether a sound is the unstressed vowel of two that meet across words, which is said short.
 *
 * @internal
 */
export const isRunTogether = (tokens: readonly TSaidToken[], i: number): boolean => {
    const token = tokens[i]!;
    if (!('name' in token) || !VOWELS.has(token.name) || token.stress > 0) return false;
    const before = tokens[i - 1];
    const after = tokens[i + 1];
    const starts = (one: TSaidToken): boolean => 'first' in one && one.first;
    return (after !== undefined && 'name' in after && VOWELS.has(after.name) && starts(after))
        || (before !== undefined && 'name' in before && VOWELS.has(before.name) && starts(token));
};

/**
 * A sound made at the back of the mouth, moved to where the next vowel is: the k of "quiso" is
 * further forward than the one of "cubo".
 *
 * @internal
 */
export const spanishShape = (name: string, phoneme: TPhoneme, next: TNextSound): TPhoneme => {
    if (!next || !['K', 'G', 'GH', 'X'].includes(name)) return phoneme;
    const place = next.formants[1] > 1700 ? 2200 : next.formants[1] > 1150 ? 1600 : 1050;
    return {
        ...phoneme,
        formants: [phoneme.formants[0], place, phoneme.formants[2]],
        noise: phoneme.noise && { ...phoneme.noise, at: name === 'X' ? Math.max(1200, place * 0.95) : place * 1.1 },
    };
};

/**
 * The air after an unvoiced stop: nearly none in Spanish.
 *
 * @internal
 */
export const spanishPuff = (name: string): { length: number; level: number } => ({ length: name === 'K' ? 0.01 : 0.003, level: 0.4 });

/**
 * Accents come late on their syllables, the last of a sentence on it and smaller.
 *
 * @internal
 */
export const spanishAccent: TAccentShape = (accent, index, count, { mark }) => {
    const last = index === count - 1;
    if (!last) accent.at += accent.width * 0.35;
    accent.height *= mark === '!' ? 1.4 : last && closes(mark) && mark !== '?' ? 0.75 : 1;
};

/**
 * How many times as long a vowel is, by its stress.
 *
 * @internal
 */
export const spanishVowel = (stress: number): number => (stress === 1 ? 1.2 : stress === 2 ? 1 : 0.8);

/**
 * Phonemes written as they are, said as Spanish says them. A question written so is taken to ask for
 * a yes or a no: its words are not known.
 *
 * @internal
 */
export const saySpanish = (written: readonly TPhonemeToken[]): TSaidToken[] => {
    let begins = true;
    return besideOthers(written.map((token, i): TSaidToken => {
        if ('name' in token) return { ...token, first: false };
        const end = written.find((one, k) => k >= i && 'pause' in one && closes(one.mark));
        const asks = end !== undefined && 'pause' in end && end.mark === '?';
        const said = { pause: PAUSES[token.mark]!, mark: token.mark, asks, asksWhat: false, begins: asks && begins };
        begins = closes(token.mark);
        return said;
    }));
};
