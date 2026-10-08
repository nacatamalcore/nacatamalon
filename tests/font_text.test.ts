import { describe, expect, it, spyOn } from 'bun:test';
import { createScene } from '../src/scene/create_scene';
import { createText } from '../src/gameobjects/text/create_text';
import { layoutFontText } from '../src/gameobjects/text/layout_font_text';
import { useLoadFont } from '../src/hooks/loaders/use_load_font';
import { useLoadBitmapFont } from '../src/hooks/loaders/use_load_bitmap_font';
import { useLoader } from '../src/hooks/loaders/use_loader';
import { fillFrameContext } from '../src/game/loop/fill_frame_context';
import { whenLoaded } from '../src/loaders/track_load';
import { newFontAtlas, packGlyph } from '../src/loaders/font/font_atlas';
import { buildTtf, createTestVectorFont, TEST_TTF_SPEC } from './helpers/test_ttf';
import { createTestGame, startTestScene } from './helpers/test_game';
import { createTestFont } from './helpers/test_font';
import type { TFrameContext } from '../src/render';
import type { TDrawSprite } from '../src/render/interface';
import type { TFont } from '../src/loaders';
import type { TRuntimeStore } from '../src/store';

const drawn = (store: TRuntimeStore): TDrawSprite[] => {
    const ctx: TFrameContext = { passes: [{}], time: 0, progress: 0, phase: 0 };
    fillFrameContext(store, ctx);
    return (ctx.passes[0].drawables ?? []).filter((d): d is TDrawSprite => d.type === 'sprite');
};

/**
 * A loaded test font, kerned "I" then "A" by -100 units, in a game of its own.
 */
const kerned = () => {
    const { store, renderer } = createTestGame();
    const font = createTestVectorFont(store, { ...TEST_TTF_SPEC, kern: [[1, 2, -100]] });
    return { store, renderer, font };
};

const respond = (bytes: Uint8Array): Response => new Response(bytes.slice().buffer, { status: 200 });

describe('layoutFontText', () => {
    // 1000 units to the em, so a fontSize of 20 makes every 1000 units 20 pixels.
    it('advances by the font\'s own advances, scaled by fontSize over its units', () => {
        const { font } = kerned();
        const layout = layoutFontText('II', { fontSize: 20 }, font);

        // "I" advances 600 units: 12 pixels.
        expect(layout.width).toBe(24);
        // Ascender 800, descender -200, no gap: the line is 1000 units.
        expect(layout.height).toBe(20);
        expect(layout.placements).toHaveLength(2);
        expect(layout.placements[1]!.x - layout.placements[0]!.x).toBeCloseTo(12);
    });

    it('applies the font\'s kerning between two characters', () => {
        const { font } = kerned();
        // I (600) then A (700), 100 units closer: 1200 units.
        expect(layoutFontText('IA', { fontSize: 20 }, font).width).toBeCloseTo(24);
        // The other way round has no pair.
        expect(layoutFontText('AI', { fontSize: 20 }, font).width).toBeCloseTo(26);
    });

    it('places each letter on the baseline by its own bearings, at any size', () => {
        const { font } = kerned();
        const small = layoutFontText('I', { fontSize: 10 }, font).placements[0]!;
        const large = layoutFontText('I', { fontSize: 40 }, font).placements[0]!;
        // Everything scales together: four times the size is four times every number.
        expect(large.x).toBeCloseTo(small.x * 4);
        expect(large.y).toBeCloseTo(small.y * 4);
        expect(large.width).toBeCloseTo(small.width * 4);
        // The picture reaches past the outline by the field's padding: the letter is 7 em-tenths tall.
        expect(small.height).toBeGreaterThan(7);
    });

    it('adds letterSpacing between characters, stacks lines and aligns them', () => {
        const { font } = kerned();
        expect(layoutFontText('AA', { fontSize: 20, letterSpacing: 3 }, font).width).toBeCloseTo(31);

        const layout = layoutFontText('A\nAAA', { fontSize: 20, lineSpacing: 4, align: 'right' }, font);
        expect(layout.width).toBeCloseTo(42);
        expect(layout.height).toBe(44);
        // The short line is pushed over by the difference, and the second line sits a line and a
        // gap lower than the first.
        const [first, second] = layout.placements;
        expect(first!.x - second!.x).toBeCloseTo(28);
        expect(second!.y - first!.y).toBeCloseTo(24);
    });

    it('takes up the space of a space without drawing one, and draws the missing glyph for a character the font lacks', () => {
        const { font } = kerned();
        const spaced = layoutFontText('A A', { fontSize: 20 }, font);
        expect(spaced.placements).toHaveLength(2);
        expect(spaced.width).toBeCloseTo(14 + 5 + 14);

        const missing = layoutFontText('Z', { fontSize: 20 }, font);
        expect(missing.placements).toHaveLength(1);
        // The missing glyph's advance, 500 units.
        expect(missing.width).toBeCloseTo(10);
    });

    it('lays out nothing until the font is ready', () => {
        const { store } = createTestGame();
        const font = createTestVectorFont(store);
        font.status = 'loading';
        expect(layoutFontText('AAA', {}, font).placements).toHaveLength(0);
    });
});

