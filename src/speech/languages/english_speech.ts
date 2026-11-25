import { isVowel } from '../phonemes';
import { closes } from './said';
import { englishPieces, isSmall } from './english';
import type { TPhonemeToken } from '../parse_phonemes';
import type { TAccentShape } from './melody';
import type { TPiece } from './pieces';
import type { TSaidSound, TSaidToken } from './said';

/**
 * How American English is said, beyond which sounds its words are: the stops with air and without,
 * the soft t of "water", the vowels cut short and held, and where a phrase's accents are.
 */

const PAUSES: Readonly<Record<string, number>> = { ',': 0.2, ';': 0.32, '.': 0.42, '!': 0.4, '?': 0.4 };

const INTERROGATIVE = /^(what|who|whom|whose|when|where|why|how|which|whence|wherefore|wherewithal)$/;
/** What may come before the word that asks: "and from where…?". */
const BEFORE_IT = /^(and|but|so|or|then|from|with|for|to|of|in|on|at|well|oh|hey)$/;
/** The words that ask, by how they sound, where only the sounds are known, and ones that begin so and end there. */
const INTERROGATIVE_SOUNDS = /^(W AH T|W EH R|W IH CH|W EH N|W AY|HH UW|HH AW)( |$)/;
const NOT_INTERROGATIVE = /^(W EH N [TD]|W AY [A-Z]+|HH AW S) \./;
/** The most words said before a question, with a comma, that is asked after: "Tell me, what is it?". */
const CALL = 3;
/** The words a question for a yes or a no begins with, which goes on being one after a comma. */
const ASKS_ALREADY = /^(am|is|are|was|were|do|does|did|have|has|had|can|could|will|would|shall|should|may|must)(n't)?$/;
/** Small words that stay small at the end of a phrase: "give me it". */
const ALWAYS_SMALL: ReadonlySet<string> = new Set(['it', 'them', 'him', 'me', 'us', 'you', 'her']);

const UNVOICED = /^(P|T|K|F|TH|S|SH|CH)$/;

/** A sentence's question, and the piece it begins at. */
type TAsked = { asks: boolean; asksWhat: boolean; at: number };

const askedFrom = (pieces: readonly TPiece[], from: number): TAsked => {
    let end = from;
    while (pieces[end] && (pieces[end]!.phonemes || !closes(pieces[end]!.text))) end += 1;
    if (pieces[end]?.text !== '?') return { asks: false, asksWhat: false, at: from };
    const asksAt = (at: number): boolean => {
        let word = at;
        while (BEFORE_IT.test(pieces[word]?.text ?? '')) word += 1;
        return INTERROGATIVE.test((pieces[word]?.text ?? '').replace(/'.*$/, ''));
    };
    if (asksAt(from)) return { asks: true, asksWhat: true, at: from };
    let phrase = from;
    for (let i = from; i < end; i += 1) {
        if (pieces[i]!.phonemes) continue;
        if (i - phrase > CALL || ASKS_ALREADY.test(pieces[phrase]!.text)) break;
        phrase = i + 1;
        if (asksAt(phrase)) return { asks: true, asksWhat: true, at: phrase };
    }
    return { asks: true, asksWhat: false, at: from };
};

/**
 * English text as what is said: its sounds, each as it is beside its neighbours, and its pauses.
 *
 * @internal
 */
export const readEnglish = (text: string): TSaidToken[] => {
    const pieces = englishPieces(text);
    const tokens: TSaidToken[] = [];
    let asked = askedFrom(pieces, 0);
    let phrase = 0;
    pieces.forEach((piece, i) => {
        if (!piece.phonemes) {
            const { asks, asksWhat, at } = asked;
            tokens.push({ pause: PAUSES[piece.text]!, mark: piece.text, asks: asks && phrase >= at, asksWhat: asksWhat && phrase >= at, begins: asks && phrase === at });
            phrase = i + 1;
            if (closes(piece.text)) asked = askedFrom(pieces, i + 1);
            return;
        }
        const next = pieces[i + 1]?.phonemes?.[0];
        let phonemes = piece.phonemes;
        if (piece.text === 'the' && next && isVowel(next.replace(/\d$/, ''))) phonemes = ['DH', 'IY0'];
        // A small word that ends its phrase is said whole.
        const whole = !next && piece.emphasis === undefined && isSmall(piece.text) && !ALWAYS_SMALL.has(piece.text);
        phonemes.forEach((phoneme, k) => {
            const stress = /\d$/.test(phoneme) ? Number(phoneme.slice(-1)) : 0;
            tokens.push({ name: phoneme.replace(/\d$/, ''), stress: whole && phoneme.endsWith('0') ? 2 : stress, first: k === 0, emphasis: piece.emphasis });
        });
    });
    return besideOthers(tokens);
};

/**
 * Phonemes written as they are, said as English says them. Where a word begins is not known, so a t
 * that begins one can be a tap too.
 *
 * @internal
 */
export const sayEnglish = (written: readonly TPhonemeToken[]): TSaidToken[] => {
    const askedAt = (from: number): Omit<TAsked, 'at'> => {
        const end = written.findIndex((token, i) => i >= from && 'pause' in token && closes(token.mark));
        const mark = written[end];
        if (!mark || !('pause' in mark) || mark.mark !== '?') return { asks: false, asksWhat: false };
        const sounds = written.slice(from, from + 5).map((token) => ('name' in token ? token.name : '.')).join(' ');
        return { asks: true, asksWhat: INTERROGATIVE_SOUNDS.test(sounds) && !NOT_INTERROGATIVE.test(sounds) };
    };
    let asked = askedAt(0);
    let begins = true;
    return besideOthers(written.map((token, i): TSaidToken => {
        if ('name' in token) return { ...token, first: false };
        const said = { pause: PAUSES[token.mark]!, mark: token.mark, ...asked, begins: asked.asks && begins };
        begins = closes(token.mark);
        if (begins) asked = askedAt(i + 1);
        return said;
    }));
};

/**
 * The sounds as they are beside each other: a t or a d between vowels, the second unstressed, is a
 * tap ("water", "ready"), and a p, t or k has air before a stressed vowel or beginning a word.
 */
const besideOthers = (tokens: readonly TSaidToken[]): TSaidToken[] => {
    const soundAt = (i: number): TSaidSound | undefined => {
        const token = tokens[i];
        return token && 'name' in token ? token : undefined;
    };
    const vowelAt = (i: number): TSaidSound | undefined => {
        const sound = soundAt(i);
        return sound && isVowel(sound.name) ? sound : undefined;
    };
    return tokens.map((token, i) => {
        if (!('name' in token)) return token;
        const before = soundAt(i - 1);
        const after = soundAt(i + 1);
        if ((token.name === 'T' || token.name === 'D') && !token.first && before && (isVowel(before.name) || before.name === 'R') && vowelAt(i + 1)?.stress === 0) return { ...token, name: 'DX' };
        if (!/^[PTK]$/.test(token.name)) return token;
        const vowel = vowelAt(i + 1) ?? (after && /^[RLWY]$/.test(after.name) ? vowelAt(i + 2) : undefined);
        return { ...token, air: vowel !== undefined && (vowel.stress > 0 || token.first) && before?.name !== 'S' };
    });
};

/**
 * How many times as long a vowel is: the unstressed ones short, and all of them cut by an unvoiced
 * sound after, "seat" beside "seed".
 *
 * @internal
 */
export const englishVowel = (stress: number, after: string | undefined): number =>
    (stress === 1 ? 1.15 : stress === 2 ? 1 : 0.68) * (after !== undefined && UNVOICED.test(after) ? 0.8 : 1);

/**
 * The air after an unvoiced stop: a puff, or nearly none.
 *
 * @internal
 */
export const englishPuff = (air: boolean): { length: number; level: number } => ({ length: air ? 0.04 : 0.008, level: 0.8 });

/**
 * Accents sit on their syllables, the last of a phrase the highest, but not where the pitch climbs
 * after it to ask for a yes or a no.
 *
 * @internal
 */
export const englishAccent: TAccentShape = (accent, index, count, { mark, asksWhat }) => {
    if (index < count - 1) accent.height *= 0.9;
    else accent.height *= mark === '?' && !asksWhat ? 0.4 : 1.3;
};
