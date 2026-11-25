const ONES = [
    'zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen',
    'sixteen', 'seventeen', 'eighteen', 'nineteen',
];
const TENS = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];

const wordsOf = (n: number): string => {
    if (n < 20) return ONES[n]!;
    if (n < 100) return TENS[Math.floor(n / 10)]! + (n % 10 ? ` ${ONES[n % 10]!}` : '');
    if (n < 1000) return `${ONES[Math.floor(n / 100)]!} hundred${n % 100 ? ` ${wordsOf(n % 100)}` : ''}`;
    return `${wordsOf(Math.floor(n / 1000))} thousand${n % 1000 ? ` ${wordsOf(n % 1000)}` : ''}`;
};

const digitByDigit = (digits: string): string => [...digits].map((digit) => ONES[Number(digit)]!).join(' ');

/**
 * A row of digits as it is said: as a number, or digit by digit when it begins with a zero ("007") or
 * is too long to be one.
 */
const digitsOf = (digits: string): string => (digits.length > 6 || /^0./.test(digits) ? digitByDigit(digits) : wordsOf(Number(digits)));

const ORDINALS: ReadonlyMap<string, string> = new Map([['one', 'first'], ['two', 'second'], ['three', 'third'], ['five', 'fifth'], ['eight', 'eighth'], ['nine', 'ninth'], ['twelve', 'twelfth']]);

/** A number as a place: "21" is "twenty first". */
const placeOf = (digits: string): string =>
    digitsOf(digits).replace(/[a-z]+$/, (last) => ORDINALS.get(last) ?? (last.endsWith('y') ? `${last.slice(0, -1)}ieth` : `${last}th`));

const written = (number: string): string => {
    const whole = /^(\d+|[1-9]\d{0,2}(?:,\d{3})+)(?:\.(\d+))?$/.exec(number);
    if (whole) return digitsOf(whole[1]!.replace(/,/g, '')) + (whole[2] ? ` point ${digitByDigit(whole[2])}` : '');
    return number.replace(/\d+/g, digitsOf).replace(/[.,]/g, '$& ');
};

/**
 * A text with its numbers written as words, up to 999999, with or without a comma every three digits
 * ("5,000"), with decimals ("3.5") or as a place ("2nd"); a longer one, or one that begins with a
 * zero, is read digit by digit.
 *
 * @internal
 */
export const spellEnglishNumbers = (text: string): string =>
    text.replace(/(\d+(?:,\d{3})*)(?:st|nd|rd|th)\b/g, (_, digits: string) => ` ${placeOf(digits.replace(/,/g, ''))} `).replace(/\d+(?:[.,]\d+)*/g, (number) => ` ${written(number)} `);
