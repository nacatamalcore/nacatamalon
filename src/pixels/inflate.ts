/**
 * The length a code of each symbol 257–285 stands for, and how many extra bits follow it.
 */
const LENGTH_BASE = [3, 4, 5, 6, 7, 8, 9, 10, 11, 13, 15, 17, 19, 23, 27, 31, 35, 43, 51, 59, 67, 83, 99, 115, 131, 163, 195, 227, 258];
const LENGTH_EXTRA = [0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 2, 2, 2, 2, 3, 3, 3, 3, 4, 4, 4, 4, 5, 5, 5, 5, 0];

/**
 * The distance each distance symbol 0–29 stands for, and how many extra bits follow it.
 */
const DIST_BASE = [1, 2, 3, 4, 5, 7, 9, 13, 17, 25, 33, 49, 65, 97, 129, 193, 257, 385, 513, 769, 1025, 1537, 2049, 3073, 4097, 6145, 8193, 12289, 16385, 24577];
const DIST_EXTRA = [0, 0, 0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6, 7, 7, 8, 8, 9, 9, 10, 10, 11, 11, 12, 12, 13, 13];

/**
 * The order the lengths of the code-length code are written in.
 */
const CODE_LENGTH_ORDER = [16, 17, 18, 0, 8, 7, 9, 6, 10, 5, 11, 4, 12, 3, 13, 2, 14, 1, 15];

/**
 * A canonical prefix code, as how many codes there are of each length and the symbols in code order:
 * enough to decode it one bit at a time.
 */
type THuffman = { counts: Uint16Array; symbols: Uint16Array };

const buildHuffman = (lengths: ArrayLike<number>): THuffman => {
    const counts = new Uint16Array(16);
    for (let i = 0; i < lengths.length; i++) {
        counts[lengths[i]!]!++;
    }
    counts[0] = 0;
    const offsets = new Uint16Array(16);
    for (let len = 1; len < 16; len++) {
        offsets[len] = offsets[len - 1]! + counts[len - 1]!;
    }
    const symbols = new Uint16Array(lengths.length);
    for (let i = 0; i < lengths.length; i++) {
        if (lengths[i]! !== 0) {
            symbols[offsets[lengths[i]!]!++] = i;
        }
    }
    return { counts, symbols };
};

const FIXED_LITERALS = buildHuffman(Array.from({ length: 288 }, (_, i) => (i < 144 ? 8 : i < 256 ? 9 : i < 280 ? 7 : 8)));
const FIXED_DISTANCES = buildHuffman(new Array<number>(30).fill(5));

