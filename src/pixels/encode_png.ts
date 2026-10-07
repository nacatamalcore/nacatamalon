import type { TPixels } from './types/t_pixels';

/**
 * The table the CRC of every PNG chunk is worked out with, made once.
 */
const CRC_TABLE = (() => {
    const table = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
        let c = n;
        for (let k = 0; k < 8; k++) {
            c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
        }
        table[n] = c >>> 0;
    }
    return table;
})();

const crc32 = (bytes: Uint8Array, start: number, end: number): number => {
    let c = 0xffffffff;
    for (let i = start; i < end; i++) {
        c = CRC_TABLE[(c ^ bytes[i]!) & 0xff]! ^ (c >>> 8);
    }
    return (c ^ 0xffffffff) >>> 0;
};

/**
 * Writes a picture as a PNG file, in plain JavaScript: no page, no canvas, no library. A build script
 * or a tool can paint with the `pixels` functions and save what it made, on any runtime.
 *
 * The file is **valid but not compressed**: the image data is stored as it is, which a PNG is allowed
 * to do. Every program reads it; it is only bigger than one an image editor would save, which for the
 * small pictures of pixel art rarely matters.
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
    const { width, height, data } = pixels;
    const row = width * 4 + 1;
    const raw = row * height;

    // The image data as a zlib stream of stored blocks: a two-byte header, blocks of at most 65535
    // bytes each with their length written twice (once inverted), and a checksum of the raw data.
    const blocks = Math.max(1, Math.ceil(raw / 65535));
    const zlibLength = 2 + blocks * 5 + raw + 4;
    const length = 8 + (12 + 13) + (12 + zlibLength) + 12;
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
    chunk('IDAT', zlibLength, () => {
        bytes(0x78, 0x01);
        let a = 1;
        let b = 0;
        let written = 0;
        let rowAt = 0;
        for (let block = 0; block < blocks; block++) {
            const size = Math.min(65535, raw - written);
            bytes(block === blocks - 1 ? 1 : 0, size & 0xff, size >>> 8, ~size & 0xff, (~size >>> 8) & 0xff);
            for (let i = 0; i < size; i++) {
                // Each row of the image starts with a filter byte; `0` is "none".
                const column = (written + i) % row;
                const value = column === 0 ? 0 : data[rowAt + column - 1]!;
                if (column === row - 1) rowAt += width * 4;
                out[at++] = value;
                a = (a + value) % 65521;
                b = (b + a) % 65521;
            }
            written += size;
        }
        u32(((b << 16) | a) >>> 0);
    });
    chunk('IEND', 0, () => {});
    return out;
};
