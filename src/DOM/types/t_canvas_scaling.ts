/**
 * How much the game's image is magnified. **Writes CSS, never the drawing buffer**: the game
 * keeps drawing the same number of pixels, only the size they are painted at changes.
 *
 * - `'none'`: 1×. The canvas is painted at exactly `width × height` CSS pixels and ignores
 *   the space around it. The default, and what a fixed-size embed wants.
 * - `'integer'`: the largest **whole** multiple that fits (2×, 3×, 4×…). The pixel-art one:
 *   every game pixel lands on an exact square block, so nothing is resampled and no row ends
 *   up one pixel taller than its neighbour. Leaves bars when the fit is not exact. Below 1×
 *   there is no whole number to snap to, so it falls back to the exact fit.
 * - `'contain'`: the largest fit, fractions allowed (2.37×). Fills more of the container than
 *   `'integer'` and keeps the aspect ratio, at the cost of resampling: pixel art shimmers,
 *   smooth art does not care.
 * - `'fill'`: stretched to the container on both axes, aspect ratio broken. The only value
 *   that **ignores `keep`**: the buffer stays at the base resolution and CSS does the
 *   distorting. For a background or an effect where the shape does not matter.
 *
 * Pairs with {@link TCanvasKeep}, which is the other axis and decides how much world is drawn.
 *
 * @category Game
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TCanvasScaling = 'none' | 'integer' | 'contain' | 'fill';
