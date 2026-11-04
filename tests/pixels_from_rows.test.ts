import { describe, expect, it } from 'bun:test';
import { getPixel, pixelsFromRows, sheetFromRows } from '../src/pixels';
import { createPixelTexture } from '../src/gameobjects/pixel_texture';
import { createSpriteAtlas } from '../src/atlas';
import { createScene } from '../src/scene/create_scene';
import { createTestGame, startTestScene } from './helpers/test_game';
import type { TSpriteAtlas } from '../src/atlas';

/**
 * Pixel art written as rows of characters and a palette.
 */

const bytes = (pixels: ReturnType<typeof pixelsFromRows>, x: number, y: number): number[] => {
    const at = (y * pixels.width + x) * 4;
    return Array.from(pixels.data.subarray(at, at + 4));
};

describe('pixelsFromRows', () => {
    it('draws one pixel a character, top row first, and leaves the dots transparent', () => {
        const pixels = pixelsFromRows(['r.', '.b'], { r: '#ff0000', b: '#0000ff' });

        expect(pixels.width).toBe(2);
        expect(pixels.height).toBe(2);
        expect(bytes(pixels, 0, 0)).toEqual([255, 0, 0, 255]);
        expect(bytes(pixels, 1, 0)).toEqual([0, 0, 0, 0]);
        expect(bytes(pixels, 0, 1)).toEqual([0, 0, 0, 0]);
        expect(bytes(pixels, 1, 1)).toEqual([0, 0, 255, 255]);
    });

    it('takes a colour however getColor reads one', () => {
        const pixels = pixelsFromRows(['abcde'], {
            a: '#ff000080',
            b: 'lime',
            c: 0x0000ff,
            d: { r: 1, g: 1, b: 0, a: 1 },
            e: 'transparent',
        });

        expect(bytes(pixels, 0, 0)).toEqual([255, 0, 0, 128]);
        expect(bytes(pixels, 1, 0)).toEqual([0, 255, 0, 255]);
        expect(bytes(pixels, 2, 0)).toEqual([0, 0, 255, 255]);
        expect(bytes(pixels, 3, 0)).toEqual([255, 255, 0, 255]);
        expect(bytes(pixels, 4, 0)).toEqual([0, 0, 0, 0]);
    });

    it('treats a space as nothing too, and lets the palette give the dot or the space a colour', () => {
        const gaps = pixelsFromRows(['r r'], { r: 'red' });
        expect(bytes(gaps, 1, 0)).toEqual([0, 0, 0, 0]);

        const painted = pixelsFromRows(['.r '], { r: 'red', '.': 'white', ' ': 'black' });
        expect(bytes(painted, 0, 0)).toEqual([255, 255, 255, 255]);
        expect(bytes(painted, 2, 0)).toEqual([0, 0, 0, 255]);
    });

    it('draws each character as a square of scale pixels', () => {
        const pixels = pixelsFromRows(['r.'], { r: 'red' }, { scale: 3 });

        expect(pixels.width).toBe(6);
        expect(pixels.height).toBe(3);
        for (let y = 0; y < 3; y++) {
            for (let x = 0; x < 6; x++) {
                expect(getPixel(pixels, x, y).a).toBe(x < 3 ? 1 : 0);
            }
        }
    });

    it('counts a character made of two halves, an emoji, as one pixel', () => {
        const pixels = pixelsFromRows(['🔥.🔥'], { '🔥': 'orange' });

        expect(pixels.width).toBe(3);
        expect(getPixel(pixels, 2, 0).a).toBe(1);
    });

    it('says which row and column has a character the palette does not name, and what it does name', () => {
        expect(() => pixelsFromRows(['rr', 'rx'], { r: 'red', g: 'green' }))
            .toThrow("[NacatamalOn] pixelsFromRows: 'x' at row 1, column 1 is not in the palette (r, g). Add it, or use '.' for nothing.");
    });

    it('says which row is not as wide as the first', () => {
        expect(() => pixelsFromRows(['rrr', 'rr'], { r: 'red' }))
            .toThrow('[NacatamalOn] pixelsFromRows: row 1 is 2 wide, and the first is 3. Every row is as wide.');
    });

    it('refuses a drawing with nothing in it', () => {
        expect(() => pixelsFromRows([], { r: 'red' })).toThrow('has no rows');
        expect(() => pixelsFromRows([''], { r: 'red' })).toThrow('the first row is empty');
    });

    it('refuses a palette name longer than one character, and a colour that is none', () => {
        expect(() => pixelsFromRows(['r'], { rr: 'red' })).toThrow("the palette names 'rr'");
        expect(() => pixelsFromRows(['r'], { r: 'gren' })).toThrow("'r' in the palette is 'gren', which is not a colour");
        expect(() => pixelsFromRows(['r'], { r: Number.NaN })).toThrow("'r' in the palette");
    });

    it('says a row is not text, the first or one left out of the list, rather than leaving a gap', () => {
        expect(() => pixelsFromRows([5 as unknown as string], { r: 'red' })).toThrow('row 0 is not text');
        // eslint-disable-next-line no-sparse-arrays
        expect(() => pixelsFromRows(['r', , 'r'] as unknown as string[], { r: 'red' })).toThrow('row 1 is not text');
    });

    it('refuses a picture bigger than a graphics card holds, before asking for the memory', () => {
        expect(() => pixelsFromRows(['r'], { r: 'red' }, { scale: 100000 }))
            .toThrow('the picture would be 100000 by 100000, and a graphics card holds 8192 a side at most');
    });

    it('shows a scale written as text as text', () => {
        expect(() => pixelsFromRows(['r'], { r: 'red' }, { scale: '2' as unknown as number })).toThrow("scale is '2'");
    });

    it('refuses a scale that is not a whole number of one or more', () => {
        expect(() => pixelsFromRows(['r'], { r: 'red' }, { scale: 0 })).toThrow('scale is 0');
        expect(() => pixelsFromRows(['r'], { r: 'red' }, { scale: 1.5 })).toThrow('scale is 1.5');
    });
});

