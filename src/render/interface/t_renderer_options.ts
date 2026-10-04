import type { TColor } from '../../color';
import type { TRendererType } from './t_renderer_capabilities';

/**
 * What `createRenderer` is asked for. A subset of `TGameOptions`: only the fields the render
 * layer has any business reading.
 *
 * @category Render
 * @since 1.0.0
 */
export type TRendererOptions = {
    /**
     * Defaults to `'auto'`.
     */
    renderer?: TRendererType;
    /**
     * Requested sample count. A backend that cannot honour it reports what it got.
     */
    msaa?: 1 | 4;
    /**
     * Colour the frame is cleared to. The boot value only: once `frame(ctx)` exists, each
     * pass carries its own `clearColor` and that is what wins, so this is what the screen
     * shows before the first frame rather than a setting the backend keeps.
     */
    background?: TColor;
    /**
     * How textures are filtered when scaled. `false` (nearest) keeps pixel art crisp; `true`
     * (linear) blends neighbouring texels. Chosen once, when the renderer starts.
     */
    smooth?: boolean;
};
