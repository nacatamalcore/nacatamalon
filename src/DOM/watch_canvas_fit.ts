import { fitCanvas } from './fit_canvas';
import { windowOf } from './window_of';
import type { TCanvasOptions } from './types/t_canvas_options';

/**
 * Keeps the canvas fitted while its container changes size, and returns its own removal.
 *
 * Observes the container, not the window: a splitter resizes the gap without the window
 * noticing. `<body>` is the exception: there the reference is the viewport. Fires are
 * coalesced into one frame, because a free side means every fit resizes the buffer.
 *
 * It also listens for the screen's density changing: a window dragged to another monitor, or the
 * browser zoomed. Nothing about the container may move then, so the observer alone would keep
 * the old density: the buffer of `pixelRatio: 'device'`, and the whole multiple `integer` counts
 * in the screen's pixels.
 *
 * @category Game
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const watchCanvasFit = (canvas: HTMLCanvasElement, read: () => TCanvasOptions): (() => void) => {
    let frame = 0;
    // The canvas's own window: its size and its density, in the window it is shown in.
    const view = windowOf(canvas);

    const schedule = (): void => {
        if (frame) return;
        frame = view.requestAnimationFrame(() => {
            frame = 0;
            fitCanvas(canvas, read());
        });
    };

    const parent = canvas.parentElement;
    const observer = new ResizeObserver(schedule);
    if (parent) observer.observe(parent);

    const onWindowResize = parent === view.document.body ? schedule : null;
    if (onWindowResize) view.addEventListener('resize', onWindowResize);

    // A media query matches one density only, so each change arms a new one for the density the
    // screen has now.
    let density: MediaQueryList | null = null;
    const onDensity = (): void => {
        armDensity();
        schedule();
    };
    const armDensity = (): void => {
        density?.removeEventListener('change', onDensity);
        density = null;
        if (typeof view.matchMedia !== 'function') return;
        density = view.matchMedia(`(resolution: ${view.devicePixelRatio}dppx)`);
        density.addEventListener('change', onDensity);
    };
    armDensity();

    return () => {
        if (frame) view.cancelAnimationFrame(frame);
        observer.disconnect();
        if (onWindowResize) view.removeEventListener('resize', onWindowResize);
        density?.removeEventListener('change', onDensity);
    };
};
