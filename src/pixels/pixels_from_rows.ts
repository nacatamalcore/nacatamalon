import { getColor } from '../color';
import { createPixels } from './create_pixels';
import { bytesOf, put } from './bytes';
import type { TColorOption } from '../color';
import type { TPixels } from './types/t_pixels';

/**
 * What each character of a drawing is: one character to one colour, as anything `getColor` reads
 * (`'#f80058'`, `'pink'`, `0xf80058`, `{ r, g, b, a }`), or `'transparent'`.
 *
 * `'.'` and `' '` are nothing unless the palette says otherwise, so a drawing does not have to name
 * its gaps.
 *
 * @category Pixels
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TPixelPalette = Record<string, TColorOption>;

/**
 * @category Pixels
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TPixelRowsOptions = {
    /**
     * Each character drawn as a square this many pixels across. A whole number, `1` by default.
     */
    scale?: number;
};

/**
 * A sheet of frames drawn from rows, side by side in one picture.
 *
 * @category Pixels
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TPixelSheet = {
    /**
     * Every frame, left to right, in the order they were given.
     */
    pixels: TPixels;
    /**
     * How many frames there are, which is what `createSpriteAtlas` asks for as `columns`.
     */
    columns: number;
    /**
     * Which frame each name is, counted from `0`, for a sprite's animations: `[hero.frames.walkA,
     * hero.frames.walkB]`. Frames given as a list have no names, and this is empty.
     */
    frames: Record<string, number>;
    /**
     * The size of one frame, in pixels, after `scale`.
     */
    frameWidth: number;
    frameHeight: number;
};

/**
 * Nothing, as the palette keeps it: a pixel left as it is.
 */
const NOTHING = null;

/**
 * The palette with every colour read once, so a character is a lookup and a colour that is none is
 * found before anything is drawn.
 */
const readPalette = (palette: TPixelPalette, who: string): Map<string, readonly [number, number, number, number] | null> => {
    if (palette === null || typeof palette !== 'object') {
        throw new Error(`[NacatamalOn] ${who}: the palette is missing. Give one character to one colour: { r: '#f80058' }.`);
    }
    const colors = new Map<string, readonly [number, number, number, number] | null>([['.', NOTHING], [' ', NOTHING]]);
    for (const [key, value] of Object.entries(palette)) {
        if ([...key].length !== 1) {
            throw new Error(`[NacatamalOn] ${who}: the palette names '${key}', and each of its names is one character. Use one per colour.`);
        }
        if (value === 'transparent') {
            colors.set(key, NOTHING);
            continue;
        }
        let bytes: readonly [number, number, number, number];
        try {
            // A number that is none (NaN) would read as black: a typo that looks deliberate.
            if (typeof value === 'number' && !Number.isFinite(value)) {
                throw new Error();
            }
            bytes = bytesOf(getColor(value));
        } catch {
            throw new Error(`[NacatamalOn] ${who}: '${key}' in the palette is ${typeof value === 'string' ? `'${value}'` : String(value)}, which is not a colour. Write it as '#rrggbb', a CSS name or 'transparent'.`);
        }
        if (bytes.some((byte) => !Number.isFinite(byte))) {
            throw new Error(`[NacatamalOn] ${who}: '${key}' in the palette is not a colour. Write it as '#rrggbb', a CSS name or 'transparent'.`);
        }
        colors.set(key, bytes);
    }
    return colors;
};

const scaleOf = (options: TPixelRowsOptions | undefined, who: string): number => {
    const scale = options?.scale ?? 1;
    if (!Number.isInteger(scale) || scale < 1) {
        const said = typeof scale === 'string' ? `'${scale}'` : String(scale);
        throw new Error(`[NacatamalOn] ${who}: scale is ${said}, and it is how many pixels each character takes across. Give a whole number of 1 or more.`);
    }
    return scale;
};

/**
 * Checks one frame against the size every frame has and the palette, and says where it goes wrong:
 * the row and the column, counted from 0 as a picture counts them.
 */