describe('createText with a vector font', () => {
    const scene = (store: TRuntimeStore, font: TFont, text = 'IA') => {
        let made!: ReturnType<typeof createText>;
        startTestScene(store, 'Level', () => {
            made = createText({ text, font, style: { fontSize: 24 }, transform: { x: 10, y: 20 } });
            return createScene();
        });
        return made;
    };

    it('reaches the renderer as distance-field sprites, always smoothed', () => {
        const { store, font } = kerned();
        scene(store, font);
        const sprites = drawn(store);

        expect(sprites).toHaveLength(2);
        expect(sprites.every((s) => s.texture === font.texture && s.distanceField === true && s.smooth === true)).toBe(true);
        // Inside the atlas.
        for (const sprite of sprites) {
            expect(sprite.uvOffset!.x).toBeGreaterThanOrEqual(0);
            expect(sprite.uvOffset!.x + sprite.uvScale!.x).toBeLessThanOrEqual(1);
            expect(sprite.uvOffset!.y + sprite.uvScale!.y).toBeLessThanOrEqual(1);
        }
    });

    it('sends only new letters to the screen, and nothing on a frame with none', () => {
        const { store, renderer, font } = kerned();
        const text = scene(store, font);
        drawn(store);
        const before = renderer.dataUpdates.length;

        drawn(store);
        expect(renderer.dataUpdates.length).toBe(before);

        text.text = 'IAO';
        drawn(store);
        expect(renderer.dataUpdates.length).toBe(before + 1);
        const update = renderer.dataUpdates.at(-1)!;
        expect(update.texture).toBe(font.texture.gpu!);
        expect(update.region!.width).toBeGreaterThan(0);
    });

    it('keeps bitmap texts exactly as they were: no distance field on their sprites', () => {
        const { store } = createTestGame();
        startTestScene(store, 'Level', () => {
            createText({ text: 'AB', font: createTestFont() });
            return createScene();
        });
        expect(drawn(store).every((s) => s.distanceField === undefined)).toBe(true);
    });
});