describe('sheetFromRows', () => {
    const stand = ['.h.', 'hhh', '.s.'];
    const walk = ['.h.', 'hhh', 's.s'];
    const palette = { h: '#3bceac', s: '#ffd23f' };

    it('lays the frames side by side and says which number each name is', () => {
        const sheet = sheetFromRows({ stand, walk }, palette);

        expect(sheet.columns).toBe(2);
        expect(sheet.frames).toEqual({ stand: 0, walk: 1 });
        expect(sheet.frameWidth).toBe(3);
        expect(sheet.frameHeight).toBe(3);
        expect(sheet.pixels.width).toBe(6);
        expect(sheet.pixels.height).toBe(3);
        // The bottom middle of the first frame is a foot; of the second, a gap between two.
        expect(getPixel(sheet.pixels, 1, 2).a).toBe(1);
        expect(getPixel(sheet.pixels, 3 + 1, 2).a).toBe(0);
        expect(getPixel(sheet.pixels, 3 + 0, 2).a).toBe(1);
    });

    it('numbers frames given as a list in its order, with no names', () => {
        const sheet = sheetFromRows([stand, walk, stand], palette, { scale: 2 });

        expect(sheet.columns).toBe(3);
        expect(sheet.frames).toEqual({});
        expect(sheet.frameWidth).toBe(6);
        expect(sheet.pixels.width).toBe(18);
    });

    it('is cut back into its frames by createSpriteAtlas', () => {
        const sheet = sheetFromRows({ stand, walk }, palette);
        const { store } = createTestGame();
        let atlas!: TSpriteAtlas;
        startTestScene(store, 'S', () => {
            atlas = createSpriteAtlas({ texture: createPixelTexture(sheet.pixels), columns: sheet.columns });
            return createScene();
        });

        expect(atlas.frames).toBe(2);
        expect([atlas.texture.width, atlas.texture.height]).toEqual([sheet.frameWidth * 2, sheet.frameHeight]);
    });

    it('names a frame that is not the size of the first', () => {
        expect(() => sheetFromRows({ stand, tall: [...walk, 'hhh'] }, palette))
            .toThrow("[NacatamalOn] sheetFromRows: frame 'tall' is 3 by 4, and the first is 3 by 3. Every frame of a sheet is the same size.");
    });

    it('says which frame a stray character is in', () => {
        expect(() => sheetFromRows({ stand, walk: ['.h.', 'hxh', 's.s'] }, palette))
            .toThrow("'x' at row 1, column 1 of frame 'walk' is not in the palette (h, s)");
    });

    it('says which frame is left out of a list', () => {
        // eslint-disable-next-line no-sparse-arrays
        expect(() => sheetFromRows([stand, , walk] as unknown as string[][], palette)).toThrow('frame 1 has no rows');
    });

    it('keeps the number of a frame named __proto__, as a file may name one', () => {
        const sheet = sheetFromRows(JSON.parse('{"__proto__": [".h.", "hhh", ".s."], "walk": [".h.", "hhh", "s.s"]}'), palette);

        expect(Object.keys(sheet.frames)).toEqual(['__proto__', 'walk']);
        expect(sheet.frames.walk).toBe(1);
    });

    it('refuses a sheet wider than a graphics card holds', () => {
        expect(() => sheetFromRows(Array.from({ length: 3000 }, () => stand), palette)).toThrow('9000 by 3');
    });

    it('refuses no frames at all', () => {
        expect(() => sheetFromRows({}, palette)).toThrow('no frames were given');
        expect(() => sheetFromRows([], palette)).toThrow('no frames were given');
    });
});
