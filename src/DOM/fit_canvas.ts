import { computeCanvasLayout } from './canvas_layout';
import { rememberScreenSize, resolvePixelRatio } from './screen_size';
import type { TCanvasOptions } from './types/t_canvas_options';

/**
 * Measures the space the canvas lives in. `<body>` does not count: an unstyled one is as
 * tall as its content, which by now is the canvas, so it would scale against itself.
 */
const measure = (canvas: HTMLCanvasElement): { width: number; height: number } => {
    const parent = canvas.parentElement;
    const container = parent === document.body ? null : parent;
    return container
        ? { width: container.clientWidth, height: container.clientHeight }
        : { width: window.innerWidth, height: window.innerHeight };
};

/**
 * The smallest margin, in CSS pixels, that starts the canvas on a whole pixel of the screen as the
 * browser lays it out: a whole number of the screen's pixels, and a whole number of the 1/64 of a CSS
 * pixel the browser places things in. A margin that is only the first (46.4 at a density of 1.25,
 * 58 of the screen's) is laid out at 46.40625, a hair past the pixel, and Chromium painted a third
 * of the columns a pixel narrower or wider. 1 at a density of 1, 4 at 1.25, 2 at 1.5, half at 2.
 */
const centringStep = (density: number): number => {
    for (let pixels = 1; pixels <= 64; pixels++) {
        const units = pixels * 64 / density;
        if (Math.abs(units - Math.round(units)) < 1e-6) return pixels / density;
    }
    return 1;
};

/**
 * Applies `options` to the canvas: buffer, CSS size and filtering. Centring is horizontal
 * only: the vertical axis needs `align-items: center` on the container, which is the host's.
 *
 * The layout is worked out in game pixels, and `pixelRatio` only multiplies the drawing buffer at
 * the end: the CSS size, `scaling` and `keep` do not know it exists. The screen's density is
 * another thing: `integer` counts its whole multiple in the screen's pixels. The game's size is
 * remembered beside the canvas (`screenSizeOf`), because the buffer is no longer it.
 *
 * @category Game
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const fitCanvas = (canvas: HTMLCanvasElement, options: TCanvasOptions): void => {
    const { width, height } = measure(canvas);
    const layout = computeCanvasLayout(
        options.width,
        options.height,
        width,
        height,
        options.scaling ?? 'none',
        options.keep ?? 'both',
        resolvePixelRatio('device'),
        options.pixelAspect ?? 1,
    );

    const pixelRatio = resolvePixelRatio(options.pixelRatio);
    const bufferWidth = Math.max(1, Math.round(layout.bufferWidth * pixelRatio));
    const bufferHeight = Math.max(1, Math.round(layout.bufferHeight * pixelRatio));
    rememberScreenSize(canvas, { width: layout.bufferWidth, height: layout.bufferHeight, pixelRatio });

    // Assigning `canvas.width` CLEARS the buffer even when the value is unchanged, so an
    // observer firing every frame would blank the game. Only write when it actually moved.
    if (canvas.width !== bufferWidth) canvas.width = bufferWidth;
    if (canvas.height !== bufferHeight) canvas.height = bufferHeight;

    canvas.style.display = 'block';
    // Centred by hand: `margin: auto` put it half the leftover in, and with the leftover odd that is
    // part of one of the screen's pixels (46.5 CSS pixels at a density of 1.5 is 69.75 of the
    // screen's), where a game pixel 6 of them wide was painted 5 in some columns and 7 in others,
    // whole multiple and all. See `centringStep` for what it is rounded to.
    const step = centringStep(resolvePixelRatio('device'));
    canvas.style.margin = layout.cssWidth < width ? `0 0 0 ${Math.floor((width - layout.cssWidth) / 2 / step) * step}px` : '';
    canvas.style.width = `${layout.cssWidth}px`;
    canvas.style.height = `${layout.cssHeight}px`;
    // The shape it is painted at, written out too: a page that sets `height: auto` on a canvas, as
    // many style sheets do so it shrinks with its width, would otherwise take the buffer's shape and
    // undo a `pixelAspect` (8:7 drawn 1.143 instead of 1.306). With the ratio said, `auto` follows it.
    canvas.style.aspectRatio = `${layout.cssWidth} / ${layout.cssHeight}`;
    canvas.style.imageRendering = options.smooth ? 'auto' : 'pixelated';
};
