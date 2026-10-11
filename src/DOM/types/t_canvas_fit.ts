import type { TCanvasKeep } from './t_canvas_keep';
import type { TCanvasScaling } from './t_canvas_scaling';

/**
 * How a canvas fits its container, laid over the game's own `scaling`, `keep` and `pixelRatio`
 * while it lasts: what an editor asks for to look at a level through the whole of its window, where
 * the game itself keeps its resolution. Each field left out stays as the game asked.
 *
 * @category Game
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TCanvasFit = {
    scaling?: TCanvasScaling;
    keep?: TCanvasKeep;
    pixelRatio?: number | 'device';
};
