import { LENGTH_BASE, LENGTH_EXTRA, DIST_BASE, DIST_EXTRA } from './inflate';

/**
 * How far back a repeat may be found: the most the format allows.
 */
const WINDOW = 32768;

/**
 * The shortest and the longest repeat the format can say.
 */
const MIN_MATCH = 3;
const MAX_MATCH = 258;

/**
 * How many earlier places with the same three bytes are tried for each position. More finds longer
 * repeats and costs more time; past this the files hardly shrink.
 */
const CHAIN = 128;

/**
 * Bits to the bytes of a stream, the first bit into the lowest place of each byte, as deflate reads
 * them. Grows as it is written into.
 */
class BitWriter {
    bytes = new Uint8Array(1024);
    length = 0;
    private bits = 0;
    private count = 0;

    /**
     * `count` bits of `value`, the lowest first: how deflate writes everything but its codes.
     */
    write(value: number, count: number): void {
        this.bits |= value << this.count;
        this.count += count;
        while (this.count >= 8) {
            this.push(this.bits & 0xff);
            this.bits >>>= 8;
            this.count -= 8;
        }
    }

    /**
     * A prefix code, which deflate writes the other way round: its first bit first.
     */
    code(value: number, count: number): void {
        let reversed = 0;
        for (let i = 0; i < count; i++) {
            reversed = (reversed << 1) | ((value >>> i) & 1);
        }
        this.write(reversed, count);
    }

    /**
     * Whatever bits are left, filled out to a whole byte.
     */
    flush(): void {
        if (this.count > 0) {
            this.push(this.bits & 0xff);
            this.bits = 0;
            this.count = 0;
        }
    }

    /**
     * A whole byte, once the bits have been flushed.
     */
    byte(value: number): void {
        this.push(value);
    }

    private push(value: number): void {
        if (this.length === this.bytes.length) {
            const grown = new Uint8Array(this.bytes.length * 2);
            grown.set(this.bytes);
            this.bytes = grown;
        }
        this.bytes[this.length++] = value;
    }
}

/**
 * A literal byte or a length symbol in the format's fixed code: 0–143 eight bits, 144–255 nine,
 * 256–279 seven, 280–287 eight.
 */
const literal = (out: BitWriter, symbol: number): void => {
    if (symbol < 144) out.code(0x30 + symbol, 8);
    else if (symbol < 256) out.code(0x190 + symbol - 144, 9);
    else if (symbol < 280) out.code(symbol - 256, 7);
    else out.code(0xc0 + symbol - 280, 8);
};

/**
 * The symbol a table of bases gives a value: the last base it reaches.
 */
const symbolOf = (bases: readonly number[], value: number): number => {
    let at = 0;
    while (at + 1 < bases.length && bases[at + 1]! <= value) at++;
    return at;
};

/**
 * Bytes as a zlib stream: the header, one deflate block in the format's fixed code, and the checksum.
 *
 * Repeats are found by remembering, for every three bytes seen, where they were last seen and where
 * the same three were before that, and trying the most recent first: the usual way, and the one that
 * finds the long runs a picture of few colours is made of. The fixed code rather than one built for
 * each picture keeps it short; a picture of large flat areas is nearly all repeats, which the code
 * matters little to.
 *
 * Every byte written is read back by `inflate`, and by any other zlib reader.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const deflate = (data: Uint8Array): Uint8Array => {
    const out = new BitWriter();
    // Deflate, a 32 KB window, and a header whose number is a multiple of 31, as zlib checks.
    out.byte(0x78);
    out.byte(0x9c);
    // The last block, in the fixed code.
    out.write(1, 1);
    out.write(1, 2);

    // Where each three bytes were last seen, and for every position, where the same three were
    // before it, within the window.
    const head = new Int32Array(1 << 15).fill(-1);
    const previous = new Int32Array(WINDOW);
    const hashAt = (at: number): number =>
        ((data[at]! << 10) ^ (data[at + 1]! << 5) ^ data[at + 2]!) & 0x7fff;
    const remember = (at: number): void => {
        if (at + MIN_MATCH > data.length) return;
        const hash = hashAt(at);
        previous[at % WINDOW] = head[hash]!;
        head[hash] = at;
    };

    let at = 0;
    while (at < data.length) {
        let bestLength = 0;
        let bestDistance = 0;
        if (at + MIN_MATCH <= data.length) {
            const longest = Math.min(MAX_MATCH, data.length - at);
            let candidate = head[hashAt(at)]!;
            for (let tries = 0; tries < CHAIN && candidate >= 0 && at - candidate <= WINDOW; tries++) {
                if (data[candidate + bestLength] === data[at + bestLength]) {
                    let length = 0;
                    while (length < longest && data[candidate + length] === data[at + length]) length++;
                    if (length > bestLength) {
                        bestLength = length;
                        bestDistance = at - candidate;
                        if (length === longest) break;
                    }
                }
                const before = previous[candidate % WINDOW]!;
                // A place older than this one, or one written over since: the chain ends here.
                if (before >= candidate) break;
                candidate = before;
            }
        }

        if (bestLength >= MIN_MATCH) {
            const lengthSymbol = symbolOf(LENGTH_BASE, bestLength);
            literal(out, 257 + lengthSymbol);
            out.write(bestLength - LENGTH_BASE[lengthSymbol]!, LENGTH_EXTRA[lengthSymbol]!);
            const distanceSymbol = symbolOf(DIST_BASE, bestDistance);
            out.code(distanceSymbol, 5);
            out.write(bestDistance - DIST_BASE[distanceSymbol]!, DIST_EXTRA[distanceSymbol]!);
            for (let i = 0; i < bestLength; i++) remember(at + i);
            at += bestLength;
        } else {
            literal(out, data[at]!);
            remember(at);
            at++;
        }
    }
    literal(out, 256);
    out.flush();

    // The checksum of what was compressed, highest byte first.
    let a = 1;
    let b = 0;
    for (let i = 0; i < data.length; i++) {
        a = (a + data[i]!) % 65521;
        b = (b + a) % 65521;
    }
    const sum = ((b << 16) | a) >>> 0;
    out.byte(sum >>> 24);
    out.byte((sum >>> 16) & 0xff);
    out.byte((sum >>> 8) & 0xff);
    out.byte(sum & 0xff);
    return out.bytes.slice(0, out.length);
};
