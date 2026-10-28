import type { TGameTarget } from '../game/bootstrap/create_game';
import { nanoId } from '../utils';
import { fitCanvas } from './fit_canvas';
import { createCanvasFullscreen } from './fullscreen';
import { resolveTarget } from './resolve_target';
import { watchCanvasFit } from './watch_canvas_fit';
import type { TCanvasInstance } from './types/t_canvas_instance';
import type { TCanvasOptions } from './types/t_canvas_options';
import type { TCanvasScaling } from './types/t_canvas_scaling';
import type { TCanvasFit } from './types/t_canvas_fit';

/**
 * Puts a canvas on the page for a game to draw into.
 *
 * @category Game
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const createCanvas = (parent: TGameTarget, options: TCanvasOptions): TCanvasInstance => {
    const target = resolveTarget(parent);
    const adopted = target instanceof HTMLCanvasElement;
    const canvas = adopted ? target : document.createElement('canvas');

    const id = nanoId();
    if (!canvas.id) canvas.id = `nacatamalon-canvas-${id}`;
    if (!adopted) target.appendChild(canvas);

    const current = { ...options };
    // The scaling full screen asks for, laid over the game's own while it lasts and dropped after:
    // the options themselves never change, so leaving full screen cannot lose them.
    let override: TCanvasScaling | null = null;
    // A fit a host asks for (an editor's view, see `TCanvasFit`), laid over the game's own the same
    // way, under full screen's scaling.
    let fit: TCanvasFit | null = null;
    const effective = (): TCanvasOptions => {
        const base = fit === null ? current : { ...current, ...fit };
        return override === null ? base : { ...base, scaling: override };
    };
    fitCanvas(canvas, current);

    // Watching the container costs an observer, so it is done only while the fit in force can
    // change with it: a game at 1× with its resolution pinned never needed to.
    const reacts = (o: TCanvasOptions): boolean =>
        (o.scaling ?? 'none') !== 'none' || (o.keep ?? 'both') !== 'both' || o.pixelRatio === 'device';
    let unwatch: (() => void) | null = null;
    const rewatch = (): void => {
        const wants = override !== null || reacts(effective());
        if (wants && unwatch === null) unwatch = watchCanvasFit(canvas, effective);
        if (!wants && unwatch !== null) {
            unwatch();
            unwatch = null;
        }
    };
    rewatch();

    // Full screen is exactly the container changing size, so the canvas watches for as long as it
    // lasts, whatever the fit.
    const fullscreen = createCanvasFullscreen(canvas, () => current.fullscreenScaling ?? 'integer', (next) => {
        override = next;
        rewatch();
        fitCanvas(canvas, effective());
    });

    return {
        id: id,
        canvas,
        fullscreen,
        setFit: (next) => {
            fit = next;
            rewatch();
            fitCanvas(canvas, effective());
        },
        setPixelAspect: (aspect) => {
            current.pixelAspect = aspect;
            fitCanvas(canvas, effective());
        },
        destroy: () => {
            fullscreen.destroy();
            unwatch?.();
            if (!adopted) canvas.remove();
        },
    };
};
