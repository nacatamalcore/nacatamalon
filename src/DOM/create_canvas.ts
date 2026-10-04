import type { TGameTarget } from '../game/bootstrap/create_game';
import { nanoId } from '../utils';
import { fitCanvas } from './fit_canvas';
import { createCanvasFullscreen } from './fullscreen';
import { resolveTarget } from './resolve_target';
import { watchCanvasFit } from './watch_canvas_fit';
import type { TCanvasInstance } from './types/t_canvas_instance';
import type { TCanvasOptions } from './types/t_canvas_options';
import type { TCanvasScaling } from './types/t_canvas_scaling';

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

    const current = options;
    // The scaling full screen asks for, laid over the game's own while it lasts and dropped after:
    // the options themselves never change, so leaving full screen cannot lose them.
    let override: TCanvasScaling | null = null;
    const effective = (): TCanvasOptions => (override === null ? current : { ...current, scaling: override });
    fitCanvas(canvas, current);

    const reactive =
        (current.scaling ?? 'none') !== 'none' || (current.keep ?? 'both') !== 'both' || current.pixelRatio === 'device';
    let unwatch = reactive ? watchCanvasFit(canvas, effective) : null;

    // A game at 1× never needed to watch its container, and full screen is exactly the container
    // changing size, so it watches for as long as full screen lasts and stops after.
    const fullscreen = createCanvasFullscreen(canvas, () => current.fullscreenScaling ?? 'integer', (next) => {
        override = next;
        if (override !== null && unwatch === null) unwatch = watchCanvasFit(canvas, effective);
        if (override === null && !reactive && unwatch !== null) {
            unwatch();
            unwatch = null;
        }
        fitCanvas(canvas, effective());
    });

    return {
        id: id,
        canvas,
        fullscreen,
        destroy: () => {
            fullscreen.destroy();
            unwatch?.();
            if (!adopted) canvas.remove();
        },
    };
};
