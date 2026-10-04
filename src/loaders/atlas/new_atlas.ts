import { markWatchable } from '../../store/record_version';
import { newTexture } from '../texture/new_texture';
import type { TLoadedAtlas } from './types/t_loaded_atlas';

/**
 * A sheet that has not loaded yet: no grid, no runs, and an image that has not started either.
 *
 * The image is a record from the start, even though the file has not said which image it is, so
 * a sprite can hold on to something before anything has arrived. Its `src` is filled in once the
 * file is read.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const newAtlas = (src: string, key: string): TLoadedAtlas => markWatchable({
    type: 'atlas',
    key,
    src,
    status: 'loading',
    texture: newTexture('', `${key}:texture`),
    columns: 0,
    rows: 0,
    frames: 0,
    sequences: {},
});
