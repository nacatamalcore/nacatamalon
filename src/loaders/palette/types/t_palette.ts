import type { ITexture } from '../../../render/interface';
import type { TLoadStatus } from '../../types/t_load_status';

/**
 * A `.palette` file as it is written on disk.
 *
 * Plain JSON, because a palette is the one part of this whole feature that is **data rather than
 * arithmetic**: everything else the engine can work out, and these are colours somebody chose.
 *
 * @category Assets & loading
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TPaletteDoc = {
    format: number;
    kind: 'palette';
    /**
     * What a person calls it. The file's name is its identity; this is only read.
     */
    name: string;
    /**
     * The colours, as `#rrggbb`.
     *
     * The order means nothing to the matching, which walks all of them anyway, and it is kept all
     * the same because it is how whoever made the palette arranged it.
     */
    colors: string[];
};

/**
 * A palette asset, handed back the moment it is asked for and filled in when the file lands.
 *
 * Its picture is one row of pixels, one per colour, which is how the card reads it: an effect asks
 * how many there are and then for the *n*th, and neither question needs a second dimension.
 *
 * @category Assets & loading
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TPalette = {
    readonly type: 'palette';
    /**
     * What it is kept under in this game. The `src` unless a `key` was given.
     */
    key: string;
    src: string;
    status: TLoadStatus;
    /**
     * What the file called it, or an empty string until it lands.
     */
    name: string;
    /**
     * The colours as written, in file order. Empty until it lands.
     */
    colors: string[];
    /**
     * The uploaded row. `null` while loading and after an error.
     */
    gpu: ITexture | null;
};
