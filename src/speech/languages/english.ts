/**
 * English read aloud: the words it does not write as it says them by a list, the ones made from those
 * by their endings, and the rest by rules. The accent is American.
 */

import { SMALL_WORDS, WORDS } from './english_words';
import { englishByRules } from './english_rules';
import { spellEnglishNumbers } from './english_numbers';
import { cutText, phonemesOfPieces } from './pieces';
import type { TPiece } from './pieces';

const VOWEL = /[aeiouy]/;
const UNVOICED = /^(P|T|K|F|TH|S|SH|CH)$/;
const HISSING = /^(S|Z|SH|ZH|CH|JH)$/;

const lastOf = (sounds: readonly string[]): string => sounds[sounds.length - 1]?.replace(/\d/, '') ?? '';

/** The s of "cats", "dogs" and "boxes". */
const withS = (sounds: readonly string[]): string[] => {
    const last = lastOf(sounds);
    return [...sounds, ...(HISSING.test(last) ? ['IH0', 'Z'] : UNVOICED.test(last) ? ['S'] : ['Z'])];
};

/** The ed of "jumped", "opened" and "wanted". */
const withEd = (sounds: readonly string[]): string[] => {
    const last = lastOf(sounds);
    return [...sounds, ...(last === 'T' || last === 'D' ? ['IH0', 'D'] : UNVOICED.test(last) ? ['T'] : ['D'])];
};

/** The words an ending may have been put on: "hop" and "hope" of "hop-ing", "run" of "runn-ing", "try" of "tri-ed". */
const basesOf = (stem: string): string[] => [
    stem, `${stem}e`, ...(/([a-z])\1$/.test(stem) ? [stem.slice(0, -1)] : []), ...(stem.endsWith('i') ? [`${stem.slice(0, -1)}y`] : []),
];

/** A stem's word, if it is in the list and it is not a small one, which take no endings. */
const listed = (stem: string): readonly string[] | undefined => {
    for (const base of basesOf(stem)) if (WORDS.has(base) && !SMALL_WORDS.has(base)) return WORDS.get(base);
    return undefined;
};

/** A stem that is not in the list, as the word its spelling says it comes from. */
const guessed = (stem: string): string[] => {
    if (stem.endsWith('i')) return englishByRules(`${stem.slice(0, -1)}y`);
    if (/([bdgmnprt])\1$/.test(stem)) return englishByRules(stem.slice(0, -1));
    const dropped = (/(^|[^aeiou])[aeiouy][bcdgkmnpstvz]$/.test(stem) && !/[aeiouy].*(en|er|on|it|et|op|om)$/.test(stem)) || (/[cgsvz]$/.test(stem) && !stem.endsWith('ss'));
    return englishByRules(dropped ? `${stem}e` : stem);
};

const ENDINGS: readonly (readonly [ending: string, sounds: readonly string[]])[] = [
    ['ly', ['L', 'IY0']], ['ness', ['N', 'AH0', 'S']], ['less', ['L', 'AH0', 'S']], ['ful', ['F', 'AH0', 'L']], ['some', ['S', 'AH0', 'M']], ['ment', ['M', 'AH0', 'N', 'T']],
];
const LISTED_ENDINGS: readonly (readonly [ending: string, sounds: readonly string[]])[] = [['er', ['ER0']], ['est', ['AH0', 'S', 'T']], ['y', ['IY0']]];
const TAILS: ReadonlyMap<string, readonly string[]> = new Map([
    ['dom', ['D', 'AH0', 'M']], ['ship', ['SH', 'IH0', 'P']], ['hood', ['HH', 'UH2', 'D']], ['self', ['S', 'EH1', 'L', 'F']],
    ['ward', ['W', 'ER0', 'D']], ['wise', ['W', 'AY2', 'Z']], ['man', ['M', 'AH0', 'N']],
]);

/**
 * A word as phonemes.
 *
 * @internal
 */
