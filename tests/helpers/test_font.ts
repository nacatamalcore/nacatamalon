import type { TBitmapFont, TBitmapFontMeta } from '../../src/loaders';

/**
 * A made-up 8 px font, already loaded: capitals A to E at 8 px wide each except I (4 px), a space
 * 6 px wide, one pixel of tracking, and an 64x16 image. Round numbers so a layout reads at a glance.
 */
export const TEST_FONT_META: TBitmapFontMeta = {
    name: 'Test',
    glyphHeight: 8,
    tracking: 1,
    baseline: 7,
    atlasWidth: 64,
    atlasHeight: 16,
    chars: [
        { char: 'A', x: 0, y: 0, w: 8 },
        { char: 'B', x: 8, y: 0, w: 8 },
        { char: 'C', x: 16, y: 0, w: 8 },
        { char: 'D', x: 24, y: 0, w: 8 },
        { char: 'E', x: 32, y: 0, w: 8 },
        { char: 'I', x: 40, y: 0, w: 4 },
        { char: ' ', x: 48, y: 0, w: 6 },
    ],
};

/**
 * A font record that is ready to draw, with a texture the renderer would accept.
 */
export const createTestFont = (key = 'test-font'): TBitmapFont => ({
    type: 'bitmapFont',
    key,
    src: `${key}.json`,
    status: 'ready',
    texture: { type: 'texture', key: `${key}:texture`, src: `${key}.png`, width: 64, height: 16, status: 'ready', gpu: { resourceType: 'texture' } as never },
    meta: TEST_FONT_META,
});
