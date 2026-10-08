import type { TPixels } from '../../../pixels/types/t_pixels';
import type { TLoadStatus } from '../../types/t_load_status';

/**
 * A picture file loaded as pixels, to process in code: what `useLoadPixels` hands back.
 *
 * `pixels` is `null` until `status` is `'ready'`. Read it as much as you like (a collision mask, a
 * level drawn as an image); to change it, hand the record to `createPixelTexture` with a function,
 * which paints on a copy. The picture is **shared** by everyone who loaded the same file, so painting
 * on it directly would change it for all of them.
 *
 * @category Pixels
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TLoadedPixels = {
    readonly type: 'loaded-pixels';
    /**
     * What it is cached under in this game. The `src` unless a `key` was given.
     */
    key: string;
    /**
     * Where the file comes from.
     */
    src: string;
    status: TLoadStatus;
    /**
     * The picture, once it has arrived.
     */
    pixels: TPixels | null;
};
