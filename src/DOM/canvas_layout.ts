import type { TCanvasKeep } from './types/t_canvas_keep';
import type { TCanvasLayout } from './types/t_canvas_layout';
import type { TCanvasScaling } from './types/t_canvas_scaling';

/**
 * Below 1× there is no whole number for `integer` to snap to, so it falls back to the exact
 * fit rather than refusing to show the game: shrinking resamples either way.
 */
const roundScale = (raw: number, scaling: TCanvasScaling): number => {
    if (!Number.isFinite(raw) || raw <= 0) return 1;
    if (scaling === 'contain') return raw;
    return raw >= 1 ? Math.floor(raw) : raw;
};

/**
 * Resolves the canvas size from the base resolution and the space available.
 *
 * Scale first, from the sides `keep` pins: they are the only ones with a fixed reference.
 * With nothing pinned the scale would be circular, so `keep: 'none'` stays at 1×.
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
): TCanvasLayout => {
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
        : keep === 'both'   ? roundScale(Math.min(availW / baseWidth, availH / baseHeight), scaling)
        : keep === 'height' ? roundScale(availH / baseHeight, scaling)
        : keep === 'width'  ? roundScale(availW / baseWidth, scaling)
        : 1;

    const lockedW = keep === 'both' || keep === 'width';
    const lockedH = keep === 'both' || keep === 'height';

    // `floor`, not `round`: an unlocked side is multiplied back by `scale` two lines down, so
    // rounding it up overflows the container. With an integer scale of 3 in 500px, `round`
    // gives 167 rows and paints 501px: one pixel is enough for a scrollbar.
    const bufferWidth = lockedW ? baseWidth : Math.max(1, Math.floor(availW / scale));
    const bufferHeight = lockedH ? baseHeight : Math.max(1, Math.floor(availH / scale));

    return {
        bufferWidth,
        bufferHeight,
        cssWidth: Math.round(bufferWidth * scale),
        cssHeight: Math.round(bufferHeight * scale),
        scale,
    };
};
