import type { TAnimationClip } from '../../../hooks';
import type { TLoadStatus } from '../../types/t_load_status';
import type { TTexture } from '../../texture/types/t_texture';
import type { TAtlasFrame } from '../../../atlas/types/t_sprite_atlas';

/**
 * A sheet described by a file: the image, how it is cut, and the runs of frames over it.
 *
 * It is a sheet **and** a load at once. Once it is `'ready'` it is exactly what `createSprite`
 * and `useSpriteAnimation` take, and until then it is something `useLoader` counts, like an
 * image.
 *
 * @category Assets & loading
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TLoadedAtlas = {
    readonly type: 'atlas';
    /**
     * What it is cached under: the key given, or the path.
     */
    key: string;
    /**
     * Where the file is.
     */
    src: string;
    /**
     * How it is doing. A sheet that failed reports `'error'` and slices nothing.
     */
    status: TLoadStatus;
    /**
     * The image the file names, loaded with it.
     */
    texture: TTexture;
    /**
     * How many frames across. `0` until the image has landed and the grid can be worked out.
     */
    columns: number;
    /**
     * How many frames down. `0` until then.
     */
    rows: number;
    /**
     * How many frames in total. `0` until then.
     */
    frames: number;
    /**
     * The window of every frame, as the file cuts the image. Filled in with the grid.
     */
    rects?: readonly TAtlasFrame[];
    /**
     * Where each named frame of a packed sheet sits in the count, by name. A map's tile can name
     * its frame instead of counting to it, and this is what turns the name into the place.
     */
    names?: Record<string, number>;
    /**
     * The runs the file declares, by name, ready for `useSpriteAnimation`.
     */
    sequences: Record<string, TAnimationClip>;
};
