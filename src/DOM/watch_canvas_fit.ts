import { fitCanvas } from './fit_canvas';
import type { TCanvasOptions } from './types/t_canvas_options';

/**
 * Keeps the canvas fitted while its container changes size, and returns its own removal.
 *
 * Observes the container, not the window: a splitter resizes the gap without the window
 * noticing. `<body>` is the exception: there the reference is the viewport. Fires are
 * coalesced into one frame, because a free side means every fit resizes the buffer.
 *
 * With `pixelRatio: 'device'` it also listens for the screen's density changing: a window dragged
 * to another monitor, or the browser zoomed. Nothing about the container moves then, so the
 * observer alone would keep drawing at the old density.
 *
 * @category Game
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const watchCanvasFit = (canvas: HTMLCanvasElement, read: () => TCanvasOptions): (() => void) => {
    let frame = 0;

    const schedule = (): void => {
        if (frame) return;
        frame = requestAnimationFrame(() => {
            frame = 0;
            fitCanvas(canvas, read());
        });
    };

    const parent = canvas.parentElement;
    const observer = new ResizeObserver(schedule);
    if (parent) observer.observe(parent);

    const onWindowResize = parent === document.body ? schedule : null;
    if (onWindowResize) window.addEventListener('resize', onWindowResize);

    // A media query matches one density only, so each change arms a new one for the density the
    // screen has now. Armed on every fit that asks for `'device'`, and dropped otherwise.
    let density: MediaQueryList | null = null;
    const onDensity = (): void => {
        armDensity();
        schedule();
    };
    const armDensity = (): void => {
        density?.removeEventListener('change', onDensity);
        density = null;
        if (read().pixelRatio !== 'device' || typeof window.matchMedia !== 'function') return;
        density = window.matchMedia(`(resolution: ${window.devicePixelRatio}dppx)`);
        density.addEventListener('change', onDensity);
    };
    armDensity();

    return () => {
        if (frame) cancelAnimationFrame(frame);
        observer.disconnect();
        if (onWindowResize) window.removeEventListener('resize', onWindowResize);
        density?.removeEventListener('change', onDensity);
    };
};
