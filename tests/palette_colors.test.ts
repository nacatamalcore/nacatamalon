import { afterEach, describe, expect, it, spyOn } from 'bun:test';
import { BUILTIN } from '../src/CONST';
import { getColor } from '../src/color';
import { createHeadlessGame } from '../src/headless';
import { createPixelTexture } from '../src/gameobjects/pixel_texture';
import { createSprite } from '../src/gameobjects/sprite/create_sprite';
import { createScene } from '../src/scene/create_scene';
import { paletteMatch } from '../src/post';
import { usePostProcess } from '../src/hooks/post/use_post_process';
import { useLoadPalette } from '../src/hooks/loaders/use_load_palette';
import { checkColorLimit, clonePixels, createPixels, pixelsFromRows, setPixel, snapToPalette } from '../src/pixels';
import { whenLoaded } from '../src/loaders';
import type { THeadlessGame } from '../src/headless';
import type { TPalette } from '../src/loaders/palette';
import type { TPixels } from '../src/pixels';

/**
 * The colours of the old machines, and holding a generated picture to them.
 */

const games: THeadlessGame[] = [];

afterEach(() => {
    games.splice(0).forEach((game) => game.destroy());
});

const at = (pixels: TPixels, x: number, y: number): number[] => Array.from(pixels.data.subarray((y * pixels.width + x) * 4, (y * pixels.width + x) * 4 + 4));

const PALETTE = { r: '#ff0000', g: '#00ff00', b: '#0000ff', y: '#ffff00' };

describe('the palettes the engine carries', () => {
    it('are lists of different colours getColor reads, as many as each machine had', () => {
        const sizes = Object.fromEntries(Object.entries(BUILTIN.PALETTES).map(([name, colors]) => [name, colors.length]));
        expect(sizes).toEqual({ nes: 54, gameBoy: 4, c64: 16 });
        for (const colors of Object.values(BUILTIN.PALETTES)) {
            expect(new Set(colors).size).toBe(colors.length);
            for (const color of colors) {
                expect(color).toMatch(/^#[0-9a-f]{6}$/);
                expect(getColor(color).a).toBe(1);
            }
        }
    });

    it('cannot be changed by a game', () => {
        expect(Object.isFrozen(BUILTIN.PALETTES)).toBe(true);
        expect(Object.isFrozen(BUILTIN.PALETTES.nes)).toBe(true);
    });

    it('are what an effect matches against, by name, with no file', async () => {
        let palette!: TPalette;
        const game = createHeadlessGame({
            width: 2, height: 1,
            scenes: {
                Level: () => {
                    palette = useLoadPalette({ src: 'nacatamalon:gameBoy' });
                    usePostProcess({ ...paletteMatch({ dither: 0 }), palette });
                    createSprite({ texture: createPixelTexture(pixelsFromRows(['rb'], PALETTE)), anchor: { x: 0, y: 0 }, transform: { x: 0, y: 0 } });
                    return createScene();
                },
            },
        });
        games.push(game);
        await game.loaded();
        await whenLoaded(palette);

        expect(palette.status).toBe('ready');
        expect(palette.colors).toEqual([...BUILTIN.PALETTES.gameBoy]);
        const shot = game.capture();
        const allowed = BUILTIN.PALETTES.gameBoy.map((color) => { const c = getColor(color); return [Math.round(c.r * 255), Math.round(c.g * 255), Math.round(c.b * 255), 255].join(); });
        expect(allowed).toContain(at(shot, 0, 0).join());
        expect(allowed).toContain(at(shot, 1, 0).join());
    });

    it('says when asked for one it does not have, and which it has', async () => {
        const warn = spyOn(console, 'warn').mockImplementation(() => {});
        try {
            let palette!: TPalette;
            const game = createHeadlessGame({
                width: 2, height: 1,
                scenes: {
                    Level: () => {
                        palette = useLoadPalette({ src: 'nacatamalon:snes' });
                        return createScene();
                    },
                },
            });
            games.push(game);
            await game.loaded();
            await whenLoaded(palette);

            expect(palette.status).toBe('error');
            const said = warn.mock.calls.map((call) => call.map(String).join(' ')).join('\n');
            expect(said).toContain("no palette called 'snes'");
            expect(said).toContain('nes, gameBoy, c64');
        } finally {
            warn.mockRestore();
        }
    });
});

describe('snapToPalette', () => {
    it('moves each pixel to the nearest colour, alpha as it was', () => {
        const pixels = createPixels(3, 1);
        pixels.data.set([250, 10, 10, 255, 10, 10, 200, 128, 9, 9, 9, 0]);

        snapToPalette(pixels, ['#ff0000', '#0000ff']);

        expect(at(pixels, 0, 0)).toEqual([255, 0, 0, 255]);
        expect(at(pixels, 1, 0)).toEqual([0, 0, 255, 128]);
        // Nothing there, so nothing to move.
        expect(at(pixels, 2, 0)).toEqual([9, 9, 9, 0]);
    });

    it('takes the first of two as near, as the effect does', () => {
        const pixels = createPixels(1, 1, getColor('#808080'));
        const tied = ['#7f7f7f', '#818181'];

        expect(at(snapToPalette(pixels, tied), 0, 0)).toEqual([127, 127, 127, 255]);
    });

    it('takes anything getColor reads, and gives back the same picture', () => {
        const pixels = createPixels(1, 1, getColor('#fe0000'));

        expect(snapToPalette(pixels, ['red', 0x0000ff, getColor('#00ff00')])).toBe(pixels);
        expect(at(pixels, 0, 0)).toEqual([255, 0, 0, 255]);
    });

    it('keeps to its region, cut by the picture', () => {
        const pixels = pixelsFromRows(['rr', 'rr'], PALETTE);

        snapToPalette(pixels, ['#0000ff'], { region: { x: 1, y: -3, width: 9, height: 4 } });

        expect(at(pixels, 0, 0)).toEqual([255, 0, 0, 255]);
        expect(at(pixels, 1, 0)).toEqual([0, 0, 255, 255]);
        expect(at(pixels, 1, 1)).toEqual([255, 0, 0, 255]);
    });

    it('comes out as the screen does under paletteMatch with no shaking', async () => {
        const art = createPixels(16, 16);
        let seed = 7;
        const next = (): number => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 2 ** 32; };
        for (let y = 0; y < 16; y++) {
            for (let x = 0; x < 16; x++) {
                setPixel(art, x, y, { r: next(), g: next(), b: next(), a: 1 });
            }
        }
        const game = createHeadlessGame({
            width: 16, height: 16,
            scenes: {
                Level: () => {
                    const palette = useLoadPalette({ src: 'nacatamalon:nes' });
                    usePostProcess({ ...paletteMatch({ dither: 0 }), palette });
                    createSprite({ texture: createPixelTexture(art), anchor: { x: 0, y: 0 }, transform: { x: 0, y: 0 } });
                    return createScene();
                },
            },
        });
        games.push(game);
        await game.loaded();
        game.run(1);

        expect(Array.from(snapToPalette(clonePixels(art), BUILTIN.PALETTES.nes).data)).toEqual(Array.from(game.capture().data));
    });

    it('refuses what is not a palette before painting anything', () => {
        const pixels = createPixels(1, 1, getColor('#123456'));

        expect(() => snapToPalette(pixels, [])).toThrow('has no colours');
        expect(() => snapToPalette(pixels, 'nes' as never)).toThrow('not a list of colours');
        expect(() => snapToPalette(pixels, ['#ff0000', 'gren'])).toThrow("colour 1 of the palette is 'gren'");
        expect(() => snapToPalette(pixels, [Number.NaN])).toThrow('colour 0 of the palette is NaN');
        expect(at(pixels, 0, 0)).toEqual([18, 52, 86, 255]);
    });
});