/**
 * Undoes zlib compression, in plain JavaScript: what a PNG's image data is stored as.
 *
 * Every kind of deflate block is read (stored, fixed and dynamic codes) and the stream's own checksum
 * is checked at the end, so a damaged file is refused rather than turned into a plausible-looking
 * picture. It runs anywhere JavaScript does, because the native runtime has no decompression of its
 * own to lean on.
 *
 * @param data - A whole zlib stream: the two-byte header, the deflate blocks and the checksum.
 * @returns The bytes it held.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const inflate = (data: Uint8Array): Uint8Array => {
    if (data.length < 6) {
        throw new Error('[NacatamalOn] inflate: the data is too short to be a zlib stream.');
    }
    const cmf = data[0]!;
    const flg = data[1]!;
    if ((cmf & 0x0f) !== 8 || ((cmf << 8) | flg) % 31 !== 0) {
        throw new Error('[NacatamalOn] inflate: the data does not start with a zlib header.');
    }
    if ((flg & 0x20) !== 0) {
        throw new Error('[NacatamalOn] inflate: a preset dictionary is not supported.');
    }

    let at = 2;
    let bits = 0;
    let count = 0;
    const bit = (): number => {
        if (count === 0) {
            if (at >= data.length) {
                throw new Error('[NacatamalOn] inflate: the data ends in the middle of a block.');
            }
            bits = data[at++]!;
            count = 8;
        }
        const value = bits & 1;
        bits >>= 1;
        count--;
        return value;
    };
    const read = (n: number): number => {
        let value = 0;
        for (let i = 0; i < n; i++) {
            value |= bit() << i;
        }
        return value;
    };
    const decode = (code: THuffman): number => {
        // One bit at a time down the canonical code: compact, and fast enough for the size of
        // pictures a game paints with.
        let first = 0;
        let index = 0;
        let value = 0;
        for (let len = 1; len < 16; len++) {
            value |= bit();
            const n = code.counts[len]!;
            if (value - first < n) {
                return code.symbols[index + value - first]!;
            }
            index += n;
            first = (first + n) << 1;
            value <<= 1;
        }
        throw new Error('[NacatamalOn] inflate: a code in the data matches no symbol.');
    };

    let out = new Uint8Array(Math.max(1024, data.length * 4));
    let size = 0;
    const room = (extra: number): void => {
        if (size + extra <= out.length) {
            return;
        }
        let next = out.length * 2;
        while (next < size + extra) next *= 2;
        const grown = new Uint8Array(next);
        grown.set(out.subarray(0, size));
        out = grown;
    };

    let last = 0;
    while (last === 0) {
        last = bit();
        const type = read(2);
        if (type === 0) {
            // Stored: whole bytes from the next byte boundary, with the length written twice.
            count = 0;
            if (at + 4 > data.length) {
                throw new Error('[NacatamalOn] inflate: a stored block is cut short.');
            }
            const len = data[at]! | (data[at + 1]! << 8);
            const nlen = data[at + 2]! | (data[at + 3]! << 8);
            if ((len ^ 0xffff) !== nlen) {
                throw new Error('[NacatamalOn] inflate: a stored block has a damaged length.');
            }
            at += 4;
            if (at + len > data.length) {
                throw new Error('[NacatamalOn] inflate: a stored block is cut short.');
            }
            room(len);
            out.set(data.subarray(at, at + len), size);
            size += len;
            at += len;
            continue;
        }
        if (type === 3) {
            throw new Error('[NacatamalOn] inflate: the data has a block of a kind that does not exist.');
        }

        let literals = FIXED_LITERALS;
        let distances = FIXED_DISTANCES;
        if (type === 2) {
            const hlit = read(5) + 257;
            const hdist = read(5) + 1;
            const hclen = read(4) + 4;
            const lengthsOfLengths = new Uint8Array(19);
            for (let i = 0; i < hclen; i++) {
                lengthsOfLengths[CODE_LENGTH_ORDER[i]!] = read(3);
            }
            const lengthCode = buildHuffman(lengthsOfLengths);
            const lengths = new Uint8Array(hlit + hdist);
            for (let i = 0; i < hlit + hdist;) {
                const symbol = decode(lengthCode);
                if (symbol < 16) {
                    lengths[i++] = symbol;
                    continue;
                }
                let repeat = 0;
                let value = 0;
                if (symbol === 16) {
                    if (i === 0) throw new Error('[NacatamalOn] inflate: a length repeats before there is one.');
                    value = lengths[i - 1]!;
                    repeat = 3 + read(2);
                } else if (symbol === 17) {
                    repeat = 3 + read(3);
                } else {
                    repeat = 11 + read(7);
                }
                if (i + repeat > hlit + hdist) {
                    throw new Error('[NacatamalOn] inflate: the code lengths run past their count.');
                }
                lengths.fill(value, i, i + repeat);
                i += repeat;
            }
            literals = buildHuffman(lengths.subarray(0, hlit));
            distances = buildHuffman(lengths.subarray(hlit));
        }

        for (;;) {
            const symbol = decode(literals);
            if (symbol < 256) {
                room(1);
                out[size++] = symbol;
                continue;
            }
            if (symbol === 256) {
                break;
            }
            const lengthIndex = symbol - 257;
            if (lengthIndex >= LENGTH_BASE.length) {
                throw new Error('[NacatamalOn] inflate: a length code is out of range.');
            }
            const length = LENGTH_BASE[lengthIndex]! + read(LENGTH_EXTRA[lengthIndex]!);
            const distSymbol = decode(distances);
            if (distSymbol >= DIST_BASE.length) {
                throw new Error('[NacatamalOn] inflate: a distance code is out of range.');
            }
            const distance = DIST_BASE[distSymbol]! + read(DIST_EXTRA[distSymbol]!);
            if (distance > size) {
                throw new Error('[NacatamalOn] inflate: the data refers back to before its start.');
            }
            room(length);
            // Byte by byte, because a copy may overlap what it is copying (a run of one colour).
            for (let i = 0; i < length; i++) {
                out[size] = out[size - distance]!;
                size++;
            }
        }
    }

    // The checksum of what came out, after the last block on the next byte boundary.
    if (at + 4 > data.length) {
        throw new Error('[NacatamalOn] inflate: the data ends before its checksum.');
    }
    let a = 1;
    let b = 0;
    for (let i = 0; i < size; i++) {
        a = (a + out[i]!) % 65521;
        b = (b + a) % 65521;
    }
    const expected = ((data[at]! << 24) | (data[at + 1]! << 16) | (data[at + 2]! << 8) | data[at + 3]!) >>> 0;
    if ((((b << 16) | a) >>> 0) !== expected) {
        throw new Error('[NacatamalOn] inflate: the data is damaged: its checksum does not match.');
    }
    return out.slice(0, size);
};
