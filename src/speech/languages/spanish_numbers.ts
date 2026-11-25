const SMALL = [
    'cero', 'uno', 'dos', 'tres', 'cuatro', 'cinco', 'seis', 'siete', 'ocho', 'nueve', 'diez', 'once', 'doce', 'trece', 'catorce', 'quince',
    'dieciséis', 'diecisiete', 'dieciocho', 'diecinueve', 'veinte', 'veintiuno', 'veintidós', 'veintitrés', 'veinticuatro', 'veinticinco',
    'veintiséis', 'veintisiete', 'veintiocho', 'veintinueve',
];
const TENS = ['', '', '', 'treinta', 'cuarenta', 'cincuenta', 'sesenta', 'setenta', 'ochenta', 'noventa'];
const HUNDREDS = ['', 'ciento', 'doscientos', 'trescientos', 'cuatrocientos', 'quinientos', 'seiscientos', 'setecientos', 'ochocientos', 'novecientos'];

const wordsOf = (n: number): string => {
    if (n < 30) return SMALL[n]!;
    if (n < 100) return TENS[Math.floor(n / 10)]! + (n % 10 ? ` y ${SMALL[n % 10]!}` : '');
    if (n === 100) return 'cien';
    if (n < 1000) return HUNDREDS[Math.floor(n / 100)]! + (n % 100 ? ` ${wordsOf(n % 100)}` : '');
    const thousands = Math.floor(n / 1000);
    const many = thousands === 1 ? 'mil' : `${wordsOf(thousands).replace(/veintiuno$/, 'veintiún').replace(/uno$/, 'un')} mil`;
    return many + (n % 1000 ? ` ${wordsOf(n % 1000)}` : '');
};

const digitByDigit = (digits: string): string => [...digits].map((digit) => SMALL[Number(digit)]!).join(' ');

/**
 * A row of digits as it is said: as a number, or digit by digit when it begins with a zero ("007") or
 * is too long to be one.
 */
const digitsOf = (digits: string): string => (digits.length > 6 || /^0./.test(digits) ? digitByDigit(digits) : wordsOf(Number(digits)));

const written = (number: string): string => {
    const grouped = /^([1-9]\d{0,2}(?:\.\d{3})+)(?:,(\d+))?$/.exec(number);
    if (grouped) return digitsOf(grouped[1]!.replace(/\./g, '')) + (grouped[2] ? ` coma ${digitsOf(grouped[2])}` : '');
    const decimal = /^(\d+)([.,])(\d+)$/.exec(number);
    if (decimal) return `${digitsOf(decimal[1]!)} ${decimal[2] === '.' ? 'punto' : 'coma'} ${digitsOf(decimal[3]!)}`;
    return number.replace(/\d+/g, digitsOf).replace(/[.,]/g, '$& ');
};

/**
 * A text with its numbers written as words, up to 999999, with or without a point every three digits
 * ("5.000") and with decimals ("3,5"); a longer one, or one that begins with a zero, is read digit by
 * digit.
 *
 * @internal
 */
export const spellNumbers = (text: string): string => text.replace(/\d+(?:[.,]\d+)*/g, (number) => ` ${written(number)} `);
