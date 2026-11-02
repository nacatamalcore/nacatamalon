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
 * Wearers that count only while something draws them: effects written in code. Nothing lets one of
 * those go (it is in no cache, so `releaseAsset` never sees it), so what ends its hold on a picture
 * is its last emitter going. Held weakly, so being one keeps nothing alive.
 */
const whileDrawn = new WeakSet<TAsset>();

/**
 * Whether `wearer` still wants its picture: not let go of, and, for one that counts only while drawn,
 * with an emitter.
 */
const wants = (wearer: TAsset): boolean =>
    wearer.status !== 'released'
    && (!whileDrawn.has(wearer) || ((wearer as { bound?: readonly unknown[] }).bound?.length ?? 0) > 0);

/**
 * Notes that `by` wears `texture`. Something already let go of is not noted: a model let go of while
 * it was being read may still come across its pictures on the way. `drawn` for one that counts only
 * while it has emitters.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const wearPicture = (texture: TTexture, by: TAsset, drawn = false): void => {
    if (by.status === 'released') {
        return;
    }
    if (drawn) {
        whileDrawn.add(by);
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
 * The pictures `asset` has taken: its pieces' if it has them, and what it had found so far if it was
 * let go of or failed before they came out.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const picturesWornBy = (asset: TAsset): TTexture[] => [...(wornBy.get(asset) ?? [])];

/**
 * Whether anything still loaded, or still loading, other than `leaving`, has taken `texture`.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const wornByAnother = (texture: TTexture, leaving: TAsset): boolean => {
    for (const wearer of wearers.get(texture) ?? []) {
        if (wearer !== leaving && wants(wearer)) {
            return true;
        }
    }
    return false;
};

/**
 * Takes `by` off `texture` once it no longer wants it: an effect written in code whose last emitter
 * has gone. Nothing is let go here; whatever lets go of the picture's last other wearer takes it then.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const dropIdleWearer = (texture: TTexture, by: TAsset): void => {
    if (!wants(by)) {
        wearers.get(texture)?.delete(by);
        wornBy.get(by)?.delete(texture);
    }
};

/**
 * Notes `by` on `texture` again if it is one that counts only while drawn, now it is drawn again.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const wearAgainWhileDrawn = (texture: TTexture, by: TAsset): void => {
    if (whileDrawn.has(by)) {
        wearPicture(texture, by);
    }
};

/**
 * Everything noted as wearing `texture`, for a test to see that nothing let go of is still held.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const wearersOf = (texture: TTexture): TAsset[] => [...(wearers.get(texture) ?? [])];
