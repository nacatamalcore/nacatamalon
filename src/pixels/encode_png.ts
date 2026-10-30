import { crc32 } from './crc32';
import { deflate } from './deflate';
import type { TPixels } from './types/t_pixels';

/**
 * Each row of the picture behind the filter that leaves it smallest, one byte naming the filter first.
 *
 * A filter writes each byte as its difference from a neighbour (the pixel to the left, the one
 * above, both, or a guess from the three), which turns a smooth gradient or a flat area into runs of
 * small and repeated numbers that compress far better than the colours themselves. Which one a row
 * takes is the usual rule: the one whose bytes, read as signed, add up to least.
 */
const filtered = (pixels: TPixels): Uint8Array => {
    const { width, height, data } = pixels;
    const stride = width * 4;
    const out = new Uint8Array((stride + 1) * height);
    const trial = new Uint8Array(stride);
    const best = new Uint8Array(stride);
    for (let y = 0; y < height; y++) {
        const row = y * stride;
        const above = row - stride;
        let bestFilter = 0;
        let bestCost = Infinity;
        for (let filter = 0; filter < 5; filter++) {
            let cost = 0;
            for (let x = 0; x < stride; x++) {
                const value = data[row + x]!;
                const left = x >= 4 ? data[row + x - 4]! : 0;
                const up = y > 0 ? data[above + x]! : 0;
                const corner = y > 0 && x >= 4 ? data[above + x - 4]! : 0;
                let guess = 0;
                if (filter === 1) guess = left;
                else if (filter === 2) guess = up;
                else if (filter === 3) guess = (left + up) >>> 1;
                else if (filter === 4) {
                    const p = left + up - corner;
                    const pa = Math.abs(p - left);
                    const pb = Math.abs(p - up);
                    const pc = Math.abs(p - corner);
                    guess = pa <= pb && pa <= pc ? left : pb <= pc ? up : corner;
                }
                const written = (value - guess) & 0xff;
                trial[x] = written;
                cost += written < 128 ? written : 256 - written;
                if (cost >= bestCost) break;
            }
            if (cost < bestCost) {
                bestCost = cost;
                bestFilter = filter;
                best.set(trial);
            }
        }
        out[y * (stride + 1)] = bestFilter;
        out.set(best, y * (stride + 1) + 1);
    }
    return out;
};

/**
 * Writes a picture as a PNG file, in plain JavaScript: no page, no canvas, no library. A build script
 * or a tool can paint with the `pixels` functions and save what it made, on any runtime.
 *
 * The file is compressed, as an image editor would save it: each row behind the filter that suits it,
 * and the whole squeezed with deflate. Nothing is lost by it: every pixel reads back exactly as it was
 * written, which is what PNG is. Done at once, with nothing to wait for.
 *
 * @param pixels - The picture, from `createPixels`.
 * @returns The bytes of the file.
 *
 * @example
 * ```ts
 * import { writeFileSync } from 'node:fs';
 * import { createPixels, fillGradient, getColor } from 'nacatamalon';
 * import { encodePng } from 'nacatamalon/authoring';
 *
 * const sky = fillGradient(createPixels(320, 120), { from: getColor('#140a33'), to: getColor('#ffb36b'), bands: 10 });
 * writeFileSync('public/images/sky.png', encodePng(sky));
 * ```
 *
 * @category Pixels
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const encodePng = (pixels: TPixels): Uint8Array => {
    const { width, height } = pixels;
    const compressed = deflate(filtered(pixels));
    const length = 8 + (12 + 13) + (12 + compressed.length) + 12;
    const out = new Uint8Array(length);
    const view = new DataView(out.buffer);
    let at = 0;

    const bytes = (...values: number[]): void => {
        for (const value of values) out[at++] = value;
    };
    const u32 = (value: number): void => {
        view.setUint32(at, value >>> 0);
        at += 4;
    };
    const chunk = (type: string, size: number, body: () => void): void => {
        u32(size);
        const start = at;
        bytes(...[...type].map((c) => c.charCodeAt(0)));
        body();
        u32(crc32(out, start, at));
    };

    bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a);
    // Eight bits a channel, red green blue and alpha, no interlacing.
    chunk('IHDR', 13, () => {
        u32(width);
        u32(height);
        bytes(8, 6, 0, 0, 0);
    });
    chunk('IDAT', compressed.length, () => {
        out.set(compressed, at);
        at += compressed.length;
    });
    chunk('IEND', 0, () => {});
    return out;
};
