import { describe, expect, it, spyOn } from 'bun:test';
import { createPixels, drawText, getPixel } from '../src/pixels';
import { newBitmapFont } from '../src/loaders';
import { newFont } from '../src/loaders/font/new_font';
import { createTestGame, startTestScene } from './helpers/test_game';
import { createTestVectorFont } from './helpers/test_ttf';
import { createScene } from '../src/scene/create_scene';
import { encodePng } from '../src/pixels/encode_png';
import { fillRect } from '../src/pixels';
import { useLoadBitmapFont } from '../src/hooks/loaders/use_load_bitmap_font';
import { whenLoaded } from '../src/loaders';
import type { TBitmapFont } from '../src/loaders';
import type { TColor } from '../src/color';
import type { TPixels } from '../src/pixels';

/**
 * Writing into a picture: the default font with no game at all, a vector font from its outlines,
 * and what happens with a font that is not here yet.
 */

const RED: TColor = { r: 1, g: 0, b: 0, a: 1 };

/**
 * The picture as rows: `#` opaque, `+` partly covered, `.` empty.
 */
const shade = (pixels: TPixels): string[] => {
    const rows: string[] = [];
    for (let y = 0; y < pixels.height; y++) {
        let row = '';
        for (let x = 0; x < pixels.width; x++) {
            const a = pixels.data[(y * pixels.width + x) * 4 + 3]!;
            row += a === 0 ? '.' : a === 255 ? '#' : '+';
        }
        rows.push(row);
    }
    return rows;
};

const opaque = (pixels: TPixels): number => shade(pixels).join('').split('#').length - 1;

describe('drawText with the font the engine carries', () => {
    it('writes with no game and no waiting, the letter the font draws', () => {
        const p = drawText(createPixels(8, 8), 'H', 0, 0);

        expect(shade(p)).toEqual([
            '##...##.',
            '##...##.',
            '##...##.',
            '#######.',
            '##...##.',
            '##...##.',
            '##...##.',
            '........',
        ]);
    });

    it('paints in the colour asked for, at the opacity asked for', () => {
        const solid = drawText(createPixels(8, 8), 'H', 0, 0, { color: RED });
        expect(getPixel(solid, 0, 0)).toEqual(RED);

        const faint = drawText(createPixels(8, 8), 'H', 0, 0, { color: { ...RED, a: 0.5 } });
        expect(faint.data[3]).toBe(128);
    });

    it('lays over what is there rather than cutting through it', () => {
        const p = drawText(createPixels(8, 8, { r: 0, g: 0, b: 1, a: 1 }), 'H', 0, 0, { color: RED });

        expect(getPixel(p, 0, 0)).toEqual(RED);
        // Between the strokes of the H the background is still there.
        expect(getPixel(p, 3, 0)).toEqual({ r: 0, g: 0, b: 1, a: 1 });
    });

    it('grows by whole pixels at a bigger size', () => {
        const p = drawText(createPixels(16, 16), 'H', 0, 0, { fontSize: 16 });

        expect(shade(p)[0]).toBe('####......####..');
        expect(shade(p)[6]).toBe('##############..');
    });

    it('starts new lines, aligns them, and centres the block on the point with an anchor', () => {
        const p = drawText(createPixels(17, 17), 'HH\nH', 8, 8, { anchor: { x: 0.5, y: 0.5 }, align: 'center' });
        const rows = shade(p);

        // Two letters and a gap of one: 17 wide, centred on 8, so from 0 to 16.
        expect(rows[0]).toBe('##...##..##...##.');
        // The second line is one letter, in the middle of the first.
        expect(rows[9]).toBe('....##...##......');
    });

    it('draws nothing outside the picture and does not mind being half off it', () => {
        const p = drawText(createPixels(4, 4), 'H', -2, -2);

        expect(shade(p)).toEqual(['...#', '####', '...#', '...#']);
    });
});

