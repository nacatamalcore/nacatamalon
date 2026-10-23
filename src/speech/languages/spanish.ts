/**
 * Spanish read aloud by rules, which is all it needs: it is written nearly as it sounds. The s, z and
 * soft c are one sound and the ll is the y, as most of the Spanish-speaking world says them.
 */

type TSound = { name: string; vowel?: 'strong' | 'weak'; accent?: boolean };

const VOWELS: Readonly<Record<string, TSound>> = {
    a: { name: 'A', vowel: 'strong' }, e: { name: 'E', vowel: 'strong' }, o: { name: 'O', vowel: 'strong' },
    i: { name: 'I', vowel: 'weak' }, u: { name: 'U', vowel: 'weak' }, ü: { name: 'U', vowel: 'weak' },
    á: { name: 'A', vowel: 'strong', accent: true }, é: { name: 'E', vowel: 'strong', accent: true }, ó: { name: 'O', vowel: 'strong', accent: true },
    í: { name: 'I', vowel: 'strong', accent: true }, ú: { name: 'U', vowel: 'strong', accent: true },
};

const FRONT = 'eiéí';

/**
 * Small words said without stress of their own, leaning on the next: "el perro", "de casa".
 */
const UNSTRESSED = new Set([
    'el', 'la', 'lo', 'los', 'las', 'un', 'una', 'unos', 'unas', 'de', 'del', 'a', 'al', 'en', 'con', 'por', 'para', 'sin', 'y', 'e', 'o', 'u',
    'que', 'se', 'me', 'te', 'le', 'les', 'nos', 'mi', 'mis', 'tu', 'tus', 'su', 'sus', 'si', 'pero', 'como', 'cuando', 'donde',
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
                else sounds.push({ name: FRONT.includes(next) ? 'S' : 'K' });
                break;
            case 'd': sounds.push({ name: 'D' }); break;
            case 'f': sounds.push({ name: 'F' }); break;
            case 'g':
                if (FRONT.includes(next)) sounds.push({ name: 'X' });
                else {
                    sounds.push({ name: 'G' });
                    if (next === 'u' && FRONT.includes(after)) i += 1;
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
 * a y or a w ("bueno", "aire"), and the word's stressed vowel is marked.
 */
const phonemesOfWord = (word: string): string[] => {
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
    if (stressed === undefined && nuclei.length > 0 && !UNSTRESSED.has(word)) {
        const last = word[word.length - 1] ?? '';
        const penultimate = 'aeiouns'.includes(last) && nuclei.length > 1;
        stressed = nuclei[nuclei.length - (penultimate ? 2 : 1)];
    }
    return sounds.map((sound, i) => (isVowel(sound) ? `${sound.name}${i === stressed ? 1 : 0}` : sound.name));
};

/**
 * Spanish text as phonemes, a word's stress on its vowel, punctuation kept as pauses.
 *
 * @internal
 */
export const spanishToPhonemes = (text: string): string => {
    const out: string[] = [];
    for (const piece of text.toLowerCase().match(/[a-záéíóúüñ]+|[,;.!?]/g) ?? []) {
        if (/^[,;.!?]$/.test(piece)) out.push(piece);
        else out.push(...phonemesOfWord(piece));
    }
    return out.join(' ');
};
