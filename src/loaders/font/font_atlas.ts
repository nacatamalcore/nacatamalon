/**
 * The picture a vector font keeps its letters in, filled a row at a time as characters are needed.
 *
 * @internal
 */
export type TFontAtlas = {
    width: number;
    height: number;
    /**
     * `width * height` RGBA pixels.
     */
    data: Uint8Array;
    /**
     * Where the next letter goes in the current row, and how tall that row has become.
     */
    x: number;
    y: number;
    rowHeight: number;
    /**
     * The part written since the last upload, or `null` when there is nothing new.
     */
    dirty: { x0: number; y0: number; x1: number; y1: number } | null;
    /**
     * Whether it changed size since the last upload, which needs a new texture rather than an update.
     */
    resized: boolean;
};

const WIDTH = 512;
const START_HEIGHT = 128;
const MAX_HEIGHT = 4096;
/**
 * Space left between two letters, so smoothing one never reads the edge of the next.
 */
const GAP = 1;

/**
 * An empty atlas.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const newFontAtlas = (): TFontAtlas => ({
    width: WIDTH,
    height: START_HEIGHT,
    data: new Uint8Array(WIDTH * START_HEIGHT * 4),
    x: 0,
    y: 0,
    rowHeight: 0,
    dirty: null,
    resized: true,
});

/**
 * Copies a letter's picture into the atlas and says where it went: along the current row, onto a new
 * row when it does not fit, and into an atlas twice as tall when there are no rows left. `null` when
 * the atlas is as big as it gets and still full, which takes thousands of different characters.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const packGlyph = (atlas: TFontAtlas, width: number, height: number, pixels: Uint8Array): { x: number; y: number } | null => {
    if (width + GAP > atlas.width) {
        return null;
    }
    if (atlas.x + width + GAP > atlas.width) {
        atlas.y += atlas.rowHeight + GAP;
        atlas.x = 0;
        atlas.rowHeight = 0;
    }
    while (atlas.y + height + GAP > atlas.height) {
        if (atlas.height * 2 > MAX_HEIGHT) {
            return null;
        }
        const grown = new Uint8Array(atlas.width * atlas.height * 2 * 4);
        grown.set(atlas.data);
        atlas.data = grown;
        atlas.height *= 2;
        atlas.resized = true;
    }

    const x = atlas.x;
    const y = atlas.y;
    for (let row = 0; row < height; row++) {
        atlas.data.set(pixels.subarray(row * width * 4, (row + 1) * width * 4), ((y + row) * atlas.width + x) * 4);
    }
    atlas.x += width + GAP;
    atlas.rowHeight = Math.max(atlas.rowHeight, height);

    const dirty = atlas.dirty;
    if (dirty === null) {
        atlas.dirty = { x0: x, y0: y, x1: x + width, y1: y + height };
    } else {
        dirty.x0 = Math.min(dirty.x0, x);
        dirty.y0 = Math.min(dirty.y0, y);
        dirty.x1 = Math.max(dirty.x1, x + width);
        dirty.y1 = Math.max(dirty.y1, y + height);
    }
    return { x, y };
};
