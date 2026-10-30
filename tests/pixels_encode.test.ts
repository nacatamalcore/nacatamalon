import { describe, expect, it } from 'bun:test';
import { inflateSync } from 'node:zlib';
import { createPixels } from '../src/pixels/create_pixels';
import { encodePng } from '../src/pixels/encode_png';
import { decodePng } from '../src/pixels/decode_png';
import { deflate } from '../src/pixels/deflate';
import { inflate } from '../src/pixels/inflate';
import type { TPixels } from '../src/pixels/types/t_pixels';

/**
 * A PNG written compressed: every pixel has to come back exactly as it went in, read by this
 * engine's own reader and by another one, and the file has to be the smaller for it.
 */

/**
 * The same numbers every run, so a failure can be run again.
 */
const random = (seed: number) => () => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    return seed / 0x7fffffff;
};

const picture = (width: number, height: number, paint: (x: number, y: number) => [number, number, number, number]): TPixels => {
    const pixels = createPixels(width, height);
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            pixels.data.set(paint(x, y), (y * width + x) * 4);
        }
    }
    return pixels;
};

const next = random(7);
const PICTURES: Record<string, TPixels> = {
    'pixel art of four colours': picture(64, 48, (x, y) => [[0, 0, 0, 0], [20, 12, 28, 255], [255, 200, 40, 255], [90, 160, 255, 255]][((x >> 3) + (y >> 2)) % 4]! as [number, number, number, number]),
    'a gradient': picture(320, 180, (x, y) => [x * 255 / 319, y * 255 / 179, 128, 255]),
    'noise': picture(97, 61, () => [next() * 256, next() * 256, next() * 256, next() * 256]),
    'see-through edges': picture(40, 40, (x, y) => [200, 50, 50, Math.max(0, 255 - Math.hypot(x - 20, y - 20) * 12)]),
    'one pixel': picture(1, 1, () => [1, 2, 3, 4]),
    'one row': picture(500, 1, (x) => [x & 255, 0, x >> 1 & 255, 255]),
    'one column': picture(1, 300, (_, y) => [0, y & 255, 0, 255]),
    'empty': createPixels(33, 17),
};

/**
 * The compressed image data of a PNG: the bytes of its IDAT chunk.
 */
const imageData = (png: Uint8Array): Uint8Array => {
    const view = new DataView(png.buffer, png.byteOffset);
    let at = 8;
    while (at < png.length) {
        const size = view.getUint32(at);
        const type = String.fromCharCode(...png.subarray(at + 4, at + 8));
        if (type === 'IDAT') return png.subarray(at + 8, at + 8 + size);
        at += 12 + size;
    }
    throw new Error('no IDAT');
};

describe('encodePng, compressed', () => {
    for (const [name, pixels] of Object.entries(PICTURES)) {
        it(`gives back every pixel of ${name} exactly`, () => {
            const back = decodePng(encodePng(pixels));
            expect(back.width).toBe(pixels.width);
            expect(back.height).toBe(pixels.height);
            expect(back.data).toEqual(pixels.data);
        });

        it(`writes ${name} so another zlib reader reads it too`, () => {
            const raw = inflateSync(imageData(encodePng(pixels)));
            // A filter byte and four bytes a pixel, each row.
            expect(raw.length).toBe((pixels.width * 4 + 1) * pixels.height);
        });
    }

    it('makes a picture of flat areas and smooth gradients a small part of what it was', () => {
        const stored = (p: TPixels): number => (p.width * 4 + 1) * p.height;
        const art = PICTURES['pixel art of four colours']!;
        const gradient = PICTURES['a gradient']!;
        expect(encodePng(art).length).toBeLessThan(stored(art) / 10);
        expect(encodePng(gradient).length).toBeLessThan(stored(gradient) / 10);
        expect(encodePng(PICTURES.empty!).length).toBeLessThan(200);
    });
});

describe('deflate', () => {
    it('says repeats as far back and as long as the format allows, and reads back the same', () => {
        const noise = random(3);
        const block = Uint8Array.from({ length: 32768 }, () => noise() * 256);
        // The same 32 KB twice: the second is one long repeat, exactly the window away, said in
        // pieces of 258. Then one byte more than the window back, which must not be reached.
        const data = new Uint8Array(32768 * 2 + 1000);
        data.set(block, 0);
        data.set(block, 32768);
        data.set(block.subarray(0, 1000), 65536);
        const packed = deflate(data);

        expect(inflate(packed)).toEqual(data);
        expect(new Uint8Array(inflateSync(packed))).toEqual(data);
        expect(packed.length).toBeLessThan(data.length * 0.6);
    });

    it('reads back the same for nothing at all, one byte, and runs shorter than a repeat', () => {
        for (const data of [new Uint8Array(0), Uint8Array.of(42), Uint8Array.of(1, 2, 1, 2), Uint8Array.of(9, 9, 9, 9, 9, 9, 9, 9)]) {
            const packed = deflate(data);
            expect(inflate(packed)).toEqual(data);
            expect(new Uint8Array(inflateSync(packed))).toEqual(data);
        }
    });

    it('writes a block in a code of its own when that is shorter, and in the fixed one when it is not', () => {
        // The third bit of the first block's first byte, after "last", is the low bit of its kind:
        // 1 fixed, 2 its own code.
        const kindOf = (packed: Uint8Array): number => (packed[2]! >> 1) & 3;
        const flat = new Uint8Array(20000).map((_, i) => [10, 20, 30, 255][i % 4]!);
        const noise = random(11);
        const plenty = Uint8Array.from({ length: 20000 }, () => Math.floor(noise() * 6) * 40);
        expect(kindOf(deflate(plenty))).toBe(2);
        expect(kindOf(deflate(Uint8Array.of(1, 2, 3)))).toBe(1);
        for (const data of [flat, plenty]) {
            expect(new Uint8Array(inflateSync(deflate(data)))).toEqual(data);
        }
    });

    it('reads back the same over many blocks, each with its own code', () => {
        const noise = random(5);
        // Few distinct bytes, rarely repeating in threes: hundreds of thousands of symbols.
        const data = Uint8Array.from({ length: 400000 }, () => Math.floor(noise() * 12) * 21);
        const packed = deflate(data);
        expect(inflate(packed)).toEqual(data);
        expect(new Uint8Array(inflateSync(packed))).toEqual(data);
    });

    it('keeps every code within fifteen bits, even when how often things come up asks for more', () => {
        // Each byte as often as the two before it together, which would make a code deeper than
        // fifteen bits left alone; shuffled, so they are not repeats.
        const counts: number[] = [1, 1];
        while (counts.length < 24) counts.push(counts[counts.length - 1]! + counts[counts.length - 2]!);
        const bytes: number[] = [];
        counts.forEach((count, symbol) => { for (let i = 0; i < count; i++) bytes.push(symbol * 7); });
        const noise = random(9);
        for (let i = bytes.length - 1; i > 0; i--) {
            const j = Math.floor(noise() * (i + 1));
            [bytes[i], bytes[j]] = [bytes[j]!, bytes[i]!];
        }
        const data = Uint8Array.from(bytes);
        expect(inflate(deflate(data))).toEqual(data);
        expect(new Uint8Array(inflateSync(deflate(data)))).toEqual(data);
    });
});
