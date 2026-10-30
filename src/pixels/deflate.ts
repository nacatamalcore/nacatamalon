import { CODE_LENGTH_ORDER, DIST_BASE, DIST_EXTRA, LENGTH_BASE, LENGTH_EXTRA } from './inflate';

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
 * How many symbols a block holds before the next one starts with a code of its own: small enough
 * for each part of a picture to get the code that suits it, big enough for the code to pay for
 * itself.
 */
const BLOCK_SYMBOLS = 1 << 15;

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
 * How long each symbol's code is in the format's fixed code: literals 0–143 eight bits, 144–255
 * nine, 256–279 seven, 280–287 eight; every distance five.
 */
const FIXED_LITERAL_LENGTHS = Uint8Array.from({ length: 288 }, (_, i) => (i < 144 ? 8 : i < 256 ? 9 : i < 280 ? 7 : 8));
const FIXED_DISTANCE_LENGTHS = new Uint8Array(30).fill(5);

/**
 * The codes of a canonical prefix code, from how long each one is: the shortest first, and among
 * the same length in the order of the symbols, which is all a reader needs to rebuild them.
 */
const codesOf = (lengths: Uint8Array): Uint16Array => {
    const count = new Uint16Array(16);
    for (const length of lengths) count[length]!++;
    count[0] = 0;
    const next = new Uint16Array(16);
    let code = 0;
    for (let bits = 1; bits < 16; bits++) {
        code = (code + count[bits - 1]!) << 1;
        next[bits] = code;
    }
    const codes = new Uint16Array(lengths.length);
    for (let symbol = 0; symbol < lengths.length; symbol++) {
        const length = lengths[symbol]!;
        if (length !== 0) codes[symbol] = next[length]!++;
    }
    return codes;
};

/**
 * How long each symbol's code should be, the more frequent the shorter (Huffman's), none longer
 * than `limit`. Past the limit the counts are halved, which flattens the tree, until it fits.
 *
 * A code needs two symbols at least for every reader to accept it, so one used alone is given a
 * partner that is never written.
 */
