import type { TTexture } from './texture/types/t_texture';
import type { TAsset } from './types/t_asset';

/**
 * Who has taken each picture, from the moment they take it: a model still being read has found the
 * pictures of its first pieces long before its pieces are out, and letting go of another model that
 * shares one of them must not take it from under it.
 *
 * Kept both ways, so letting go of something takes it off every picture it wore: a picture that
 * stays while models sharing it come and go must not hold on to every one of them.
 */
const wearers = new WeakMap<TTexture, Set<TAsset>>();
const wornBy = new WeakMap<TAsset, Set<TTexture>>();

/**
 * Notes that `by` wears `texture`. Something already let go of is not noted: a model let go of while
 * it was being read may still come across its pictures on the way.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const wearPicture = (texture: TTexture, by: TAsset): void => {
    if (by.status === 'released') {
        return;
    }
    let held = wearers.get(texture);
    if (held === undefined) {
        held = new Set();
        wearers.set(texture, held);
    }
    held.add(by);
    let pictures = wornBy.get(by);
    if (pictures === undefined) {
        pictures = new Set();
        wornBy.set(by, pictures);
    }
    pictures.add(texture);
};

/**
 * Takes `asset` off every picture it wore, as it is let go of.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const stopWearing = (asset: TAsset): void => {
    for (const texture of wornBy.get(asset) ?? []) {
        wearers.get(texture)?.delete(asset);
    }
    wornBy.delete(asset);
};

/**
 * Whether anything still loaded, or still loading, other than `leaving`, has taken `texture`.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const wornByAnother = (texture: TTexture, leaving: TAsset): boolean => {
    for (const wearer of wearers.get(texture) ?? []) {
        if (wearer !== leaving && wearer.status !== 'released') {
            return true;
        }
    }
    return false;
};

/**
 * Everything noted as wearing `texture`, for a test to see that nothing let go of is still held.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const wearersOf = (texture: TTexture): TAsset[] => [...(wearers.get(texture) ?? [])];
