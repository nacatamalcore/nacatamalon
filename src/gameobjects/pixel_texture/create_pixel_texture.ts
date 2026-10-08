import { getActiveBox, getActiveGame } from '../../store';
import { markMadeTexture } from '../../loaders';
import { markWatchable } from '../../store/record_version';
import { nanoId } from '../../utils';
import type { TPixelRegion, TPixels } from '../../pixels';
import type { TRuntimeStore } from '../../store';
import type { TTexture } from '../../loaders';

/**
 * Where each painted texture reads its bytes from, and the game it lives in.
 *
 * Kept beside the record rather than on it: a texture is a plain record the whole engine passes
 * around, and the picture and the game are only this module's business.
 */
const painted = new WeakMap<TTexture, { pixels: TPixels; store: TRuntimeStore }>();

/**
 * Lets a painted texture go: out of the game's textures, and off the graphics card. Its `gpu` is
 * emptied first-hand, so anything still showing it draws nothing instead of reading a texture that
 * is gone.
 */
const release = (store: TRuntimeStore, texture: TTexture): void => {
    const textures = store.get('assets').textures;
    if (textures.get(texture.key) === texture) {
        textures.delete(texture.key);
    }
    if (texture.gpu !== null) {
        store.get('screen').renderer.destroyTexture(texture.gpu);
        texture.gpu = null;
    }
};

/**
 * What `createPixelTexture` is asked for.
 *
 * @category Pixels
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TPixelTextureOptions = {
    /**
     * A name, so the texture outlives the scene that made it and another scene can find it with
     * `createSprite({ key })`. Left out, it belongs to the part of the scene that made it and goes
     * when that goes.
     */
    key?: string;
};

/**
 * Turns a picture painted in code into a texture, ready at once: a sprite, a model's material or a
 * shader shows it like any image loaded from a file.
 *
 * It is how a game turns a **generated** picture into something it can show, with no image file and no
 * page: a procedural sky, a rock texture from noise for a model, a mask for a shader, a placeholder
 * while the real art is drawn. Art someone drew is loaded with `useLoadTexture` instead. It works the
 * same in the browser and on the native runtime, because nothing here draws with the page. **Use it
 * instead of a `<canvas>`**: a canvas only exists in a browser.
 *
 * The texture keeps reading from `pixels`. Paint on the picture again and call `updatePixelTexture`
 * to show the change: a minimap filling in, a floor with a crater in it.
 *
 * Asked again for a `key` it already made at the same size, it gives that texture back with the new
 * picture uploaded into it, so a scene that restarts does not pile up textures.
 *
 * A scene document can name a painted texture but cannot carry it, since there is no file to fetch:
 * make it again under the same `key` before loading the document.
 *
 * @param pixels - The picture, from `createPixels`.
 * @param options - `key` to keep it by name.
 * @returns The texture, for `createSprite({ texture })`, `createMaterial({ texture })` or
 * `createMesh({ texture })`.
 *
 * @example
 * ```ts
 * const Level = () => {
 *     const art = createPixels(16, 16, getColor('#1d2b53'));
 *     fillCircle(art, 8, 8, 6, getColor('#ffec27'));
 *     createSprite({ texture: createPixelTexture(art), width: 64, height: 64 });
 *     return createScene();
 * };
 * ```
 *
 * @category Pixels
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const createPixelTexture = (pixels: TPixels, options: TPixelTextureOptions = {}): TTexture => {
    const store = getActiveGame();
    const box = getActiveBox();
    if (store === null || box === null) {
        throw new Error('[NacatamalOn] createPixelTexture: call it inside a scene body.');
    }

    const renderer = store.get('screen').renderer;
    const textures = store.get('assets').textures;
    // Random rather than counted: a counted name written into a scene would be handed out again to
    // the next texture made without one, and the two would show each other's picture.
    const key = options.key ?? `pixel-texture-${nanoId(10)}`;
    const { width, height, data } = pixels;

    const existing = textures.get(key);
    if (existing !== undefined && !painted.has(existing)) {
        throw new Error(`[NacatamalOn] createPixelTexture: '${key}' is already the name of another texture. Give this one another key.`);
    }
    if (existing !== undefined && existing.width === width && existing.height === height && existing.gpu !== null) {
        painted.set(existing, { pixels, store });
        renderer.updateDataTexture(existing.gpu, data, width, height);
        return existing;
    }
    if (existing !== undefined) {
        release(store, existing);
    }

    const texture: TTexture = markWatchable({
        type: 'texture',
        key,
        src: '',
        width,
        height,
        // Ready at once: there is nothing to fetch, and whatever shows it can draw from the first frame.
        status: 'ready',
        gpu: renderer.createDataTexture(data, width, height),
    });
    markMadeTexture(texture);
    painted.set(texture, { pixels, store });
    textures.set(key, texture);

    // One with no name is this part of the scene's alone: nobody can ask for it again, so it leaves
    // with it instead of staying on the graphics card for every restart.
    if (options.key === undefined) {
        box.cleanups.push(() => release(store, texture));
    }
    return texture;
};

/**
 * Shows what has been painted on a picture since its texture was made or last updated.
 *
 * Only the part asked for is sent to the graphics card, so a game that changes a little of a big
 * picture every frame (a crater, a revealed patch of map) passes `region` and stays cheap. Left out,
 * the whole picture is sent.
 *
 * @param texture - A texture `createPixelTexture` made.
 * @param region - The rectangle that changed, in the picture's pixels. It is cut to the picture.
 *
 * @example
 * ```ts
 * fillCircle(ground, hitX, hitY, 6, getColor('transparent'));
 * updatePixelTexture(groundTexture, { x: hitX - 6, y: hitY - 6, width: 13, height: 13 });
 * ```
 *
 * @category Pixels
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const updatePixelTexture = (texture: TTexture, region?: TPixelRegion): void => {
    const entry = painted.get(texture);
    if (entry === undefined) {
        throw new Error(`[NacatamalOn] updatePixelTexture: '${texture.key}' was not made by createPixelTexture, so it has no picture to update from.`);
    }
    // Let go already: there is nothing on the graphics card to write to.
    if (texture.gpu === null) {
        return;
    }

    const { pixels, store } = entry;
    let cut: TPixelRegion | undefined;
    if (region !== undefined) {
        const left = Math.max(0, Math.floor(region.x));
        const top = Math.max(0, Math.floor(region.y));
        const right = Math.min(pixels.width, Math.floor(region.x) + Math.ceil(region.width));
        const bottom = Math.min(pixels.height, Math.floor(region.y) + Math.ceil(region.height));
        if (right <= left || bottom <= top) {
            return;
        }
        cut = { x: left, y: top, width: right - left, height: bottom - top };
    }
    store.get('screen').renderer.updateDataTexture(texture.gpu, pixels.data, pixels.width, pixels.height, cut);
};
