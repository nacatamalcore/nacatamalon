import type { TLoadStatus } from './t_load_status';

/**
 * Anything `useLoader` can track: the one field every asset record shares, so the loader never
 * has to know whether it is looking at a texture, a sound or a font.
 *
 * @category Assets & loading
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TLoadable = {
    status: TLoadStatus;
};
