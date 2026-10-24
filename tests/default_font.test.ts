import { afterEach, describe, expect, it, spyOn } from 'bun:test';
import { createScene } from '../src/scene/create_scene';
import { createText } from '../src/gameobjects/text/create_text';
import { DEFAULT_FONT_KEY } from '../src/gameobjects/text/default_font';
import { ARCADE_FONT } from '../src/gameobjects/text/fonts/arcade_font';
import { createPixels, drawText } from '../src/pixels';
import { parseSceneDoc, sceneFromDoc, serializeScene } from '../src/scene/document';
import { registerScene } from '../src/scene/register_scene';
import { startScene } from '../src/scene/start_scene';
import { createTestFont } from './helpers/test_font';
import { createTestGame, startTestScene } from './helpers/test_game';
import type { TText } from '../src/gameobjects/text/types/t_text';
import type { TBitmapFontMeta } from '../src/loaders';

/**
 * The font a text gets when it is given none: Nacatamal Arcade, carried inside the engine, so
 * `createText({ text })` shows without loading anything first.
 */

let warn: ReturnType<typeof spyOn> | null = null;

afterEach(() => {
    warn?.mockRestore();
    warn = null;
});

describe('a text given no font', () => {
    it('gets the engine\'s own, one for the whole game, counted as a load of the scene', () => {
        const { store } = createTestGame();
        let a!: TText;
        let b!: TText;
        const root = startTestScene(store, 'Level', () => {
            a = createText({ text: 'SCORE 0' });
            b = createText({ text: 'LIVES 3' });
            return createScene();
        });

        expect(a.font.key).toBe(DEFAULT_FONT_KEY);
        expect(b.font).toBe(a.font);
        expect(root.loads).toContain(a.font);
    });

    it('still takes the font it is given', () => {
        const { store } = createTestGame();
        const font = createTestFont();
        let text!: TText;
        startTestScene(store, 'Level', () => {
            text = createText({ text: 'HI', font });
            return createScene();
        });

        expect(text.font).toBe(font);
    });
});

describe('the font itself', () => {
    it('describes a grid of 8 by 8 that matches its image, 138 characters with the Spanish ones and the prompts', async () => {
        const { store } = createTestGame();
        let text!: TText;
        startTestScene(store, 'Level', () => {
            text = createText({ text: 'x' });
            return createScene();
        });
        const meta = await (await fetch(text.font.src)).json() as TBitmapFontMeta;

        expect(meta.glyphHeight).toBe(8);
        expect(meta.chars).toHaveLength(139);
        for (const char of 'ñÑ¿¡áéíóúü×←→↑↓▲▼◀▶ⒶⒷⓍⓎ★♥●■') {
            expect(meta.chars.some((glyph) => glyph.char === char)).toBe(true);
        }
        // The last character sits inside the image it is cut from.
        const last = meta.chars[meta.chars.length - 1];
        expect(last.x + last.w).toBeLessThanOrEqual(meta.atlasWidth);
        expect(last.y + meta.glyphHeight).toBeLessThanOrEqual(meta.atlasHeight);
    });

    it('carries an image of exactly the size the description promises', () => {
        // A PNG says its width and height in its first chunk, sixteen bytes in.
        const bytes = Buffer.from(ARCADE_FONT.atlas.split(',')[1], 'base64');
        expect(bytes.subarray(1, 4).toString()).toBe('PNG');
        expect(bytes.readUInt32BE(16)).toBe(128);
        expect(bytes.readUInt32BE(20)).toBe(72);
    });
});

describe('the prompts drawn for Nacatamal Arcade', () => {
    it('are each something to draw, not an empty cell', async () => {
        const { decodePng } = await import('../src/pixels/decode_png');
        const image = await decodePng(Buffer.from(ARCADE_FONT.atlas.split(',')[1], 'base64'));
        const { store } = createTestGame();
        let text!: TText;
        startTestScene(store, 'Level', () => {
            text = createText({ text: 'x' });
            return createScene();
        });
        const meta = await (await fetch(text.font.src)).json() as TBitmapFontMeta;

        for (const char of '←→↑↓▲▼◀▶ⒶⒷⓍⓎ★♥●■') {
            const glyph = meta.chars.find((g) => g.char === char)!;
            let ink = 0;
            for (let y = 0; y < 8; y++) {
                for (let x = 0; x < 8; x++) {
                    ink += image.data[((glyph.y + y) * image.width + glyph.x + x) * 4 + 3] > 127 ? 1 : 0;
                }
            }
            expect(ink).toBeGreaterThan(6);
        }
    });
});

