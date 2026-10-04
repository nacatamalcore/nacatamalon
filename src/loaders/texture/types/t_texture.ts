import type { ITexture } from '../../../render/interface';
import type { TLoadStatus } from '../../types/t_load_status';

/**
 * A texture asset, returned by `useLoadTexture` the moment it is asked for.
 *
 * It is born `'loading'` with no size, and the loader fills it in place once the image has been
 * fetched, decoded and uploaded. Anything holding it (a sprite) sees the change on its next frame
 * with no re-wiring, which is the whole reason it is mutated rather than replaced.
 *
 * Everything but `gpu` is plain data. `gpu` is a handle into the renderer's memory: runtime only,
 * meaningless to anyone but the backend that made it, and `null` until the upload.
 *
 * @category Assets & loading
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TTexture = {
    type: 'texture';
    /**
     * What it is cached under in this game. The `src` unless a `key` was given.
     */
    key: string;
    /**
     * Where the image comes from.
     */
    src: string;
    /**
     * In pixels. `0` until it is `'ready'`.
     */
    width: number;
    /**
     * In pixels. `0` until it is `'ready'`.
     */
    height: number;
    status: TLoadStatus;
    /**
     * The uploaded texture. `null` while loading and after an error.
     */
    gpu: ITexture | null;
};
