import { bumpVersion } from '../../store/record_version';
import { uploadTexture } from './upload_texture';
import type { TRuntimeStore } from '../../store';
import type { TTexture } from './types/t_texture';

/**
 * Fetches, decodes and uploads `texture.src`, filling the record in place as it goes.
 *
 * Never rejects. A missing file or a broken image ends as `'error'` with a warning, because one
 * bad texture must not take the scene down, and whatever used it still draws (as its tint).
 *
 * `store` is the game that asked, captured when the hook ran: by the time the image arrives the
 * scene body is long over and there is no active game to look up. If that game has been destroyed
 * in the meantime its device is gone, so nothing is uploaded.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const loadTexture = (store: TRuntimeStore, texture: TTexture): Promise<void> =>
    fetch(texture.src)
        .then((response) => {
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }
            return response.blob();
        })
        .then((blob) => uploadTexture(store, texture, blob))
        .catch((error: unknown) => {
            texture.status = 'error';
            bumpVersion(texture);
            console.warn(`[NacatamalOn] useLoadTexture: '${texture.src}' could not be loaded. Sprites using it draw as their tint.`, error);
        });
