/**
 * The game's size on a canvas, in the game's own pixels, and how many real pixels each one is
 * drawn with.
 */
export type TScreenSize = {
    width: number;
    height: number;
    pixelRatio: number;
};

/**
 * What `fitCanvas` last worked out for each canvas.
 *
 * Kept beside the canvas rather than read back from it, because with a `pixelRatio` the canvas's
 * own `width` is the drawing buffer (the real pixels) and no longer the game's size. Dividing it
 * back would not be exact either: at `1.5` a 255-pixel game is a 383-pixel buffer, and 383 / 1.5
 * is not 255.
 */
const sizes = new WeakMap<HTMLCanvasElement, TScreenSize>();

/**
 * How many real pixels a game pixel gets: the number asked for, or the screen's own for `'device'`.
 *
 * `'device'` is read every time rather than once, so a window dragged to another monitor (or a
 * browser zoom) is picked up by the next fit.
 */
export const resolvePixelRatio = (asked: number | 'device' | undefined): number => {
    if (asked === 'device') {
        const device = typeof window === 'undefined' ? 1 : window.devicePixelRatio;
        return Number.isFinite(device) && device > 0 ? device : 1;
    }
    return asked ?? 1;
};

/**
 * Remembers the size `fitCanvas` just gave a canvas.
 */
export const rememberScreenSize = (canvas: HTMLCanvasElement, size: TScreenSize): void => {
    sizes.set(canvas, size);
};

/**
 * The game's size on this canvas, in game pixels, and its pixel ratio.
 *
 * Everything that measures in the game's pixels (the cameras, the pointer, the listener, a
 * capture) asks here instead of reading `canvas.width`. A canvas no fit has touched, one a test
 * made by hand, is taken at its word: its buffer is its size, at a ratio of 1.
 */
export const screenSizeOf = (canvas: HTMLCanvasElement): TScreenSize =>
    sizes.get(canvas) ?? { width: canvas.width, height: canvas.height, pixelRatio: 1 };
