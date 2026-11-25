/**
 * English letters to sounds, for the words that are not in the list. A rule is some letters and the
 * sounds they make where what is after and before them fits; of a letter's rules, the first that fits.
 */

type TRule = { letters: string; sounds: readonly string[]; after: RegExp | null; before: RegExp | null };

const rule = (letters: string, sounds: string, after: RegExp | null = null, before: RegExp | null = null): TRule => ({ letters, sounds: sounds === '' ? [] : sounds.split(' '), after, before });

/** A silent e after a consonant, which makes the vowel before it long: "cave". */
const E = /^[bcdfghjklmnpqrstvwxz]e(s|d)?$/;
/** A consonant and an ending, which do too: "caving". */
const OPEN = /^[bcdfgjklmnprstvz](ing|ed|er|ers|y|able|ion|ia|io|iu)/;

const RULES: Readonly<Record<string, readonly TRule[]>> = {
    a: [
        rule('augh', 'AO'), rule('au', 'AO'), rule('aw', 'AO'), rule('air', 'EH R'), rule('ai', 'EY'), rule('ay', 'EY'), rule('are', 'EH R', /^s?$/),
        rule('arr', 'AE R', /^[aeiouy]/), rule('ar', 'AO R', null, /w$/), rule('ar', 'EH R', /^[iaeouy]/), rule('ar', 'AA R'), rule('alk', 'AO K'),
        rule('all', 'AO L', /^(s|$|[bcdfghjkmnp])/), rule('al', 'AO L', /^[td]/), rule('alm', 'AA M'), rule('ange', 'EY N JH'), rule('aste', 'EY S T'),
        rule('a', 'EY', /^tion|^sion|^ture$/), rule('a', 'AH', /^nge$/, /[aeiouy][a-z]*$/), rule('a', 'EY', /^[bdfgkpt]le/),
        rule('age', 'IH JH', /^s?$/, /[aeiouy][a-z]+$/), rule('a', 'EY', E), rule('a', 'EY', OPEN), rule('a', 'AA', /^(nt|s?h|tch)/, /w$/),
        rule('a', 'AH', /^$/), rule('a', 'AE'),
    ],
    b: [rule('bb', 'B'), rule('b', '', /^s?$/, /m$/), rule('bt', 'T', /^s?$/), rule('b', 'B')],
    c: [
        rule('ch', 'K', /^[rl]/), rule('ch', 'CH'), rule('ck', 'K'), rule('cc', 'K S', /^[eiy]/), rule('cc', 'K'), rule('c', 'SH', /^i(a|o|e)|^ean/),
        rule('c', 'S', /^[eiy']/), rule('c', 'K'),
    ],
    d: [rule('dge', 'JH'), rule('dd', 'D'), rule('d', 'D')],
    e: [
        rule('eer', 'IH R'), rule('ee', 'IY'), rule('ear', 'ER', /^[ltnc]/), rule('ear', 'IH R'), rule('ea', 'EH', /^(d|lth|ther|sure)/), rule('ea', 'IY'),
        rule('eigh', 'EY'), rule('ei', 'IY', null, /c$/), rule('ei', 'EY'), rule('ey', 'IY', /^s?$/), rule('ey', 'EY'), rule('ew', 'Y UW', null, /[fmphcbv]$/),
        rule('ew', 'UW'), rule('eon', 'AH N', /^s?$/, /[cgl]$/), rule('eu', 'Y UW'), rule('ere', 'IH R', /^$/), rule('err', 'EH R'),
        rule('er', 'EH R', /^[aiouy]/), rule('er', 'ER', /^$|^[^aeiou]/), rule('er', 'ER'), rule('e', '', /^$/, /[aeiouy][a-z]*$/), rule('e', 'IY', /^$/),
        rule('e', '', /^s$/, /[aeiouy][a-z]*[^sxzcgh]$/), rule('ed', 'AH D', /^$/, /[aeiouy][a-z]*[cr]$/), rule('e', '', /^(ly|ment|ful|less|ness)/, /[aeiouy][^aeiouy]+$/),
        rule('ean', 'AH N', /^$/, /c$/), rule('el', 'AH L', /^s?$/, /[^aeiou]$/), rule('en', 'AH N', /^s?$/, /[aeiouy][^aeiouy]+$/), rule('e', 'IY', E),
        rule('e', 'IY', /^[bcdfgklmnprstv](ia|io|iu|ea)/), rule('e', 'IY', /^(qu|cr|gr|tr|v[ie])/, /^[a-z]?$/), rule('e', 'EH'),
    ],
    f: [rule('ff', 'F'), rule('f', 'F')],
    g: [
        rule('gh', 'G', null, /^$/), rule('gh', ''), rule('gn', 'N', null, /^$/), rule('g', '', /^n(s|ed)?$/), rule('gg', 'G'),
        rule('gu', 'G', /^[eia]/, /^$/), rule('gue', 'G', /^$/), rule('g', 'JH', /^[eiy]/), rule('g', 'G'),
    ],
    h: [rule('h', '', null, /[rx]$/), rule('h', 'HH')],
    i: [
        rule('igh', 'AY'), rule('ie', 'AY', /^[sd]?$/, /^[a-z]{1,2}$/), rule('ie', 'IY', /^[a-z]/), rule('ie', 'IY'), rule('ind', 'AY N D', /^s?$/),
        rule('ild', 'AY L D', /^s?$/), rule('ign', 'AY N', /^(s|ed)?$/), rule('ire', 'AY ER', /^s?$/), rule('irr', 'IH R'), rule('ir', 'AY R', /^[aou]/),
        rule('ir', 'ER', /^[^aeiou]|^$/), rule('ique', 'IY K'), rule('ive', 'IH V', /^$/, /[aeiouy][a-z]+$/), rule('ice', 'IH S', /^$/, /[aeiouy][a-z]+$/),
        rule('ite', 'AH T', /^$/, /[aeiouy][a-z]*[aeiouy][a-z]+$/), rule('ious', 'IY AH S'), rule('i', '', /^(ous|al|an|on|ent)/, /[ct]$/),
        rule('ine', 'AH N', /^$/, /[aeiouy][a-z]*[gds]$/), rule('ine', 'IY N', /^$/, /[aeiouy][a-z]+$/), rule('i', 'AY', E),
        rule('i', 'AY', /^[bcdfgklmnpstvz](ing|ed|er|ers|y|able)/), rule('i', 'IY', /^[ao]/), rule('i', 'IY', /^$/), rule('i', 'IH'),
    ],
    j: [rule('j', 'JH')],
    k: [rule('kn', 'N', null, /^$/), rule('kk', 'K'), rule('k', 'K')],
    l: [rule('ll', 'L'), rule('le', 'AH L', /^s?$/, /[bcdfgkpstz]$/), rule('l', 'L')],
    m: [rule('mm', 'M'), rule('m', 'M')],
    n: [
        rule('nn', 'N'), rule('ng', 'NG', /^(s|ed|ing)?$/), rule('ng', 'NG G', /^[aoulr]|^er$/), rule('n', 'NG', /^[kx]|^c[aouhrlt]/), rule('n', 'N'),
    ],
    o: [
        rule('oar', 'AO R'), rule('oa', 'OW'), rule('oi', 'OY'), rule('oy', 'OY'), rule('oor', 'AO R'), rule('oo', 'UH', /^k|^d$/), rule('oo', 'UW'),
        rule('ought', 'AO T'), rule('ough', 'AH F'), rule('ould', 'UH D'), rule('our', 'ER', /^n|^age/, /j$|c$|fl$/), rule('our', 'AO R', /^[a-z]/),
        rule('our', 'AW ER'), rule('ous', 'AH S', /^(ly)?$/), rule('ou', 'AW'), rule('ow', 'OW', /^(s|n|ed|ing)?$/, /(l|r|sh|th|kn|sn|bl|ll|rr|st)$/),
        rule('ow', 'OW', /^$/, /[aeiouy][a-z]+$/), rule('ow', 'AW'), rule('old', 'OW L D'), rule('oll', 'OW L'), rule('olt', 'OW L T'),
        rule('ost', 'OW S T', /^$/, /^(m|p|h)$/), rule('ong', 'AO NG', /^(s|er)?$/), rule('o', 'AO', /^(ss|ff|ft|st|th)/), rule('or', 'ER', /^[dkmst]/, /w$/),
        rule('ore', 'AO R', /^s?$/), rule('or', 'ER', /^s?$/, /[aeiouy][a-z]*[^aeiou]$/), rule('or', 'AO R'), rule('o', 'OW', /^len$|^ken$|^zen$|^ven$/),
        rule('o', 'AA', /^ll/), rule('o', 'OW', E), rule('o', 'OW', OPEN), rule('on', 'AH N', /^s?$/, /[aeiouy][a-z]*[^aeiouy]$/), rule('o', 'OW', /^$/),
        rule('o', 'OW', /^[bcdgkmnpstv][aeiou]/), rule('o', 'AA'),
    ],
    p: [rule('ph', 'F'), rule('pp', 'P'), rule('p', '', /^s/, /^$/), rule('p', 'P')],
    q: [rule('que', 'K', /^s?$/), rule('qu', 'K W'), rule('q', 'K')],
    r: [rule('rh', 'R'), rule('rr', 'R'), rule('r', 'R')],
    s: [
        rule('sch', 'S K'), rule('sh', 'SH'), rule('ssion', 'SH AH N'), rule('sion', 'ZH AH N', null, /[aeiour]$/), rule('sion', 'SH AH N'),
        rule('ssure', 'SH ER'), rule('sure', 'ZH ER', /^$/, /[aeiou]$/), rule('stle', 'S AH L'), rule('ss', 'S'), rule('sc', 'S', /^[eiy]/),
        rule('s', 'Z', /^$/, /([aeiouy]|[bdglmnrvw])e?$/), rule('s', 'Z', /^e(s|d)?$/, /[aeiou]{1,2}$/), rule('s', 'Z', /^[aeiouy]/, /[aeiouy]$/),
        rule('s', 'S'),
    ],
    t: [
        rule('tch', 'CH'), rule('tion', 'SH AH N'), rule('ture', 'CH ER'), rule('t', 'SH', /^i(al|an|ent|ous)/), rule('th', 'DH', /^er/, /[aeiou]$/),
        rule('th', 'DH', /^e$/), rule('th', 'TH'), rule('tt', 'T'), rule('t', 'T'),
    ],
    u: [
        rule('us', 'AH S', /^$/), rule('um', 'AH M', /^s?$/, /[aeiouy][a-z]+$/), rule('ue', 'UW', /^s?$/), rule('ui', 'UW', /^[a-z]/),
        rule('ure', 'Y UH R', /^$/), rule('urr', 'ER'), rule('ur', 'ER', /^[^aeiou]|^$/), rule('u', 'UW', E, /[rljsdtn]$/), rule('u', 'Y UW', E),
        rule('u', 'UW', /^[bcdfgklmnpst][aeiouy]/, /[rljsdtn]$/), rule('u', 'Y UW', /^[bcdfgklmnpst][aeiouy]/), rule('u', 'AH'),
    ],
    v: [rule('v', 'V')],
    w: [rule('wh', 'W'), rule('wr', 'R'), rule('w', 'W')],
    x: [rule('x', 'Z', null, /^$/), rule('x', 'G Z', /^[aeiou]/, /^e$/), rule('x', 'K S')],
    y: [
        rule('y', 'Y', /^[aeiou]/, /^$/), rule('y', 'AY', /^$/, /^[^aeiou]+$/), rule('y', 'AY', /^$/, /f$/), rule('y', 'AY', E), rule('y', 'IY', /^s?$/),
        rule('y', 'Y', /^[aeiou]/), rule('y', 'IH'),
    ],
    z: [rule('zz', 'Z'), rule('z', 'Z')],
};

const VOWEL = /^(AA|AE|AH|AO|AW|AY|EH|ER|EY|IH|IY|OW|OY|UH|UW)/;

/** What a vowel becomes with no stress, and before the stress. */
const REDUCED: ReadonlyMap<string, string> = new Map([['AE', 'AH'], ['AA', 'AH'], ['EH', 'AH'], ['UH', 'AH']]);
const REDUCED_BEFORE: ReadonlyMap<string, string> = new Map([['IY', 'IH'], ['OW', 'AH'], ['EH', 'IH']]);

/** Endings the stress is two and three syllables from, and ones that take it. */
const TWO_FROM = /(tion|sion|ic|ics|ian|ial)$/;
const THREE_FROM = /(ical|ity|ify|ious)$/;
const ON_IT = /(ee|eer|ique|oon|ain|ade)$/;
/** Beginnings that are not stressed in a word of two syllables, and endings that say it is the first all the same. */
const UNSTRESSED_START = /^(a[bcdfglmprsw]|be|de|re|ex|un|dis|mis|en|es[cpt]|col|com|con|cor|pro|per|sur|sup|sub|trans|im|in)[a-z]{3}/;
const FIRST_ALL_THE_SAME = /(er|le|y|en|on|el|et|ow|or|ic|ine|ish|ert|age|us|it|o|ar|al|est|ant)$/;

/** Which of a word's `count` vowels is stressed. */
const stressedOf = (word: string, count: number): number => {
    if (count === 1) return 0;
    if (THREE_FROM.test(word)) return Math.max(0, count - 3);
    if (TWO_FROM.test(word)) return count - 2;
    if (count > 2) return count - 3;
    if (ON_IT.test(word)) return 1;
    return UNSTRESSED_START.test(word) && !FIRST_ALL_THE_SAME.test(word) ? 1 : 0;
};

const soundsOf = (word: string): string[] => {
    const sounds: string[] = [];
    for (let i = 0; i < word.length;) {
        const rest = word.slice(i);
        const left = word.slice(0, i);
        const found = RULES[word[i]!]?.find(({ letters, after, before }) =>
            rest.startsWith(letters) && (before === null || before.test(left)) && (after === null || after.test(rest.slice(letters.length))));
        sounds.push(...(found?.sounds ?? []));
        i += found?.letters.length ?? 1;
    }
    return sounds;
};

/**
 * A word as phonemes, by its letters: its sounds, the vowel that is stressed, and the others as they
 * are without stress.
 *
 * @internal
 */
export const englishByRules = (word: string): string[] => {
    const sounds = soundsOf(word);
    const vowels = sounds.flatMap((sound, i) => (VOWEL.test(sound) ? [i] : []));
    const stressed = stressedOf(word, vowels.length);
    const said = sounds.map((sound, i) => {
        const nth = vowels.indexOf(i);
        if (nth < 0) return sound;
        if (nth === stressed) return `${sound}1`;
        const last = nth === vowels.length - 1;
        if (last && vowels.length > 2 && /(ate|ize|ise|ute)$/.test(word)) return `${sound}2`;
        if (last && sound === 'EY' && /(age|ate)$/.test(word)) return 'AH0';
        return `${(nth < stressed ? REDUCED_BEFORE.get(sound) : undefined) ?? REDUCED.get(sound) ?? sound}0`;
    });
    // An unstressed vowel and the r after it are one sound, before a consonant.
    return said.flatMap((sound, i) => {
        if (sound === 'R' && said[i - 1] === 'AH0' && !VOWEL.test(said[i + 1] ?? '')) return [];
        return sound === 'AH0' && said[i + 1] === 'R' && !VOWEL.test(said[i + 2] ?? '') ? ['ER0'] : [sound];
    });
};