describe('a scene written down', () => {
    it('names the engine\'s font and lists no file for it, and reads back the same, without a warning', () => {
        const { store } = createTestGame();
        const root = startTestScene(store, 'Level', () => {
            createText({ text: 'SCORE 0' });
            return createScene();
        });
        const doc = serializeScene(root);

        expect(doc.root.components[0]).toMatchObject({ type: 'text', font: DEFAULT_FONT_KEY });
        expect(doc.assets.some((asset) => asset.key === DEFAULT_FONT_KEY)).toBe(false);
        expect(parseSceneDoc(doc, '/scenes/level.scene')).toEqual(doc);

        warn = spyOn(console, 'warn').mockImplementation(() => {});
        const again = createTestGame();
        registerScene(again.store, doc.name, sceneFromDoc(doc));
        const rebuilt = serializeScene(startScene(again.store, doc.name));
        expect(rebuilt.root.components[0]).toMatchObject({ type: 'text', text: 'SCORE 0', font: DEFAULT_FONT_KEY });
        expect(warn).not.toHaveBeenCalled();
    });
});

describe('the other fonts built in', () => {
    it('are named by their keys, with nothing loaded, one per game', () => {
        const { store } = createTestGame();
        let square!: TText;
        let thin!: TText;
        let again!: TText;
        const root = startTestScene(store, 'Level', () => {
            square = createText({ text: 'SCORE 0', font: 'nacatamalon:square' });
            thin = createText({ text: 'lives 3', font: 'nacatamalon:thin' });
            again = createText({ text: 'HI', font: 'nacatamalon:square' });
            return createScene();
        });

        expect(square.font.key).toBe('nacatamalon:square');
        expect(thin.font.key).toBe('nacatamalon:thin');
        expect(again.font).toBe(square.font);
        expect(root.loads).toContain(square.font);
        expect(root.loads).toContain(thin.font);
    });

    it('have the same characters, the thin one narrower but for its prompts', async () => {
        const { store } = createTestGame();
        let text!: TText;
        startTestScene(store, 'Level', () => {
            text = createText({ text: 'x', font: 'nacatamalon:thin' });
            return createScene();
        });
        const meta = await (await fetch(text.font.src)).json() as TBitmapFontMeta;

        expect(meta.chars.map((glyph) => glyph.char).join('')).toBe(ARCADE_FONT.chars);
        expect(meta.chars.find((glyph) => glyph.char === 'A')!.w).toBe(6);
        expect(meta.chars.find((glyph) => glyph.char === 'Ⓐ')!.w).toBe(8);
    });

    it('are written down by key alone and read back the same', () => {
        const { store } = createTestGame();
        const root = startTestScene(store, 'Level', () => {
            createText({ text: 'SCORE 0', font: 'nacatamalon:square' });
            return createScene();
        });
        const doc = serializeScene(root);

        expect(doc.root.components[0]).toMatchObject({ type: 'text', font: 'nacatamalon:square' });
        expect(doc.assets).toHaveLength(0);

        warn = spyOn(console, 'warn').mockImplementation(() => {});
        const again = createTestGame();
        registerScene(again.store, doc.name, sceneFromDoc(doc));
        const rebuilt = serializeScene(startScene(again.store, doc.name));
        expect(rebuilt.root.components[0]).toMatchObject({ type: 'text', font: 'nacatamalon:square' });
        expect(warn).not.toHaveBeenCalled();
    });

    it('paint into pixels by key, outside any scene, each in its own shape', () => {
        const ink = (font: string): number => {
            const pixels = drawText(createPixels(64, 8), 'OK', 0, 0, { font });
            let count = 0;
            for (let i = 3; i < pixels.data.length; i += 4) count += pixels.data[i] > 127 ? 1 : 0;
            return count;
        };

        expect(ink('nacatamalon:square')).toBeGreaterThan(0);
        expect(ink('nacatamalon:thin')).toBeLessThan(ink('nacatamalon:arcade'));
        expect(ink('nacatamalon:square')).toBeGreaterThan(ink('nacatamalon:arcade'));
    });
});
