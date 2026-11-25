/**
 * Spanish read aloud by rules, which is all it needs: it is written nearly as it sounds. The s, z and
 * soft c are one sound and the ll is the y, as most of the Spanish-speaking world says them.
 */

import { TAG, followEmphasis } from './emphasis';
import { spellNumbers } from './spanish_numbers';
import type { TEmphasis } from './emphasis';

type TSound = { name: string; vowel?: 'strong' | 'weak'; accent?: boolean };

const VOWELS: Readonly<Record<string, TSound>> = {
    a: { name: 'A', vowel: 'strong' }, e: { name: 'E', vowel: 'strong' }, o: { name: 'O', vowel: 'strong' },
    i: { name: 'I', vowel: 'weak' }, u: { name: 'U', vowel: 'weak' }, ü: { name: 'U', vowel: 'weak' },
    á: { name: 'A', vowel: 'strong', accent: true }, é: { name: 'E', vowel: 'strong', accent: true }, ó: { name: 'O', vowel: 'strong', accent: true },
    í: { name: 'I', vowel: 'strong', accent: true }, ú: { name: 'U', vowel: 'strong', accent: true },
};

const FRONT: ReadonlySet<string> = new Set('eiéí');

/**
 * Small words said without stress of their own, leaning on the next: "el perro", "de casa".
 */
const UNSTRESSED = new Set([
    'el', 'la', 'lo', 'los', 'las', 'un', 'una', 'unos', 'unas', 'de', 'del', 'a', 'al', 'en', 'con', 'por', 'para', 'sin', 'y', 'e', 'o', 'u',
    'porque', 'mas', 'ni', 'sobre', 'entre', 'os', 'hasta', 'desde', 'aunque', 'pues', 'que', 'se', 'me', 'te', 'le', 'les', 'nos', 'mi', 'mis', 'tu', 'tus', 'su', 'sus', 'si', 'pero', 'como', 'cuando', 'donde',
]);

/**
 * The sounds of one word's letters, before vowels are joined into syllables.
 */
const soundsOf = (word: string): TSound[] => {
    const sounds: TSound[] = [];
    for (let i = 0; i < word.length; i += 1) {
        const letter = word[i]!;
        const next = word[i + 1] ?? '';
        const after = word[i + 2] ?? '';
        const vowel = VOWELS[letter];
        if (vowel) {
            sounds.push({ ...vowel });
            continue;
        }
        switch (letter) {
            case 'b': case 'v': sounds.push({ name: 'B' }); break;
            case 'c':
                if (next === 'h') { sounds.push({ name: 'CH' }); i += 1; }
                else if (!FRONT.has(next)) sounds.push({ name: 'K' });
                // After an s or an x it is the same s, said once: "discípulo", "excelente".
                else if (!'sx'.includes(word[i - 1] ?? '-')) sounds.push({ name: 'S' });
                break;
            case 'd': sounds.push({ name: 'D' }); break;
            case 'f': sounds.push({ name: 'F' }); break;
            case 'g':
                if (FRONT.has(next)) sounds.push({ name: 'X' });
                else {
                    sounds.push({ name: 'G' });
                    if (next === 'u' && FRONT.has(after)) i += 1;
                }
                break;
            case 'h': break;
            case 'j': sounds.push({ name: 'X' }); break;
            case 'k': sounds.push({ name: 'K' }); break;
            case 'l':
                if (next === 'l') { sounds.push({ name: 'Y' }); i += 1; }
                else sounds.push({ name: 'L' });
                break;
            case 'm': sounds.push({ name: 'M' }); break;
            case 'n': sounds.push({ name: 'N' }); break;
            case 'ñ': sounds.push({ name: 'NY' }); break;
            case 'p': sounds.push({ name: 'P' }); break;
            case 'q':
                sounds.push({ name: 'K' });
                if (next === 'u') i += 1;
                break;
            case 'r': {
                const before = word[i - 1] ?? '';
                if (next === 'r') { sounds.push({ name: 'RR' }); i += 1; }
                else sounds.push({ name: i === 0 || 'nls'.includes(before) ? 'RR' : 'DX' });
                break;
            }
            case 's': case 'z': sounds.push({ name: 'S' }); break;
            case 't': sounds.push({ name: 'T' }); break;
            case 'w': sounds.push({ name: 'W' }); break;
            case 'x':
                if (i === 0) sounds.push({ name: 'S' });
                else sounds.push({ name: 'K' }, { name: 'S' });
                break;
            case 'y':
                // A y alone or ending a word is the vowel i: "y", "hoy", "rey".
                if (word.length === 1 || i === word.length - 1) sounds.push({ name: 'I', vowel: 'weak' });
                else sounds.push({ name: 'Y' });
                break;
            default: break;
        }
    }
    return sounds;
};

/**
 * Joins vowels into syllables: an unstressed i or u beside another vowel slides into it and becomes
 * a y or a w ("bueno", "aire"), and the word's stressed vowel is marked. A small word has none when
 * it leans on the next.
 */