const checkFrame = (
    rows: readonly string[],
    colors: Map<string, unknown>,
    size: { width: number; height: number } | null,
    who: string,
    frame: string,
): { width: number; height: number } => {
    if (!Array.isArray(rows) || rows.length === 0) {
        throw new Error(`[NacatamalOn] ${who}: ${frame === '' ? 'the drawing' : `frame ${frame}`} has no rows. Give at least one, top row first.`);
    }
    const where = frame === '' ? '' : ` of frame ${frame}`;
    if (typeof rows[0] !== 'string') {
        throw new Error(`[NacatamalOn] ${who}: row 0${where} is not text. Every row is a string, one character a pixel.`);
    }
    const width = [...rows[0]].length;
    if (width === 0) {
        throw new Error(`[NacatamalOn] ${who}: the first row${where} is empty. Every row is one character a pixel, and as wide as the first.`);
    }
    if (size !== null && (rows.length !== size.height || width !== size.width)) {
        throw new Error(`[NacatamalOn] ${who}: frame ${frame} is ${width} by ${rows.length}, and the first is ${size.width} by ${size.height}. Every frame of a sheet is the same size.`);
    }
    const names = [...colors.keys()].filter((key) => key !== '.' && key !== ' ').join(', ');
    // A loop and not forEach, which steps over a row left out of the list (['rr', , 'rr']) as if
    // it were not there, and the picture would come out with a gap in it nobody asked for.
    for (let y = 0; y < rows.length; y++) {
        const row = rows[y];
        if (typeof row !== 'string') {
            throw new Error(`[NacatamalOn] ${who}: row ${y}${where} is not text. Every row is a string, one character a pixel.`);
        }
        const characters = [...row];
        if (characters.length !== width) {
            throw new Error(`[NacatamalOn] ${who}: row ${y}${where} is ${characters.length} wide, and the first is ${width}. Every row is as wide.`);
        }
        characters.forEach((character, x) => {
            if (!colors.has(character)) {
                throw new Error(`[NacatamalOn] ${who}: '${character}' at row ${y}, column ${x}${where} is not in the palette${names === '' ? '' : ` (${names})`}. Add it, or use '.' for nothing.`);
            }
        });
    }
    return { width, height: rows.length };
};

/**
 * The widest and tallest a picture drawn this way may come out, which is what a graphics card can
 * hold as one texture almost everywhere. Past it the texture could not be made anyway, and a
 * `scale` typed wrong would ask for gigabytes before saying anything.
 */
const MOST_SIDE = 8192;

const checkSize = (width: number, height: number, who: string): void => {
    if (width > MOST_SIDE || height > MOST_SIDE) {
        throw new Error(`[NacatamalOn] ${who}: the picture would be ${width} by ${height}, and a graphics card holds ${MOST_SIDE} a side at most. Draw it smaller, or with a smaller scale.`);
    }
};

/**
 * Draws one frame onto `pixels` with its top-left corner at `left`, each character as a block of
 * `scale` pixels. Nothing (`'.'`) leaves what is there, which in a new picture is transparent.
 */
const drawFrame = (
    pixels: TPixels,
    rows: readonly string[],
    colors: Map<string, readonly [number, number, number, number] | null>,
    left: number,
    scale: number,
): void => {
    rows.forEach((row, y) => {
        [...row].forEach((character, x) => {
            const bytes = colors.get(character);
            if (bytes === undefined || bytes === null) {
                return;
            }
            for (let dy = 0; dy < scale; dy++) {
                for (let dx = 0; dx < scale; dx++) {
                    put(pixels, left + x * scale + dx, y * scale + dy, bytes[0], bytes[1], bytes[2], bytes[3]);
                }
            }
        });
    });
};

