import { crc32 } from './crc32';
import { inflate } from './inflate';
import { createPixels } from './create_pixels';
import type { TPixels } from './types/t_pixels';

const SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

/**
 * How many samples each pixel of a colour type carries: grey, -, RGB, palette index, grey + alpha, -,
 * RGBA.
 */
const CHANNELS: Record<number, number> = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 };

const fail = (reason: string): never => {
    throw new Error(`[NacatamalOn] decodePng: ${reason}`);
};

/**
 * Undoes the filter of one row in place, against the row above it (zeros for the first one).
 */
const unfilter = (filter: number, row: Uint8Array, above: Uint8Array, step: number): void => {
    switch (filter) {
        case 0:
            return;
        case 1:
            for (let i = step; i < row.length; i++) row[i] = (row[i]! + row[i - step]!) & 255;
            return;
        case 2:
            for (let i = 0; i < row.length; i++) row[i] = (row[i]! + above[i]!) & 255;
            return;
        case 3:
            for (let i = 0; i < row.length; i++) {
                const left = i >= step ? row[i - step]! : 0;
                row[i] = (row[i]! + ((left + above[i]!) >> 1)) & 255;
            }
            return;
        case 4:
            for (let i = 0; i < row.length; i++) {
                const a = i >= step ? row[i - step]! : 0;
                const b = above[i]!;
                const c = i >= step ? above[i - step]! : 0;
                const p = a + b - c;
                const pa = Math.abs(p - a);
                const pb = Math.abs(p - b);
                const pc = Math.abs(p - c);
                row[i] = (row[i]! + (pa <= pb && pa <= pc ? a : pb <= pc ? b : c)) & 255;
            }
            return;
        default:
            fail(`a row uses filter ${filter}, which does not exist.`);
    }
};