const phonemesOfWord = (word: string, leans: boolean): string[] => {
    const sounds = soundsOf(word);
    const isVowel = (sound: TSound | undefined): boolean => sound?.vowel !== undefined;
    for (let i = 0; i < sounds.length; i += 1) {
        const sound = sounds[i]!;
        if (sound.vowel !== 'weak') continue;
        // Before a vowel it slides into it, which also makes the first of "ui" and "iu" the one that
        // slides; after one, it is the end of a falling pair, "ai", "au".
        if (isVowel(sounds[i + 1]) || isVowel(sounds[i - 1])) sounds[i] = { name: sound.name === 'I' ? 'Y' : 'W' };
    }
    const nuclei = sounds.map((sound, i) => (isVowel(sound) ? i : -1)).filter((i) => i >= 0);
    let stressed = nuclei.find((i) => sounds[i]!.accent);
    if (stressed === undefined && nuclei.length > 0 && !(leans && UNSTRESSED.has(word))) {
        const last = word[word.length - 1] ?? '';
        const penultimate = 'aeiouns'.includes(last) && nuclei.length > 1;
        stressed = nuclei[nuclei.length - (penultimate ? 2 : 1)];
    }
    return sounds.map((sound, i) => (isVowel(sound) ? `${sound.name}${i === stressed ? 1 : 0}` : sound.name));
};

/**
 * The mark a pause is said as, for the ones the voice has no pause of its own for: a colon stops it
 * as a semicolon does, a dash or a parenthesis as a comma.
 */
const MARKS: ReadonlyMap<string, string> = new Map([[':', ';'], ['—', ','], ['–', ','], ['(', ','], [')', ','], ['…', '.']]);

/**
 * Marks by how much they say about how a phrase ends, the least first: of several together, the last
 * of these is kept.
 */
const STRENGTH = ',;.!?';

/**
 * A Spanish text cut up: its words, with their phonemes, its pauses, and where its questions begin.
 *
 * @internal
 */
export type TSpanishPiece = { text: string; phonemes?: string[]; emphasis?: TEmphasis };

/**
 * Cuts a Spanish text into words, pauses (one for marks that come together, none before the first
 * word) and the `¿` a question begins with, its numbers read as words and its tags as its words' emphasis.
 *
 * @internal
 */
export const spanishPieces = (text: string): TSpanishPiece[] => {
    const out: TSpanishPiece[] = [];
    let emphasis: TEmphasis | undefined;
    let outside: ReadonlySet<TSpanishPiece> = new Set();
    // Cut at its tags, the odd ones are tags.
    text.normalize('NFC').split(TAG).forEach((part, i) => {
        if (i % 2 === 0) {
            addPieces(out, part, emphasis);
            return;
        }
        const before = emphasis;
        emphasis = followEmphasis(part, emphasis);
        if (before === undefined) outside = new Set(out);
        else if (before !== 'reduced') stressAlone(out.filter((piece) => !outside.has(piece)));
    });
    if (emphasis !== undefined) throw new Error('[NacatamalOn] speech: an <emphasis> is not closed.');
    return out;
};

/**
 * Small words emphasized with no other have a stress of their own: "mi" in "<emphasis>mi</emphasis>
 * casa".
 */
const stressAlone = (pieces: readonly TSpanishPiece[]): void => {
    if (pieces.some((piece) => piece.phonemes?.some((phoneme) => phoneme.endsWith('1')))) return;
    for (const piece of pieces) if (piece.phonemes) piece.phonemes = phonemesOfWord(piece.text, false);
};

/**
 * Adds the pieces of a text with no tags to the ones before it.
 */
const addPieces = (out: TSpanishPiece[], text: string, emphasis: TEmphasis | undefined): void => {
    for (const piece of spellNumbers(text.toLowerCase()).match(/[a-záéíóúüñ]+|[¿,;.!?:—–()…]/g) ?? []) {
        const mark = MARKS.get(piece) ?? piece;
        if (mark === '¿') {
            out.push({ text: mark });
            continue;
        }
        if (!STRENGTH.includes(mark)) {
            const phonemes = phonemesOfWord(mark, true);
            if (phonemes.length > 0) out.push({ text: mark, phonemes, emphasis });
            continue;
        }
        const last = out[out.length - 1];
        if (last === undefined) continue;
        if (last.text === '¿') {
            // A question with nothing in it is none, and a pause just inside one is not said.
            if (mark === '?') out.pop();
            continue;
        }
        if (last.phonemes) out.push({ text: mark });
        else if (STRENGTH.indexOf(mark) > STRENGTH.indexOf(last.text)) last.text = mark;
    }
};

/**
 * Spanish text as phonemes, a word's stress on its vowel, punctuation kept as pauses.
 *
 * @internal
 */
export const spanishToPhonemes = (text: string): string =>
    spanishPieces(text).flatMap((piece) => piece.phonemes ?? (piece.text === '¿' ? [] : [piece.text])).join(' ');
