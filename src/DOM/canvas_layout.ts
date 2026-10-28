import type { TCanvasKeep } from './types/t_canvas_keep';
import type { TCanvasLayout } from './types/t_canvas_layout';
import type { TCanvasScaling } from './types/t_canvas_scaling';

/**
 * `integer` counts its whole multiple in the screen's own pixels, not in CSS ones: at a density of
 * 1.25 (Windows at 125%) a CSS 3× is 3.75 of the screen's pixels, and painted with nearest
 * neighbour a game pixel came out 3 wide in some columns and 4 in others. 7 of the screen's pixels
 * is 5.6 CSS ones, and every game pixel is 7 wide. On a density of 2 it also takes the half steps a
 * CSS whole number skipped (3.5×, which is 7 of the screen's pixels).
 *
 * Below 1× there is no whole number to snap to, so it falls back to the exact fit rather than
 * refusing to show the game: shrinking resamples either way.
 */
const roundScale = (raw: number, scaling: TCanvasScaling, density: number): number => {
    if (!Number.isFinite(raw) || raw <= 0) return 1;
    if (scaling === 'contain' || raw < 1) return raw;
    const whole = Math.floor(raw * density);
    return whole >= 1 ? whole / density : raw;
};

/**
 * Resolves the canvas size from the base resolution and the space available.
 *
 * Scale first, from the sides `keep` pins: they are the only ones with a fixed reference.
 * With nothing pinned the scale would be circular, so `keep: 'none'` stays at 1×.
 *
 * @param density The screen's pixels to a CSS one (`devicePixelRatio`): what `integer` counts its
 * whole multiple in, and what the CSS size is rounded to.
 *
 * @category Game
 * @since 1.0.0
 */
export const computeCanvasLayout = (
    baseWidth: number,
    baseHeight: number,
    availWidth: number,
    availHeight: number,
    scaling: TCanvasScaling,
    keep: TCanvasKeep,
    density = 1,
): TCanvasLayout => {
    const screen = Number.isFinite(density) && density > 0 ? density : 1;
    const availW = Number.isFinite(availWidth) && availWidth > 0 ? availWidth : baseWidth;
    const availH = Number.isFinite(availHeight) && availHeight > 0 ? availHeight : baseHeight;

    if (scaling === 'fill') {
        return {
            bufferWidth: baseWidth,
            bufferHeight: baseHeight,
            cssWidth: Math.round(availW),
            cssHeight: Math.round(availH),
            scale: 1,
        };
    }

    const scale =
        scaling === 'none' ? 1
        : keep === 'both'   ? roundScale(Math.min(availW / baseWidth, availH / baseHeight), scaling, screen)
        : keep === 'height' ? roundScale(availH / baseHeight, scaling, screen)
        : keep === 'width'  ? roundScale(availW / baseWidth, scaling, screen)
        : 1;

    const lockedW = keep === 'both' || keep === 'width';
    const lockedH = keep === 'both' || keep === 'height';

    // `floor`, not `round`: an unlocked side is multiplied back by `scale` two lines down, so
    // rounding it up overflows the container. With an integer scale of 3 in 500px, `round`
    // gives 167 rows and paints 501px: one pixel is enough for a scrollbar.
    const bufferWidth = lockedW ? baseWidth : Math.max(1, Math.floor(availW / scale));
    const bufferHeight = lockedH ? baseHeight : Math.max(1, Math.floor(availH / scale));

    // Rounded to the screen's pixels, not to whole CSS ones: 160 game pixels 7 of the screen's wide
    // at 1.25 are 896 CSS pixels exactly, and 853.33 at 1.5, which a whole CSS pixel would spoil.
    return {
        bufferWidth,
        bufferHeight,
        cssWidth: Math.round(bufferWidth * scale * screen) / screen,
        cssHeight: Math.round(bufferHeight * scale * screen) / screen,
        scale,
    };
};