/**
 * Reads a PNG file into a picture, in plain JavaScript: no page, no canvas, no library. What
 * `useLoadPixels` decodes a file with, and what a build script or a tool can use on its own.
 *
 * It reads what image editors save: greyscale, RGB, palette and their alpha versions, at 1, 2, 4, 8 or
 * 16 bits (16 is kept to its top 8), with palette transparency. Interlaced files are refused with a
 * message, since pixel art is almost never saved that way; and so is a file whose checks do not
 * match, rather than turned into a plausible picture.
 *
 * @param bytes - The whole file.
 * @returns The picture, RGBA, row `0` at the top.
 *
 * @example
 * ```ts
 * import { readFileSync } from 'node:fs';
 * import { decodePng } from 'nacatamalon/authoring';
 *
 * const hero = decodePng(readFileSync('public/hero.png'));
 * ```
 *
 * @category Pixels
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const decodePng = (bytes: Uint8Array): TPixels => {
    if (bytes.length < 8 || SIGNATURE.some((value, i) => bytes[i] !== value)) {
        fail('the data is not a PNG file.');
    }
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

    let width = 0;
    let height = 0;
    let depth = 0;
    let colorType = -1;
    let palette: Uint8Array | null = null;
    let transparency: Uint8Array | null = null;
    const parts: Uint8Array[] = [];

    let at = 8;
    let ended = false;
    while (at + 12 <= bytes.length && !ended) {
        const length = view.getUint32(at);
        const type = String.fromCharCode(bytes[at + 4]!, bytes[at + 5]!, bytes[at + 6]!, bytes[at + 7]!);
        const start = at + 8;
        const end = start + length;
        if (end + 4 > bytes.length) {
            fail(`the '${type}' chunk is cut short.`);
        }
        if (crc32(bytes, at + 4, end) !== view.getUint32(end)) {
            fail(`the '${type}' chunk is damaged: its check does not match.`);
        }
        const body = bytes.subarray(start, end);
        switch (type) {
            case 'IHDR':
                width = view.getUint32(start);
                height = view.getUint32(start + 4);
                depth = body[8]!;
                colorType = body[9]!;
                if (body[10] !== 0 || body[11] !== 0) {
                    fail('it uses a compression or filter method that does not exist.');
                }
                if (body[12] !== 0) {
                    fail('it is interlaced, which is not supported. Save it again without interlacing.');
                }
                break;
            case 'PLTE':
                palette = body;
                break;
            case 'tRNS':
                transparency = body;
                break;
            case 'IDAT':
                parts.push(body);
                break;
            case 'IEND':
                ended = true;
                break;
        }
        at = end + 4;
    }

    const channels = CHANNELS[colorType];
    if (width === 0 || height === 0 || channels === undefined) {
        fail('it has no valid header.');
    }
    if (![1, 2, 4, 8, 16].includes(depth) || (depth < 8 && colorType !== 0 && colorType !== 3) || (depth === 16 && colorType === 3)) {
        fail(`a bit depth of ${depth} does not go with colour type ${colorType}.`);
    }
    if (colorType === 3 && palette === null) {
        fail('it uses a palette and has none.');
    }

    let joined = 0;
    for (const part of parts) joined += part.length;
    const compressed = new Uint8Array(joined);
    joined = 0;
    for (const part of parts) {
        compressed.set(part, joined);
        joined += part.length;
    }
    const raw = inflate(compressed);

    const bitsPerPixel = channels! * depth;
    const stride = Math.ceil((width * bitsPerPixel) / 8);
    const step = Math.max(1, bitsPerPixel >> 3);
    if (raw.length < (stride + 1) * height) {
        fail('its image data is shorter than its size says.');
    }

    const pixels = createPixels(width, height);
    const out = pixels.data;
    const maxSample = (1 << Math.min(depth, 8)) - 1;
    let above = new Uint8Array(stride);

    // A transparent colour, for the types that keep one in tRNS rather than an alpha channel.
    const keyed = transparency !== null && (colorType === 0 || colorType === 2)
        ? Array.from({ length: colorType === 0 ? 1 : 3 }, (_, i) => (transparency![i * 2]! << 8) | transparency![i * 2 + 1]!)
        : null;

    for (let y = 0; y < height; y++) {
        const offset = y * (stride + 1);
        const row = raw.slice(offset + 1, offset + 1 + stride);
        unfilter(raw[offset]!, row, above, step);
        above = row;

        // One sample at its own depth, as stored: for keying against tRNS.
        const sample = (index: number): number => {
            if (depth === 8) return row[index]!;
            if (depth === 16) return (row[index * 2]! << 8) | row[index * 2 + 1]!;
            const bitAt = index * depth;
            return (row[bitAt >> 3]! >> (8 - depth - (bitAt & 7))) & maxSample;
        };
        // The same sample as a byte.
        const byte = (index: number): number => {
            if (depth === 16) return row[index * 2]!;
            const value = sample(index);
            return depth === 8 ? value : Math.round((value * 255) / maxSample);
        };

        for (let x = 0; x < width; x++) {
            const to = (y * width + x) * 4;
            const first = x * channels!;
            switch (colorType) {
                case 0: {
                    const grey = byte(first);
                    out[to] = out[to + 1] = out[to + 2] = grey;
                    out[to + 3] = keyed !== null && sample(first) === keyed[0] ? 0 : 255;
                    break;
                }
                case 2:
                    out[to] = byte(first);
                    out[to + 1] = byte(first + 1);
                    out[to + 2] = byte(first + 2);
                    out[to + 3] = keyed !== null && sample(first) === keyed[0] && sample(first + 1) === keyed[1] && sample(first + 2) === keyed[2] ? 0 : 255;
                    break;
                case 3: {
                    const index = sample(first);
                    if (index * 3 + 2 >= palette!.length) {
                        fail(`a pixel uses colour ${index} of a palette of ${palette!.length / 3}.`);
                    }
                    out[to] = palette![index * 3]!;
                    out[to + 1] = palette![index * 3 + 1]!;
                    out[to + 2] = palette![index * 3 + 2]!;
                    out[to + 3] = transparency !== null && index < transparency.length ? transparency[index]! : 255;
                    break;
                }
                case 4:
                    out[to] = out[to + 1] = out[to + 2] = byte(first);
                    out[to + 3] = byte(first + 1);
                    break;
                default:
                    out[to] = byte(first);
                    out[to + 1] = byte(first + 1);
                    out[to + 2] = byte(first + 2);
                    out[to + 3] = byte(first + 3);
            }
        }
    }
    return pixels;
};
