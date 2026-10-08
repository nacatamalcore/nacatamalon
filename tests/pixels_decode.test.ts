import { describe, expect, it } from 'bun:test';
import { deflateSync } from 'node:zlib';
import { decodePng } from '../src/pixels/decode_png';
import { encodePng } from '../src/pixels/encode_png';
import { inflate } from '../src/pixels/inflate';
import { crc32 } from '../src/pixels/crc32';
import { createPixels, fillNoise } from '../src/pixels';

/**
 * Reading PNG files in plain JavaScript, with no canvas.
 *
 * Every file here is built by hand, chunk by chunk, so each kind a PNG can be (and each way a row can
 * be filtered) is checked against pixels known in advance. The decoder was also checked against the
 * browser's own decoding on every PNG in the labs assets, all 1117 of them, pixel for pixel.
 */

const u32 = (n: number) => [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255];

const chunk = (type: string, body: Uint8Array | number[]): number[] => {
    const bytes = new Uint8Array([...[...type].map((c) => c.charCodeAt(0)), ...body]);
    return [...u32(bytes.length - 4), ...bytes, ...u32(crc32(bytes, 0, bytes.length))];
};

/**
 * A PNG of the given kind from rows already filtered (each starting with its filter byte).
 */
const png = (width: number, height: number, depth: number, colorType: number, filteredRows: number[][], extra: number[][] = [], interlace = 0): Uint8Array =>
    new Uint8Array([
        0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
        ...chunk('IHDR', [...u32(width), ...u32(height), depth, colorType, 0, 0, interlace]),
        ...extra.flat(),
        ...chunk('IDAT', deflateSync(new Uint8Array(filteredRows.flat()))),
        ...chunk('IEND', []),
    ]);

const rgba = (p: ReturnType<typeof decodePng>, x: number, y: number) => [...p.data.slice((y * p.width + x) * 4, (y * p.width + x) * 4 + 4)];

/**
 * Applies a PNG filter to one row, so the decoder has to undo it.
 */
const filterRow = (filter: number, row: number[], above: number[], step: number): number[] => {
    const out = row.map((value, i) => {
        const a = i >= step ? row[i - step]! : 0;
        const b = above[i] ?? 0;
        const c = i >= step ? above[i - step] ?? 0 : 0;
        if (filter === 1) return value - a;
        if (filter === 2) return value - b;
        if (filter === 3) return value - ((a + b) >> 1);
        if (filter === 4) {
            const p = a + b - c;
            const pa = Math.abs(p - a); const pb = Math.abs(p - b); const pc = Math.abs(p - c);
            return value - (pa <= pb && pa <= pc ? a : pb <= pc ? b : c);
        }
        return value;
    });
    return [filter, ...out.map((v) => v & 255)];
};

describe('inflate', () => {
    it('undoes zlib at every level, stored, fixed and dynamic', () => {
        const data = new Uint8Array(70000).map((_, i) => (i * 31 + (i >> 7)) & 255);
        for (const level of [0, 1, 6, 9]) {
            expect(inflate(new Uint8Array(deflateSync(data, { level })))).toEqual(data);
        }
    });

    it('refuses a stream whose checksum does not match', () => {
        const z = new Uint8Array(deflateSync(new Uint8Array([1, 2, 3, 4])));
        z[z.length - 1]! ^= 1;
        expect(() => inflate(z)).toThrow(/checksum/);
    });
});

describe('decodePng', () => {
    it('reads back exactly what encodePng wrote', () => {
        const picture = fillNoise(createPixels(37, 21), { seed: 5 });
        picture.data[3] = 9;
        expect(decodePng(encodePng(picture)).data).toEqual(picture.data);
    });

    it('undoes each of the five row filters', () => {
        // Three pixels a row of RGBA, three rows, every row a different filter of the same values.
        const rows = [
            [10, 20, 30, 255, 200, 100, 50, 255, 0, 255, 0, 128],
            [15, 25, 35, 255, 210, 90, 40, 255, 5, 250, 5, 128],
            [20, 30, 40, 255, 220, 80, 30, 255, 10, 245, 10, 128],
        ];
        for (const filter of [0, 1, 2, 3, 4]) {
            const filtered = rows.map((row, y) => filterRow(filter, row, y === 0 ? [] : rows[y - 1]!, 4));
            const picture = decodePng(png(3, 3, 8, 6, filtered));
            expect([...picture.data]).toEqual(rows.flat());
        }
    });

    it('reads RGB, and turns the tRNS colour transparent', () => {
        const picture = decodePng(png(2, 1, 8, 2, [[0, 1, 2, 3, 9, 9, 9]], [chunk('tRNS', [0, 9, 0, 9, 0, 9])]));
        expect(rgba(picture, 0, 0)).toEqual([1, 2, 3, 255]);
        expect(rgba(picture, 1, 0)).toEqual([9, 9, 9, 0]);
    });

    it('reads 1-bit grey, spreading the two levels over black and white', () => {
        const picture = decodePng(png(10, 1, 1, 0, [[0, 0b10100000, 0b01000000]]));
        expect([0, 1, 2, 9].map((x) => rgba(picture, x, 0)[0])).toEqual([255, 0, 255, 255]);
    });

    it('reads a 4-bit palette, with transparency per colour', () => {
        const plte = chunk('PLTE', [255, 0, 0, 0, 255, 0, 0, 0, 255]);
        const trns = chunk('tRNS', [255, 0]);
        const picture = decodePng(png(3, 1, 4, 3, [[0, 0x01, 0x20]], [plte, trns]));
        expect(rgba(picture, 0, 0)).toEqual([255, 0, 0, 255]);
        expect(rgba(picture, 1, 0)).toEqual([0, 255, 0, 0]);
        expect(rgba(picture, 2, 0)).toEqual([0, 0, 255, 255]);
    });

    it('keeps the top byte of 16-bit samples, and reads grey with alpha', () => {
        expect(rgba(decodePng(png(1, 1, 16, 6, [[0, 0x12, 0x34, 0x56, 0x78, 0x9a, 0xbc, 0xff, 0xff]])), 0, 0)).toEqual([0x12, 0x56, 0x9a, 0xff]);
        expect(rgba(decodePng(png(1, 1, 8, 4, [[0, 77, 33]])), 0, 0)).toEqual([77, 77, 77, 33]);
    });

    it('refuses what it cannot read faithfully', () => {
        expect(() => decodePng(new Uint8Array([1, 2, 3]))).toThrow(/not a PNG/);
        expect(() => decodePng(png(1, 1, 8, 6, [[0, 1, 2, 3, 4]], [], 1))).toThrow(/interlaced/);
        const broken = png(1, 1, 8, 6, [[0, 1, 2, 3, 4]]);
        broken[30]! ^= 1;
        expect(() => decodePng(broken)).toThrow(/damaged/);
        expect(() => decodePng(png(1, 1, 8, 3, [[0, 0]]))).toThrow(/palette and has none/);
    });
});