describe('useLoadFont', () => {
    it('loads a .ttf, reads it and gets the characters it was asked for ready', async () => {
        const { store, renderer } = createTestGame();
        const fetchSpy = spyOn(globalThis, 'fetch').mockImplementation((async () => respond(buildTtf(TEST_TTF_SPEC))) as unknown as typeof fetch);
        let font!: TFont;
        let counted = 0;
        startTestScene(store, 'Level', () => {
            font = useLoadFont({ src: '/fonts/test.ttf', chars: 'IAO' });
            // The same font asked twice is loaded once and listed once.
            useLoadFont({ src: '/fonts/test.ttf' });
            counted = useLoader([font]).total;
            return createScene();
        });
        expect(font.status).toBe('loading');
        expect(counted).toBe(1);

        await whenLoaded(font);
        expect(font.status).toBe('ready');
        expect(font.meta).toMatchObject({ name: 'Test Sans', unitsPerEm: 1000, ascender: 800 });
        expect(font.texture.status).toBe('ready');
        expect(font.meta!.atlasWidth).toBe(font.texture.width);
        expect(store.get('assets').fonts.size).toBe(1);
        // The three letters were drawn while loading, so showing them sends nothing new.
        startTestScene(store, 'Again', () => {
            createText({ text: 'OIA', font });
            return createScene();
        });
        const before = renderer.dataUpdates.length;
        drawn(store);
        expect(renderer.dataUpdates.length).toBe(before);
        fetchSpy.mockRestore();
    });

    it('ends in error with a warning for a kind of font it does not read', async () => {
        const { store } = createTestGame();
        const otf = Uint8Array.from([0x4f, 0x54, 0x54, 0x4f, ...new Array(40).fill(0)]);
        const fetchSpy = spyOn(globalThis, 'fetch').mockImplementation((async () => respond(otf)) as unknown as typeof fetch);
        const warn = spyOn(console, 'warn').mockImplementation(() => {});
        let font!: TFont;
        startTestScene(store, 'Level', () => {
            font = useLoadFont({ src: '/fonts/test.otf' });
            createText({ text: 'A', font });
            return createScene();
        });

        await whenLoaded(font);
        expect(font.status).toBe('error');
        expect(String(warn.mock.calls[0]![1])).toContain('cubic curves');
        expect(drawn(store)).toHaveLength(0);
        warn.mockRestore();
        fetchSpy.mockRestore();
    });

    it('is kept under its key for the whole game, so another scene gets the same font without loading it again', async () => {
        const { store } = createTestGame();
        const fetchSpy = spyOn(globalThis, 'fetch').mockImplementation((async () => respond(buildTtf(TEST_TTF_SPEC))) as unknown as typeof fetch);
        let first!: TFont;
        let second!: TFont;
        startTestScene(store, 'Title', () => {
            first = useLoadFont({ src: '/fonts/test.ttf', key: 'ui' });
            return createScene();
        });
        await whenLoaded(first);
        startTestScene(store, 'Level', () => {
            // The same key, even from another path, is the same font: no second fetch.
            second = useLoadFont({ src: '/fonts/other.ttf', key: 'ui' });
            return createScene();
        });

        expect(second).toBe(first);
        expect(first.key).toBe('ui');
        expect(second.status).toBe('ready');
        expect(fetchSpy).toHaveBeenCalledTimes(1);
        expect([...store.get('assets').fonts.keys()]).toEqual(['ui']);
        fetchSpy.mockRestore();
    });

    it('lets one scene load the fonts and the others name them by key alone', async () => {
        const { store } = createTestGame();
        // The bitmap font is only named here, never drawn, so its files failing to arrive is beside the point.
        const warn = spyOn(console, 'warn').mockImplementation(() => {});
        const fetchSpy = spyOn(globalThis, 'fetch').mockImplementation((async () => respond(buildTtf(TEST_TTF_SPEC))) as unknown as typeof fetch);
        let loaded!: TFont;
        startTestScene(store, 'Loading', () => {
            loaded = useLoadFont({ src: '/fonts/test.ttf', key: 'title' });
            useLoadBitmapFont({ json: '/fonts/arcade.json', atlas: '/fonts/arcade.png', key: 'arcade' });
            return createScene();
        });
        await whenLoaded(loaded);

        let title!: ReturnType<typeof createText>;
        let score!: ReturnType<typeof createText>;
        startTestScene(store, 'Level', () => {
            // No loader here: just the keys the loading scene used, as the font.
            title = createText({ text: 'IA', font: 'title' });
            score = createText({ text: 'SCORE', font: 'arcade' });
            return createScene();
        });

        expect(title.font).toBe(loaded);
        expect(score.font).toBe(store.get('assets').bitmapFonts.get('arcade')!);
        expect(drawn(store).filter((s) => s.distanceField === true)).toHaveLength(2);
        fetchSpy.mockRestore();
        warn.mockRestore();
    });

    it('says which key is missing rather than falling back to another font', () => {
        const { store } = createTestGame();
        expect(() => startTestScene(store, 'Level', () => {
            createText({ text: 'A', font: 'titel' });
            return createScene();
        })).toThrow("no font loaded under key 'titel'");
    });

    it('refuses to be called outside a scene body', () => {
        expect(() => useLoadFont({ src: '/f.ttf' })).toThrow('[NacatamalOn] useLoadFont');
    });
});

describe('the font atlas', () => {
    it('fills rows, then grows taller keeping what it had', () => {
        const atlas = newFontAtlas();
        const tile = new Uint8Array(100 * 100 * 4).fill(7);
        const places = [];
        for (let i = 0; i < 12; i++) places.push(packGlyph(atlas, 100, 100, tile)!);

        // Five to a 512-wide row, with a pixel between them.
        expect(places.slice(0, 6).map((p) => [p.x, p.y])).toEqual([[0, 0], [101, 0], [202, 0], [303, 0], [404, 0], [0, 101]]);
        expect(atlas.height).toBe(512);
        expect(atlas.resized).toBe(true);
        // The first letter survived the growing.
        expect(atlas.data[0]).toBe(7);
        expect(atlas.data[(99 * atlas.width + 99) * 4]).toBe(7);
        // And the gap stayed empty.
        expect(atlas.data[100 * 4]).toBe(0);
    });

    it('says so when it can grow no more', () => {
        const atlas = newFontAtlas();
        const tile = new Uint8Array(500 * 500 * 4);
        let last: { x: number; y: number } | null = { x: 0, y: 0 };
        for (let i = 0; i < 20 && last !== null; i++) last = packGlyph(atlas, 500, 500, tile);
        expect(last).toBeNull();
        expect(atlas.height).toBe(4096);
    });
});