export const englishWord = (written: string): readonly string[] => {
    const known = WORDS.get(written);
    if (known) return known;
    const word = written.replace(/'/g, '');
    if (written.length > LONGEST) return englishByRules(word);
    if (word !== written) return ofContraction(written) ?? englishWord(word);
    // One of four letters or more that ends in s is several: "NPCs".
    if (!VOWEL.test(word)) return /^.{3,}s$/.test(word) ? withS(ofLetters(word.slice(0, -1))) : ofLetters(word);
    return ofEnding(word) ?? ofTwoWords(word) ?? ofTail(word) ?? englishByRules(word);
};

const isVowelSound = (sound: string): boolean => /\d$/.test(sound);

/** A word and what an apostrophe leaves of another: "player's", "we'll", "wasn't". */
const ofContraction = (written: string): readonly string[] | undefined => {
    const not = /^(.+)n't$/.exec(written);
    if (not) {
        const verb = [...englishWord(not[1]!)];
        const vowel = verb.findLastIndex(isVowelSound);
        const stressed = verb.map((sound, i) => (i === vowel && !verb.some((one) => one.endsWith('1')) ? sound.replace(/\d/, '1') : sound));
        const open = isVowelSound(verb[verb.length - 1] ?? '') || lastOf(verb) === 'R';
        return [...stressed, ...(open ? [] : ['AH0']), 'N', 'T'];
    }
    const cut = /^(.+)'(s|d|ll|ve|re|m)$/.exec(written);
    if (!cut) return undefined;
    const sounds = englishWord(cut[1]!);
    const last = lastOf(sounds);
    const open = isVowelSound(sounds[sounds.length - 1] ?? '');
    switch (cut[2]) {
        case 's': return withS(sounds);
        case 'd': return [...sounds, ...(last === 'T' || last === 'D' ? ['AH0'] : []), 'D'];
        case 'll': return [...sounds, ...(open ? [] : ['AH0']), 'L'];
        case 've': return [...sounds, ...(open ? [] : ['AH0']), 'V'];
        case 're': return [...sounds, 'ER0'];
        default: return [...sounds, 'M'];
    }
};

const LETTERS: ReadonlyMap<string, readonly string[]> = new Map(
    'b B IY|c S IY|d D IY|f EH F|g JH IY|h EY CH|j JH EY|k K EY|l EH L|m EH M|n EH N|p P IY|q K Y UW|r AA R|s EH S|t T IY|v V IY|w D AH B AH L Y UW|x EH K S|z Z IY'
        .split('|').map((entry) => [entry[0]!, entry.slice(2).split(' ')]),
);

/** A word with no vowel, letter by letter, the last one stressed: "HP", "NPC". */
const ofLetters = (word: string): string[] =>
    [...word].flatMap((letter, i) => {
        const sounds = LETTERS.get(letter) ?? [];
        const vowel = sounds.findIndex((sound) => /^[AEIOU]/.test(sound));
        return sounds.map((sound, k) => (/^[AEIOU]/.test(sound) ? `${sound}${k !== vowel ? 0 : i === word.length - 1 ? 1 : 2}` : sound));
    });

/** The longest a word is for the voice to look for others and endings in it. */
const LONGEST = 40;

/** A word that is another with an ending. */
const ofEnding = (word: string): readonly string[] | undefined => {
    const stemOf = (ending: RegExp): string | undefined => ending.exec(word)?.[1];
    let stem = stemOf(/^(.{2,}?)ies$/);
    if (stem) return withS(englishWord(`${stem}y`));
    stem = stemOf(/^(.{2,}(?:s|x|z|ch|sh))es$/);
    if (stem) return withS(englishWord(/[^s]s$|z$/.test(stem) ? `${stem}e` : stem));
    stem = stemOf(/^(.+[^sui])s$/);
    if (stem) return withS(englishWord(stem));
    stem = stemOf(/^(.+[^e])ed$/);
    if (stem && VOWEL.test(stem)) return withEd(listed(stem) ?? guessed(stem));
    // The old forms, "knoweth" and "askest".
    stem = stemOf(/^(.{2,})e(?:th|st)$/);
    const old = stem && VOWEL.test(stem) ? listed(stem) : undefined;
    if (old) return [...old, 'AH0', ...(word.endsWith('th') ? ['TH'] : ['S', 'T'])];
    stem = stemOf(/^(.{2,})ing$/);
    if (stem && VOWEL.test(stem)) return [...(listed(stem) ?? guessed(stem)), 'IH0', 'NG'];
    stem = stemOf(/^(.{3,})i(?:er|est)$/);
    if (stem) return [...englishWord(`${stem}y`), ...(word.endsWith('er') ? ['ER0'] : ['AH0', 'S', 'T'])];
    stem = stemOf(/^(.{3,}ic)ally$/);
    if (stem) return [...englishWord(stem), 'L', 'IY0'];
    for (const [ending, sounds] of LISTED_ENDINGS) {
        const base = word.endsWith(ending) && word.length > ending.length + 2 ? listed(word.slice(0, -ending.length)) : undefined;
        if (base) return [...base, ...sounds];
    }
    for (const [ending, sounds] of ENDINGS) {
        if (!word.endsWith(ending) || word.length <= ending.length + 2) continue;
        const base = word.slice(0, -ending.length);
        if (VOWEL.test(base)) return [...englishWord(base.endsWith('i') ? `${base.slice(0, -1)}y` : base), ...sounds];
    }
    return undefined;
};

/** A word made of two, the first stressed: "starlight", "gameplay". */
const ofTwoWords = (word: string): readonly string[] | undefined => {
    const second = (sounds: readonly string[]): string[] => sounds.map((sound) => sound.replace('1', '2'));
    const firstOf = (at: number): readonly string[] | undefined => (SMALL_WORDS.has(word.slice(0, at)) ? undefined : WORDS.get(word.slice(0, at)));
    for (let at = 3; at <= word.length - 3; at += 1) {
        const first = firstOf(at);
        const rest = WORDS.get(word.slice(at));
        if (first && rest) return [...first, ...second(rest)];
    }
    for (let at = 4; at <= word.length - 4; at += 1) {
        const first = firstOf(at);
        const rest = word.slice(at);
        if (first && /^[^aeiouyhr]/.test(rest) && VOWEL.test(rest)) return [...first, ...second(englishByRules(rest))];
    }
    return undefined;
};

/** A word with one of the tails that make others, "kingdom". */
const ofTail = (word: string): readonly string[] | undefined => {
    const cut = /^([a-z]{3,})(dom|ship|hood|self|ward|wise|man)$/.exec(word);
    return cut ? [...englishWord(cut[1]!), ...TAILS.get(cut[2]!)!] : undefined;
};

/**
 * Whether a word is a small one, said without stress.
 *
 * @internal
 */
export const isSmall = (word: string): boolean => SMALL_WORDS.has(word);

/**
 * A word as phonemes: a small one has no stress of its own when it `leans` on the others.
 */
const readWord = (word: string, leans: boolean): string[] => {
    const sounds = [...englishWord(word)];
    if (leans || !isSmall(word)) return sounds;
    const last = sounds.findLastIndex((sound) => sound.endsWith('0'));
    return sounds.map((sound, i) => (i === last ? sound.replace('0', '1') : sound));
};

/** A text with its accents off (a last é is an ay, "fiancé"), its titles without their point and its numbers as words. */
const spelled = (text: string): string =>
    spellEnglishNumbers(text.replace(/é(?![a-z])/g, 'ay').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[’‘]/g, "'").replace(/\b(mr|mrs|ms|dr|vs)\./g, '$1'));

/**
 * Cuts an English text into words and pauses.
 *
 * @internal
 */
export const englishPieces = (text: string): TPiece[] =>
    cutText(text, { pattern: /[a-z]+(?:'[a-z]+)*|[,;.!?:—–()…]/g, spell: spelled, read: readWord });

/**
 * English text as phonemes, a word's stress on its vowels, punctuation kept as pauses.
 *
 * @internal
 */
export const englishToPhonemes = (text: string): string => phonemesOfPieces(englishPieces(text));
