/**
 * Where the game sits in its container when the container is bigger than the game: which side the
 * space left over goes to. It never changes the game's size, which `scaling` decides first; with
 * nothing left over (`'fill'`, or a `keep` that shows more world instead) there is nothing to place.
 *
 * - `'center'`: in the middle both ways.
 * - `'top'`, `'bottom'`: against that edge, in the middle across.
 * - `'left'`, `'right'`: against that edge, in the middle up and down.
 * - `'top-left'`, `'top-right'`, `'bottom-left'`, `'bottom-right'`: in that corner.
 *
 * The names are in `RENDER.ALIGN` too: `RENDER.ALIGN.TOP_LEFT` is `'top-left'`.
 *
 * @category Game
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TCanvasAlign =
    | 'center'
    | 'top'
    | 'bottom'
    | 'left'
    | 'right'
    | 'top-left'
    | 'top-right'
    | 'bottom-left'
    | 'bottom-right';

/**
 * Every `TCanvasAlign`, for the ones that check a value against them.
 *
 * @internal
 */
export const CANVAS_ALIGNS: readonly TCanvasAlign[] = ['center', 'top', 'bottom', 'left', 'right', 'top-left', 'top-right', 'bottom-left', 'bottom-right'];