const lengthsOf = (frequencies: Uint32Array, limit: number): Uint8Array => {
    const lengths = new Uint8Array(frequencies.length);
    const used: number[] = [];
    for (let symbol = 0; symbol < frequencies.length; symbol++) {
        if (frequencies[symbol]! > 0) used.push(symbol);
    }
    if (used.length === 0) {
        lengths[0] = 1;
        lengths[1] = 1;
        return lengths;
    }
    if (used.length === 1) {
        lengths[used[0]!] = 1;
        lengths[used[0] === 0 ? 1 : 0] = 1;
        return lengths;
    }
    let weights = used.map((symbol) => frequencies[symbol]!);
    for (;;) {
        // The two lightest put together, again and again, kept in two queues that stay sorted: the
        // leaves, sorted once, and the joins, which come out in order.
        const order = used.map((_, i) => i).sort((a, b) => weights[a]! - weights[b]!);
        const parent = new Int32Array(used.length * 2).fill(-1);
        const joined: number[] = [];
        let leaf = 0;
        let join = 0;
        const lightest = (): number => {
            const leafWeight = leaf < order.length ? weights[order[leaf]!]! : Infinity;
            const joinWeight = join < joined.length ? joined[join]! : Infinity;
            return leafWeight <= joinWeight ? order[leaf++]! : used.length + join++;
        };
        const weightOf = (node: number): number => (node < used.length ? weights[node]! : joined[node - used.length]!);
        for (let made = 0; made < used.length - 1; made++) {
            const a = lightest();
            const b = lightest();
            const node = used.length + joined.length;
            joined.push(weightOf(a) + weightOf(b));
            parent[a] = node;
            parent[b] = node;
        }
        let longest = 0;
        const depth = new Int32Array(used.length * 2);
        for (let node = used.length * 2 - 3; node >= 0; node--) {
            depth[node] = depth[parent[node]!]! + 1;
        }
        for (let i = 0; i < used.length; i++) longest = Math.max(longest, depth[i]!);
        if (longest <= limit) {
            for (let i = 0; i < used.length; i++) lengths[used[i]!] = depth[i]!;
            return lengths;
        }
        weights = weights.map((weight) => (weight + 1) >> 1);
    }
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
 * The lengths of a code as deflate writes them down: runs of the same length said once with how
 * many times (16 repeats the last length 3–6 times, 17 a zero 3–10 times, 18 a zero 11–138 times).
 * Each symbol, and the number of extra bits after it in `extras`, as `[value, bits]`.
 */
const runsOf = (lengths: ArrayLike<number>): { symbols: number[]; extras: Array<[number, number]> } => {
    const symbols: number[] = [];
    const extras: Array<[number, number]> = [];
    const say = (symbol: number, extra: number = 0, bits: number = 0): void => {
        symbols.push(symbol);
        extras.push([extra, bits]);
    };
    let at = 0;
    while (at < lengths.length) {
        const value = lengths[at]!;
        let run = 1;
        while (at + run < lengths.length && lengths[at + run] === value) run++;
        at += run;
        if (value === 0) {
            while (run >= 11) {
                const taken = Math.min(run, 138);
                say(18, taken - 11, 7);
                run -= taken;
            }
            if (run >= 3) {
                say(17, run - 3, 3);
                run = 0;
            }
            for (; run > 0; run--) say(0);
        } else {
            say(value);
            run--;
            while (run >= 3) {
                const taken = Math.min(run, 6);
                say(16, taken - 3, 2);
                run -= taken;
            }
            for (; run > 0; run--) say(value);
        }
    }
    return { symbols, extras };
};

const FIXED_LITERAL_CODES = codesOf(FIXED_LITERAL_LENGTHS);
const FIXED_DISTANCE_CODES = codesOf(FIXED_DISTANCE_LENGTHS);

/**
 * Bytes as a zlib stream: the header, the deflate blocks, and the checksum.
 *
 * Repeats are found first, by remembering for every three bytes seen where they were last seen and
 * where the same three were before that, and trying the most recent first: the usual way, and the
 * one that finds the long runs a picture of few colours is made of.
 *
 * Then they are written in blocks, each in whichever code makes it shorter: the format's fixed one,
 * or one built for that block from how often each byte, length and distance comes up in it, written
 * down at the start of the block. A tiny picture is not made bigger by a code it cannot pay for.
 *
 * Every byte written is read back by `inflate`, and by any other zlib reader.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const deflate = (data: Uint8Array): Uint8Array => {
    // What is said, in order: a byte as it is (`lengths` 0, the byte in `values`), or a repeat of
    // `lengths` bytes from `values` back.
    const lengths = new Uint16Array(data.length);
    const values = new Uint16Array(data.length);
    let said = 0;

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
            lengths[said] = bestLength;
            values[said++] = bestDistance;
            for (let i = 0; i < bestLength; i++) remember(at + i);
            at += bestLength;
        } else {
            lengths[said] = 0;
            values[said++] = data[at]!;
            remember(at);
            at++;
        }
    }

    const out = new BitWriter();
    // Deflate, a 32 KB window, and a header whose number is a multiple of 31, as zlib checks.
    out.byte(0x78);
    out.byte(0x9c);
    let from = 0;
    do {
        const to = Math.min(said, from + BLOCK_SYMBOLS);
        writeBlock(out, lengths, values, from, to, to === said);
        from = to;
    } while (from < said);
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

/**
 * One block: what was said from `from` to `to`, in the shorter of the two codes, and its end.
 */
const writeBlock = (out: BitWriter, lengths: Uint16Array, values: Uint16Array, from: number, to: number, last: boolean): void => {
    // How often each symbol comes up, the end of the block included, and the extra bits that are
    // written whichever code is chosen.
    const literalCounts = new Uint32Array(286);
    const distanceCounts = new Uint32Array(30);
    for (let i = from; i < to; i++) {
        if (lengths[i] === 0) {
            literalCounts[values[i]!]!++;
        } else {
            literalCounts[257 + symbolOf(LENGTH_BASE, lengths[i]!)]!++;
            distanceCounts[symbolOf(DIST_BASE, values[i]!)]!++;
        }
    }
    literalCounts[256]!++;

    // The code built for this block, and how its lengths are written down.
    const literalLengths = lengthsOf(literalCounts, 15);
    const distanceLengths = lengthsOf(distanceCounts, 15);
    let literalsKept = 286;
    while (literalsKept > 257 && literalLengths[literalsKept - 1] === 0) literalsKept--;
    let distancesKept = 30;
    while (distancesKept > 1 && distanceLengths[distancesKept - 1] === 0) distancesKept--;
    const runs = runsOf([...literalLengths.subarray(0, literalsKept), ...distanceLengths.subarray(0, distancesKept)]);
    const runCounts = new Uint32Array(19);
    for (const symbol of runs.symbols) runCounts[symbol]!++;
    const runLengths = lengthsOf(runCounts, 7);
    let runsKept = 19;
    while (runsKept > 4 && runLengths[CODE_LENGTH_ORDER[runsKept - 1]!] === 0) runsKept--;

    // What each code costs in bits, the extra bits left out since both pay them.
    let fixedCost = 0;
    let builtCost = 5 + 5 + 4 + runsKept * 3;
    for (let symbol = 0; symbol < 286; symbol++) {
        fixedCost += literalCounts[symbol]! * FIXED_LITERAL_LENGTHS[symbol]!;
        builtCost += literalCounts[symbol]! * literalLengths[symbol]!;
    }
    for (let symbol = 0; symbol < 30; symbol++) {
        fixedCost += distanceCounts[symbol]! * FIXED_DISTANCE_LENGTHS[symbol]!;
        builtCost += distanceCounts[symbol]! * distanceLengths[symbol]!;
    }
    for (let i = 0; i < runs.symbols.length; i++) builtCost += runLengths[runs.symbols[i]!]! + runs.extras[i]![1];

    const built = builtCost < fixedCost;
    out.write(last ? 1 : 0, 1);
    out.write(built ? 2 : 1, 2);

    let literalCodes = FIXED_LITERAL_CODES;
    let literalBits: Uint8Array = FIXED_LITERAL_LENGTHS;
    let distanceCodes = FIXED_DISTANCE_CODES;
    let distanceBits: Uint8Array = FIXED_DISTANCE_LENGTHS;
    if (built) {
        literalCodes = codesOf(literalLengths);
        literalBits = literalLengths;
        distanceCodes = codesOf(distanceLengths);
        distanceBits = distanceLengths;
        const runCodes = codesOf(runLengths);
        out.write(literalsKept - 257, 5);
        out.write(distancesKept - 1, 5);
        out.write(runsKept - 4, 4);
        for (let i = 0; i < runsKept; i++) out.write(runLengths[CODE_LENGTH_ORDER[i]!]!, 3);
        for (let i = 0; i < runs.symbols.length; i++) {
            const symbol = runs.symbols[i]!;
            out.code(runCodes[symbol]!, runLengths[symbol]!);
            const [extra, bits] = runs.extras[i]!;
            if (bits > 0) out.write(extra, bits);
        }
    }

    for (let i = from; i < to; i++) {
        if (lengths[i] === 0) {
            const byte = values[i]!;
            out.code(literalCodes[byte]!, literalBits[byte]!);
            continue;
        }
        const length = lengths[i]!;
        const lengthSymbol = symbolOf(LENGTH_BASE, length);
        out.code(literalCodes[257 + lengthSymbol]!, literalBits[257 + lengthSymbol]!);
        out.write(length - LENGTH_BASE[lengthSymbol]!, LENGTH_EXTRA[lengthSymbol]!);
        const distance = values[i]!;
        const distanceSymbol = symbolOf(DIST_BASE, distance);
        out.code(distanceCodes[distanceSymbol]!, distanceBits[distanceSymbol]!);
        out.write(distance - DIST_BASE[distanceSymbol]!, DIST_EXTRA[distanceSymbol]!);
    }
    out.code(literalCodes[256]!, literalBits[256]!);
};