/**
 * A picture drawn as rows of characters, one a pixel, and a palette saying what colour each one is:
 * the way pixel art is written in code. A grid reads in a diff, is edited by hand, and is far
 * harder to get wrong than working out the corners of a `fillRect` for every patch of colour.
 *
 * Top row first, every row as wide. `'.'` and `' '` are left transparent unless the palette names
 * them. A character missing from the palette, or a row of another width, throws, saying which row
 * and column.
 *
 * It needs no game, so a test or a build script can draw one too. Make it a texture with
 * `createPixelTexture`; several frames for an animation are `sheetFromRows`.
 *
 * @param rows - The picture, top row first, one character a pixel.
 * @param palette - What colour each character is.
 * @param options - `scale`, to draw each character as a bigger square.
 * @returns A new picture.
 *
 * @example
 * ```ts
 * const heart = pixelsFromRows([
 *     '.rr.rr.',
 *     'rRrrrrr',
 *     'rrrrrrr',
 *     '.rrrrr.',
 *     '..rrr..',
 *     '...r...',
 * ], { r: '#f80058', R: '#fc98b8' });
 * createSprite({ texture: createPixelTexture(heart) });
 * ```
 *
 * @category Pixels
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const pixelsFromRows = (rows: readonly string[], palette: TPixelPalette, options?: TPixelRowsOptions): TPixels => {
    const who = 'pixelsFromRows';
    const colors = readPalette(palette, who);
    const scale = scaleOf(options, who);
    const size = checkFrame(rows, colors, null, who, '');
    checkSize(size.width * scale, size.height * scale, who);
    const pixels = createPixels(size.width * scale, size.height * scale);
    drawFrame(pixels, rows, colors, 0, scale);
    return pixels;
};

/**
 * Several frames drawn as rows, as `pixelsFromRows` draws one, laid side by side in one picture:
 * a sheet ready to be cut by `createSpriteAtlas`.
 *
 * Given by name (`{ stand, walkA, walkB }`), `frames` says which number each one is, so a sprite's
 * animations name them instead of counting: `{ walk: { frames: [hero.frames.walkA,
 * hero.frames.walkB] } }`. Given as a list, they are numbered in its order. Every frame is the same
 * size, and one that is not throws, naming it.
 *
 * By name, they are laid in the order JavaScript keeps an object's names, which is the order they
 * were written in except that names which are whole numbers (`{ 2: … }`) come first. Frames that are
 * numbered are a list.
 *
 * @param frames - Each frame's rows, by name or in order.
 * @param palette - What colour each character is, shared by every frame.
 * @param options - `scale`, to draw each character as a bigger square.
 * @returns The picture, how many frames it has, which number each name is, and one frame's size.
 *
 * @example
 * ```ts
 * declare const stand: string[], walkA: string[], walkB: string[];
 *
 * const hero = sheetFromRows({ stand, walkA, walkB }, { h: '#3bceac', s: '#ffd23f' });
 * const sprite = createSprite({
 *     atlas: createSpriteAtlas({ texture: createPixelTexture(hero.pixels), columns: hero.columns }),
 * });
 * useSpriteAnimation(sprite, { play: 'walk', clips: { walk: { frames: [hero.frames.walkA, hero.frames.walkB], fps: 6 } } });
 * ```
 *
 * @category Pixels
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const sheetFromRows = (
    frames: Readonly<Record<string, readonly string[]>> | ReadonlyArray<readonly string[]>,
    palette: TPixelPalette,
    options?: TPixelRowsOptions,
): TPixelSheet => {
    const who = 'sheetFromRows';
    if (frames === null || typeof frames !== 'object') {
        throw new Error(`[NacatamalOn] ${who}: no frames were given. Give each frame's rows, by name ({ stand, walk }) or in a list.`);
    }
    const named = !Array.isArray(frames);
    const entries: Array<[string, readonly string[]]> = named
        ? Object.entries(frames as Record<string, readonly string[]>)
        // Array.from and not map, which leaves a frame left out of the list as a hole.
        : Array.from(frames as ReadonlyArray<readonly string[]>, (rows, i): [string, readonly string[]] => [String(i), rows]);
    if (entries.length === 0) {
        throw new Error(`[NacatamalOn] ${who}: no frames were given. Give each frame's rows, by name ({ stand, walk }) or in a list.`);
    }
    const colors = readPalette(palette, who);
    const scale = scaleOf(options, who);

    let size: { width: number; height: number } | null = null;
    for (const [name, rows] of entries) {
        size = checkFrame(rows, colors, size, who, named ? `'${name}'` : name);
    }
    const frameWidth = size!.width * scale;
    const frameHeight = size!.height * scale;

    checkSize(frameWidth * entries.length, frameHeight, who);
    const pixels = createPixels(frameWidth * entries.length, frameHeight);
    const numbers: Record<string, number> = {};
    entries.forEach(([name, rows], i) => {
        drawFrame(pixels, rows, colors, i * frameWidth, scale);
        if (named) {
            // Defined rather than assigned, so a frame read from a file and named '__proto__' is
            // a name like any other and not the object's prototype.
            Object.defineProperty(numbers, name, { value: i, enumerable: true, writable: true, configurable: true });
        }
    });
    return { pixels, columns: entries.length, frames: numbers, frameWidth, frameHeight };
};