describe('drawText with a vector font', () => {
    const vector = () => {
        const { store } = createTestGame();
        let font!: ReturnType<typeof createTestVectorFont>;
        startTestScene(store, 'Level', () => {
            font = createTestVectorFont(store);
            return createScene();
        });
        return { store, font };
    };

    it('fills each letter from its outline, soft at the edges by default', () => {
        const { font } = vector();
        // The A is a triangle: its sides are slanted, so they cross pixels part of the way.
        const smooth = drawText(createPixels(12, 12), 'A', 0, 0, { font, fontSize: 10 });
        const rows = shade(smooth);

        expect(opaque(smooth)).toBeGreaterThan(0);
        expect(rows.join('')).toContain('+');
    });

    it('gives every pixel in or out with smooth off, and covers what the soft edge covered', () => {
        const { font } = vector();
        const hard = drawText(createPixels(12, 12), 'A', 0, 0, { font, fontSize: 10, smooth: false });
        const soft = drawText(createPixels(12, 12), 'A', 0, 0, { font, fontSize: 10 });

        expect(shade(hard).join('')).not.toContain('+');
        shade(hard).forEach((row, y) => {
            [...row].forEach((cell, x) => {
                if (cell === '#') expect(shade(soft)[y]![x]).not.toBe('.');
            });
        });
    });

    it('leaves the hole of an O empty, which is the outline winding the other way', () => {
        const { font } = vector();
        const p = drawText(createPixels(40, 40), 'O', 0, 0, { font, fontSize: 40, smooth: false });
        const rows = shade(p);
        // Find the letter's rows and look across its middle: ink, then nothing, then ink.
        const inked = rows.map((row, y) => ({ row, y })).filter(({ row }) => row.includes('#'));
        const middle = inked[Math.floor(inked.length / 2)]!.row;

        expect(middle).toMatch(/#+\.+#+/);
    });

    it('finds the font by its key in a scene body, like createText', () => {
        const { store, font } = vector();
        const byObject = drawText(createPixels(12, 12), 'A', 0, 0, { font, fontSize: 10 });
        let byKey!: TPixels;
        startTestScene(store, 'Later', () => {
            byKey = drawText(createPixels(12, 12), 'A', 0, 0, { font: font.key, fontSize: 10 });
            return createScene();
        });

        expect(shade(byKey)).toEqual(shade(byObject));
    });

    it('refuses a key nothing was loaded under, with the fix in the message', () => {
        const { store } = vector();
        expect(() => startTestScene(store, 'Later', () => {
            drawText(createPixels(4, 4), 'I', 0, 0, { font: 'nope' });
            return createScene();
        })).toThrow("useLoadFont({ src, key: 'nope' })");
    });

    it('says to pass the font itself when a key is asked for outside a scene body', () => {
        vector();
        expect(() => drawText(createPixels(4, 4), 'I', 0, 0, { font: 'test-sans.ttf' })).toThrow('pass the font itself');
    });
});

describe('drawText with a bitmap font of the game', () => {
    it('copies letters out of the image it downloaded, without downloading it twice', async () => {
        // A two-letter font: A is a solid 3 x 4 block, B its outline.
        const atlas = createPixels(6, 4);
        fillRect(atlas, 0, 0, 3, 4, { r: 1, g: 1, b: 1, a: 1 });
        fillRect(atlas, 3, 0, 3, 4, { r: 1, g: 1, b: 1, a: 1 });
        fillRect(atlas, 4, 1, 1, 2, { r: 0, g: 0, b: 0, a: 0 });
        const png = encodePng(atlas);
        const meta = { name: 'Two', glyphHeight: 4, tracking: 1, baseline: 3, atlasWidth: 6, atlasHeight: 4, chars: [{ char: 'A', x: 0, y: 0, w: 3 }, { char: 'B', x: 3, y: 0, w: 3 }] };
        const fetched: string[] = [];
        Object.assign(globalThis, { createImageBitmap: async () => ({ width: 6, height: 4, close: () => {} }) });
        const spy = spyOn(globalThis, 'fetch').mockImplementation((async (input: string) => {
            const url = String(input);
            fetched.push(url);
            if (url.endsWith('.json')) return { ok: true, json: async () => meta };
            if (url.endsWith('.png')) return { ok: true, blob: async () => new Blob([png as Uint8Array<ArrayBuffer>]) };
            return { ok: false, status: 404 };
        }) as unknown as typeof fetch);

        const { store } = createTestGame();
        let font!: TBitmapFont;
        startTestScene(store, 'Level', () => {
            font = useLoadBitmapFont({ json: '/two.json', atlas: '/two.png' });
            return createScene();
        });
        await whenLoaded(font);
        spy.mockRestore();

        expect(font.status).toBe('ready');
        expect(fetched.filter((url) => url.endsWith('.png'))).toHaveLength(1);
        const p = drawText(createPixels(8, 4), 'AB', 0, 0, { font, color: RED });
        expect(shade(p)).toEqual(['###.###.', '###.#.#.', '###.#.#.', '###.###.']);
        expect(getPixel(p, 0, 0)).toEqual(RED);
    });
});

describe('drawText with a font that has not arrived', () => {
    it('draws nothing and says nothing while it is on the way', () => {
        const warn = spyOn(console, 'warn').mockImplementation(() => {});
        const loading = newFont('late.ttf', 'late.ttf', 48);
        const p = drawText(createPixels(8, 8), 'I', 0, 0, { font: loading });

        expect(opaque(p)).toBe(0);
        expect(warn).not.toHaveBeenCalled();
        warn.mockRestore();
    });

    it('says once that a font which failed draws nothing', () => {
        const warn = spyOn(console, 'warn').mockImplementation(() => {});
        const broken = newBitmapFont('broken.json', 'broken.png', 'broken');
        broken.status = 'error';
        drawText(createPixels(8, 8), 'I', 0, 0, { font: broken });
        drawText(createPixels(8, 8), 'I', 0, 0, { font: broken });

        expect(warn).toHaveBeenCalledTimes(1);
        warn.mockRestore();
    });
});
