import { bumpVersion } from '../../store/record_version';
import type { TRuntimeStore } from '../../store';
import type { TTexture } from './types/t_texture';

/**
 * Decodes picture bytes, uploads them and marks the record ready.
 *
 * Its own function because a picture reaches the engine two ways and the second half is the same
 * both times: fetched from a file of its own, or lifted out of the middle of a model that carries
 * its pictures inside it. Keeping one place where a picture becomes a texture is what keeps the two
 * from drifting, and in particular keeps them agreeing about how transparency is stored.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const uploadTexture = async (store: TRuntimeStore, texture: TTexture, blob: Blob): Promise<void> => {
    // `premultiplyAlpha: 'none'` is required: the blend state and the shader assume straight
    // alpha, and the two backends would disagree about a premultiplied bitmap.
    const bitmap = await createImageBitmap(blob, { premultiplyAlpha: 'none' });

    if (store.get('loop').destroyed) {
        bitmap.close();
        return;
    }
    texture.width = bitmap.width;
    texture.height = bitmap.height;
    // The renderer takes the bitmap and decides when to close it: WebGL2 keeps it to upload
    // it again if its context is lost.
    texture.gpu = store.get('screen').renderer.createTexture(bitmap);
    texture.status = 'ready';
    bumpVersion(texture);
};
