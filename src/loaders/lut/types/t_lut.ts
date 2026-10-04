import type { ITexture } from '../../../render/interface';
import type { TLoadStatus } from '../../types/t_load_status';

/**
 * A grading table, whatever shape its file had.
 *
 * **One layout, whichever it came from.** A `.cube` is text and a strip is an image, but by the time
 * anything downstream looks at it there is only the strip: N slices side by side, each N by N. Red
 * runs across within a slice, green down it, and blue picks which slice. That is the layout every
 * engine uses, so a table exported for another one drops straight in.
 *
 * @category Assets & loading
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TLut = {
    readonly type: 'lut';
    /**
     * What it is kept under in this game. The `src` unless a `key` was given.
     */
    key: string;
    src: string;
    status: TLoadStatus;
    /**
     * How many steps a side: a 16 table is 16 by 16 by 16. `0` until it lands.
     */
    size: number;
    /**
     * The uploaded strip, `size * size` across and `size` down. `null` until it lands.
     */
    gpu: ITexture | null;
};