describe('checkColorLimit', () => {
    it('says which cells use too many, where, and with what', () => {
        const pixels = pixelsFromRows([
            'rg..',
            'by..',
            'rr.r',
            'rr.g',
        ], PALETTE);

        expect(checkColorLimit(pixels, { cell: 2, colors: 2 })).toEqual([
            { x: 0, y: 0, width: 2, height: 2, colors: ['#ff0000', '#00ff00', '#0000ff', '#ffff00'] },
        ]);
    });

    it('gives nothing back when all of it fits', () => {
        const pixels = pixelsFromRows(['rg', 'by'], PALETTE);

        expect(checkColorLimit(pixels, { colors: 4 })).toEqual([]);
        expect(checkColorLimit(pixels, { cell: 1, colors: 1 })).toEqual([]);
    });

    it('takes the whole picture when given no cell', () => {
        const pixels = pixelsFromRows(['rg', 'by'], PALETTE);

        expect(checkColorLimit(pixels, { colors: 3 })).toEqual([{ x: 0, y: 0, width: 2, height: 2, colors: ['#ff0000', '#00ff00', '#0000ff', '#ffff00'] }]);
    });

    it('does not count transparent, and counts one colour once whatever its alpha', () => {
        const pixels = createPixels(3, 1);
        pixels.data.set([255, 0, 0, 255, 255, 0, 0, 40, 0, 0, 255, 0]);

        expect(checkColorLimit(pixels, { colors: 1 })).toEqual([]);
    });

    it('takes cells that are not square, and checks those the edge cuts', () => {
        const pixels = pixelsFromRows(['rrr', 'rrg'], PALETTE);

        expect(checkColorLimit(pixels, { cell: { width: 2, height: 2 }, colors: 1 })).toEqual([
            { x: 2, y: 0, width: 1, height: 2, colors: ['#ff0000', '#00ff00'] },
        ]);
    });

    it('writes each colour with all its digits', () => {
        const pixels = pixelsFromRows(['ab'], { a: '#000102', b: '#000000' });

        expect(checkColorLimit(pixels, { colors: 1 })[0]?.colors).toEqual(['#000102', '#000000']);
    });

    it('refuses sizes that are not whole numbers', () => {
        const pixels = createPixels(1, 1);

        expect(() => checkColorLimit(pixels, { colors: 0 })).toThrow('colors is 0');
        expect(() => checkColorLimit(pixels, { colors: 1.5 })).toThrow('colors is 1.5');
        expect(() => checkColorLimit(pixels, {} as never)).toThrow('colors is undefined');
        expect(() => checkColorLimit(pixels, undefined as never)).toThrow('colors is undefined');
        expect(() => checkColorLimit(pixels, { colors: 1, cell: 0 })).toThrow('the width of a cell is 0');
        expect(() => checkColorLimit(pixels, { colors: 1, cell: { width: 2, height: Number.NaN } })).toThrow('the height of a cell is NaN');
        expect(() => checkColorLimit(pixels, { colors: 1, cell: '8' as never })).toThrow("the width of a cell is '8'");
    });
});
