import { describe, expect, it } from 'bun:test';
import {
    MAX_PALETTE_COLORS, packPaletteTexels, PALETTE_FORMAT, parsePaletteDoc, serializePaletteDoc,
} from '../src/loaders/palette';
import { lutSizeForStrip, neutralLut, parseCubeDoc } from '../src/loaders/lut';

/**
 * The two parts of post-processing that are data rather than arithmetic.
 */

describe('reading a palette', () => {
    it('reads the colours in the order they were written, because that is how they were arranged', () => {
        const doc = parsePaletteDoc({ format: 1, kind: 'palette', name: 'NES', colors: ['#7c7c7c', '#0000fc'] });

        expect(doc.name).toBe('NES');
        expect(doc.colors).toEqual(['#7c7c7c', '#0000fc']);
    });

    it('drops a colour it cannot read and keeps the rest, never the whole file', () => {
        const doc = parsePaletteDoc({ colors: ['#ff0000', 'red', '#0f0', 42, null, '#00FF00'] });

        // Upper case is the same colour; three digits and a word are a different format.
        expect(doc.colors).toEqual(['#ff0000', '#00ff00']);
    });

    it('never throws at whatever it is handed', () => {
        for (const nonsense of [null, 7, 'palette', [], { colors: 'blue' }]) {
            expect(() => parsePaletteDoc(nonsense)).not.toThrow();
        }
        expect(parsePaletteDoc(null).colors).toEqual([]);
    });

    it('stops at the ceiling, because matching walks every colour for every pixel', () => {
        const many = Array.from({ length: MAX_PALETTE_COLORS + 50 }, () => '#123456');

        expect(parsePaletteDoc({ colors: many }).colors).toHaveLength(MAX_PALETTE_COLORS);
    });

    it('comes out the same after a trip through a file and back', () => {
        const doc = parsePaletteDoc({ format: PALETTE_FORMAT, kind: 'palette', name: 'Two', colors: ['#010203', '#040506'] });

        expect(parsePaletteDoc(JSON.parse(serializePaletteDoc(doc)))).toEqual(doc);
    });

    it('packs one opaque pixel per colour, in order', () => {
        expect([...packPaletteTexels(['#ff0000', '#0000ff'])]).toEqual([255, 0, 0, 255, 0, 0, 255, 255]);
    });

    it('packs one white pixel for a palette with nothing in it, so reading it changes nothing', () => {
        expect([...packPaletteTexels([])]).toEqual([255, 255, 255, 255]);
    });
});

describe('reading a grading table', () => {
    const neutralCube = (size: number): string => {
        const lines = [`TITLE "neutral"`, `LUT_3D_SIZE ${size}`, 'DOMAIN_MIN 0 0 0', 'DOMAIN_MAX 1 1 1'];
        for (let b = 0; b < size; b++) {
            for (let g = 0; g < size; g++) {
                for (let r = 0; r < size; r++) {
                    lines.push(`${r / (size - 1)} ${g / (size - 1)} ${b / (size - 1)}`);
                }
            }
        }
        return lines.join('\n');
    };

    it('lays a .cube out the one way everything downstream understands', () => {
        // A .cube lists red fastest; a strip puts red across a slice, green down it and blue picks
        // the slice. Placing rather than copying is the whole of the reading, and getting it wrong
        // gives a table that looks plausible and grades the wrong way round.
        expect(parseCubeDoc(neutralCube(4)).data).toEqual(neutralLut(4).data);
    });

    it('reads its size from its own entries and refuses a file that miscounts them', () => {
        expect(parseCubeDoc(neutralCube(2)).size).toBe(2);
        expect(() => parseCubeDoc('LUT_3D_SIZE 4\n0 0 0\n1 1 1')).toThrow(/needs 64 entries, and it has 2/);
        expect(() => parseCubeDoc('0 0 0')).toThrow(/LUT_3D_SIZE/);
    });

    it('works out a strip\'s size from its shape, so a table cannot mislabel itself', () => {
        expect(lutSizeForStrip(256, 16)).toBe(16);
        expect(lutSizeForStrip(255, 16)).toBe(0);
        expect(lutSizeForStrip(1, 1)).toBe(0);
    });

    it('has a table that changes nothing, for grading with while the real one is on its way', () => {
        const neutral = neutralLut(8);
        const last = 7;

        // The corner where red and blue are full and green is none: x = blue * size + red.
        const at = (0 * 8 * 8 + (last * 8 + last)) * 4;
        expect([...neutral.data.slice(at, at + 3)]).toEqual([255, 0, 255]);
    });
});
