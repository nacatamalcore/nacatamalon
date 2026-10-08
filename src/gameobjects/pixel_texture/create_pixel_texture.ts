import { getActiveBox, getActiveGame } from '../../store';
import { markMadeTexture } from '../../loaders';
import { whenLoaded } from '../../loaders/track_load';
import { bumpVersion, markWatchable } from '../../store/record_version';
import { clonePixels } from '../../pixels/edit';
import { nanoId } from '../../utils';
import type { TLoadedPixels } from '../../loaders/pixels/types/t_loaded_pixels';
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
 * Every texture made here, ready or still waiting for its picture: what a key may be taken over by.
 */
const ours = new WeakSet<TTexture>();

/**
 * Textures let go before their picture arrived, which must then never be uploaded.
 */
const gone = new WeakSet<TTexture>();

/**
 * Lets a painted texture go: out of the game's textures, and off the graphics card. Its `gpu` is
 * emptied first-hand, so anything still showing it draws nothing instead of reading a texture that
 * is gone.
 */
const release = (store: TRuntimeStore, texture: TTexture): void => {
    gone.add(texture);
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
 * What `createPixelTexture` hands a picture to before uploading it: change it in place, or return a
 * picture of your own.
 *
 * @category Pixels
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TPixelPaint = (pixels: TPixels) => TPixels | void;

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
 * Turns a picture into a texture a sprite, a model's material or a shader shows like any image loaded
 * from a file.
 *
 * It is how a game turns a **generated** picture into something it can show, with no image file and no
 * page: a procedural sky, a rock texture from noise for a model, a mask for a shader, a placeholder
 * while the real art is drawn. Art someone drew is loaded with `useLoadTexture` instead. It works the
 * same in the browser and on the native runtime, because nothing here draws with the page. **Use it
 * instead of a `<canvas>`**: a canvas only exists in a browser.
 *
 * The picture can be:
 *
 * - **One painted in code** (`createPixels`). The texture is ready at once and keeps reading from the
 *   picture: paint on it again and call `updatePixelTexture` to show the change (a minimap filling in,
 *   a floor with a crater in it). `paint`, if given, is applied to it first.
 * - **A drawn picture loaded to be processed** (`useLoadPixels`). The texture comes back at once,
 *   still loading, the way one from `useLoadTexture` does, and whatever shows it appears when the file
 *   has arrived. `paint` then receives **a copy** of the picture, so the loaded one, shared by everyone
 *   who loaded the file, is never changed: a palette swap, a white silhouette for a hit, an outline.
 *
 * Asked again for a `key` it already made at the same size, it gives that texture back with the new
 * picture uploaded into it, so a scene that restarts does not pile up textures.
 *
 * A scene document can name a texture made here but cannot carry it, since there is no file to fetch:
 * make it again under the same `key` before loading the document.
 *
 * @param source - The picture: one from `createPixels`, or one from `useLoadPixels`.
 * @param paint - Changes the picture before it is uploaded. With a loaded picture it gets a copy.
 * @param options - `key` to keep it by name.
 * @returns The texture, for `createSprite({ texture })`, `createMaterial({ texture })` or
 * `createMesh({ texture })`.
 *
 * @example
 * ```ts
 * const Level = () => {
 *     // Painted in code.
 *     const art = createPixels(16, 16, getColor('#1d2b53'));
 *     fillCircle(art, 8, 8, 6, getColor('#ffec27'));
 *     createSprite({ texture: createPixelTexture(art), width: 64, height: 64 });
 *
 *     // A drawn sprite in another colour, made from the one file.
 *     const hero = useLoadPixels({ src: '/assets/hero.png' });
 *     const red = createPixelTexture(hero, (p) => swapColors(p, [[getColor('#3a7bff'), getColor('#e23d3d')]]));
 *     createSprite({ texture: red, width: 32, height: 32 });
 *     return createScene();
 * };
 * ```
 *
 * @category Pixels
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export function createPixelTexture(source: TPixels | TLoadedPixels, paint: TPixelPaint, options?: TPixelTextureOptions): TTexture;
/**
 * The picture as it is, with nothing painted on it first.
 *
 * @param source - The picture: one from `createPixels`, or one from `useLoadPixels`.
 * @param options - `key` to keep it by name.
 * @returns The texture.
 *
 * @category Pixels
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export function createPixelTexture(source: TPixels | TLoadedPixels, options?: TPixelTextureOptions): TTexture;
export function createPixelTexture(
    source: TPixels | TLoadedPixels,
    paintOrOptions?: TPixelPaint | TPixelTextureOptions,
    maybeOptions?: TPixelTextureOptions,
): TTexture {
    const store = getActiveGame();
    const box = getActiveBox();
    if (store === null || box === null) {
        throw new Error('[NacatamalOn] createPixelTexture: call it inside a scene body.');
    }
    const paint = typeof paintOrOptions === 'function' ? paintOrOptions : undefined;
    const options = (typeof paintOrOptions === 'function' ? maybeOptions : paintOrOptions) ?? {};

    const renderer = store.get('screen').renderer;
    const textures = store.get('assets').textures;
    // Random rather than counted: a counted name written into a scene would be handed out again to
    // the next texture made without one, and the two would show each other's picture.
    const key = options.key ?? `pixel-texture-${nanoId(10)}`;

    const existing = textures.get(key);
    if (existing !== undefined && !ours.has(existing)) {
        throw new Error(`[NacatamalOn] createPixelTexture: '${key}' is already the name of another texture. Give this one another key.`);
    }

    /**
     * The picture as it will be shown: the source with `paint` applied, to a copy if it was loaded.
     */
    const finish = (picture: TPixels, copy: boolean): TPixels => {
        const target = copy ? clonePixels(picture) : picture;
        return paint?.(target) ?? target;
    };

    if (source.type === 'pixels') {
        const pixels = finish(source, false);
        const { width, height, data } = pixels;
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
        adopt(store, texture, pixels, key, options.key === undefined ? box : null);
        return texture;
    }

    // A loaded picture: a texture now, still loading, filled in when the file has arrived.
    if (existing !== undefined) {
        release(store, existing);
    }
    const texture: TTexture = markWatchable({
        type: 'texture',
        key,
        src: source.src,
        width: 0,
        height: 0,
        status: 'loading',
        gpu: null,
    });
    adopt(store, texture, null, key, options.key === undefined ? box : null);

    const fill = (): void => {
        if (gone.has(texture) || store.get('loop').destroyed) {
            return;
        }
        if (source.status !== 'ready' || source.pixels === null) {
            texture.status = 'error';
            bumpVersion(texture);
            return;
        }
        const pixels = finish(source.pixels, true);
        texture.width = pixels.width;
        texture.height = pixels.height;
        texture.gpu = renderer.createDataTexture(pixels.data, pixels.width, pixels.height);
        texture.status = 'ready';
        painted.set(texture, { pixels, store });
        bumpVersion(texture);
    };
    if (source.status === 'loading') {
        void whenLoaded(source).then(fill);
    } else {
        // Already here (another scene loaded it): shown from the first frame.
        fill();
    }
    return texture;
}

/**
 * Lists a new texture with the game, and ties one with no name to the part of the scene that made it.
 */
const adopt = (store: TRuntimeStore, texture: TTexture, pixels: TPixels | null, key: string, owner: ReturnType<typeof getActiveBox>): void => {
    markMadeTexture(texture);
    ours.add(texture);
    if (pixels !== null) {
        painted.set(texture, { pixels, store });
    }
    store.get('assets').textures.set(key, texture);
    // One with no name is this part of the scene's alone: nobody can ask for it again, so it leaves
    // with it instead of staying on the graphics card for every restart.
    if (owner !== null) {
        owner.cleanups.push(() => release(store, texture));
    }
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
