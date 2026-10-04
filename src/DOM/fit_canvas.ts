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
 * Applies `options` to the canvas: buffer, CSS size and filtering. Centring is horizontal
 * only: the vertical axis needs `align-items: center` on the container, which is the host's.
 *
 * The layout is worked out in game pixels, and `pixelRatio` only multiplies the drawing buffer at
 * the end: the CSS size, `scaling` and `keep` do not know it exists. The game's size is
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
    canvas.style.margin = layout.cssWidth < width ? '0 auto' : '';
    canvas.style.width = `${layout.cssWidth}px`;
    canvas.style.height = `${layout.cssHeight}px`;
    canvas.style.imageRendering = options.smooth ? 'auto' : 'pixelated';
};
