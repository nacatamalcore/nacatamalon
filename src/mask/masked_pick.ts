import { fetchAsset } from '../loaders/fetch_asset';
import { decodePng } from '../pixels/decode_png';
import { paintedPixelsOf } from '../gameobjects/pixel_texture/create_pixel_texture';
import type { TRenderPass } from '../render/interface';
import type { TTexture } from '../loaders';
import type { TPixels } from '../pixels/types/t_pixels';
import type { TMask } from './types/t_mask';
import type { TMaskLevel, TShapeList } from './mask_walk';
import type { TMaskedItem } from './apply_masks';

/**
 * What a pass held before its masks were worked in: every drawable where it was sorted, with its
 * innermost mask, and each mask's shape as the scene has it (a text whole, not its letters). What the
 * pointer reads, because a soft mask's drawables are no longer in the pass, and because asking a
 * mask whether a point is seen is asked of the shape, not of what a backend draws it as.
 *
 * @internal
 */
export type TMaskedPick = {
    drawables: readonly TMaskedItem[];
    cameraIndex: readonly number[];
    levels: readonly (TMaskLevel | null)[];
    shapes: ReadonlyMap<TMask, TShapeList>;
};

const picks = new WeakMap<TRenderPass, TMaskedPick>();

/**
 * Notes what a pass held before its masks, or forgets it with `null`.
 *
 * @internal
 */
export const rememberMaskedPass = (pass: TRenderPass, pick: TMaskedPick | null): void => {
    if (pick === null) {
        picks.delete(pass);
    } else {
        picks.set(pass, pick);
    }
};

/**
 * What a pass held before its masks, or `undefined` when nothing in it was masked.
 *
 * @internal
 */
export const maskedPassOf = (pass: TRenderPass): TMaskedPick | undefined => picks.get(pass);

/**
 * The pixels of each picture a shape uses, read once from its file so the pointer can tell what of a
 * sprite is there: `null` while they are on their way, or for a picture that has no file to read
 * (one drawn into, or not a PNG), which is then touched as its whole rectangle. A picture painted
 * in code is read straight from its pixels.
 */
const pixels = new WeakMap<TTexture, TPixels | null>();

/**
 * The pixels of a shape's picture, starting to read them the first time they are asked for.
 *
 * @internal
 */
export const shapePixelsOf = (texture: TTexture): TPixels | null => {
    // A picture painted in code is read where it is painted, as it is now.
    const own = paintedPixelsOf(texture);
    if (own !== undefined) {
        return own;
    }
    if (pixels.has(texture)) {
        return pixels.get(texture) ?? null;
    }
    pixels.set(texture, null);
    if (texture.src === '' || typeof fetch !== 'function') {
        return null;
    }
    void fetchAsset(texture.src)
        .then((response) => (response.ok ? response.arrayBuffer() : Promise.reject(new Error(`HTTP ${response.status}`))))
        .then((bytes) => {
            pixels.set(texture, decodePng(new Uint8Array(bytes)));
        })
        // Not a PNG, or not there: touched as its rectangle, which is what it was before it was asked.
        .catch(() => undefined);
    return null;
};

/**
 * Hands a shape's picture its pixels directly: for a picture whose pixels the game already has, and
 * for tests.
 *
 * @internal
 */
export const setShapePixels = (texture: TTexture, read: TPixels | null): void => {
    pixels.set(texture, read);
};
