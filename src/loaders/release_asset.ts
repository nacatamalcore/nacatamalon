import { bumpVersion } from '../store/record_version';
import { isMadeTexture } from './texture/made_texture';
import { freeGeometryBuffers } from '../geometry/free_geometry';
import { isOwnedGeometry } from '../geometry/create_geometry';
import type { TBox } from '../box';
import type { TRuntimeStore } from '../store';
import type { TTexture } from './texture/types/t_texture';
import type { TGeometry } from '../geometry/types/t_geometry';
import type { TAsset } from './types/t_asset';

/**
 * Whether a drawing shows `thing`: as its picture (a sprite, a panel, particles), as a model's
 * picture, or as a model's shape.
 */
const shows = (drawable: object, thing: TTexture | TGeometry): boolean =>
    (drawable as { texture?: unknown }).texture === thing
    || (drawable as { geometry?: unknown }).geometry === thing
    || (drawable as { material?: { texture?: unknown } }).material?.texture === thing;

/**
 * How many drawings under `box`, its own included, still show `thing`.
 */
const countShowing = (box: TBox, thing: TTexture | TGeometry): number =>
    box.children.reduce(
        (total, child) => total + countShowing(child, thing),
        box.drawables.filter((drawable) => shows(drawable, thing)).length,
    );

/**
 * Says how many drawings still show what was just let go of, which are not drawn from now on.
 */
const sayStillShown = (store: TRuntimeStore, thing: TTexture | TGeometry): void => {
    const showing = store.get('world').scenes.reduce((total, scene) => total + countShowing(scene, thing), 0);
    if (showing > 0) {
        console.warn(
            `[NacatamalOn] releaseAsset: '${thing.key}' is still shown by ${showing} drawing(s), which are not drawn ` +
            `from now on. Destroy them first, or load '${thing.key}' again and give them the new one.`,
        );
    }
};

/**
 * Takes `asset` out of whichever of the game's caches holds it, under any key.
 */
const forget = (store: TRuntimeStore, asset: TAsset): void => {
    for (const cache of Object.values(store.get('assets')) as Map<string, unknown>[]) {
        for (const [key, held] of cache) {
            if (held === asset) {
                cache.delete(key);
            }
        }
    }
};

/**
 * Ends a record: `'released'`, so whatever still holds it knows, and a load on its way is thrown
 * away when it arrives.
 */
const end = (store: TRuntimeStore, asset: TAsset): void => {
    forget(store, asset);
    asset.status = 'released';
    bumpVersion(asset);
};

/**
 * Lets a texture go, off the card. Made ones too: this is also how a font's or an atlas's own
 * picture goes with it.
 */
const releaseTexture = (store: TRuntimeStore, texture: TTexture | null): void => {
    if (texture === null || texture.status === 'released') {
        return;
    }
    if (texture.gpu !== null) {
        store.get('screen').renderer.destroyTexture(texture.gpu);
        texture.gpu = null;
    }
    end(store, texture);
    sayStillShown(store, texture);
};

/**
 * Lets a shape go, off the card.
 */
const releaseGeometry = (store: TRuntimeStore, geometry: TGeometry): void => {
    if (geometry.status === 'released') {
        return;
    }
    freeGeometryBuffers(store.get('screen').renderer, geometry);
    end(store, geometry);
    sayStillShown(store, geometry);
};

/**
 * Throws for what belongs to something in the game rather than to the game's caches: a picture made
 * in the game, a shape made with `createGeometry`. Those go with whatever made them.
 */
const refuseOwned = (asset: TAsset): void => {
    if (asset.type === 'texture' && isMadeTexture(asset)) {
        throw new Error(
            `[NacatamalOn] releaseAsset: the texture '${asset.key}' was made in the game, not loaded from a file. ` +
            'It goes with whatever made it: destroy that.',
        );
    }
    if (asset.type === 'geometry' && isOwnedGeometry(asset)) {
        throw new Error(
            `[NacatamalOn] releaseAsset: the shape '${asset.key}' was made with createGeometry and belongs to ` +
            'the object that made it: destroy that.',
        );
    }
};

/**
 * Lets one asset go, with what is its own.
 */
const releaseOne = (store: TRuntimeStore, asset: TAsset): void => {
    if (asset.status === 'released') {
        return;
    }
    switch (asset.type) {
        case 'texture':
            releaseTexture(store, asset);
            return;
        case 'geometry':
            releaseGeometry(store, asset);
            return;
        case 'atlas':
        case 'bitmap-font':
        case 'font':
            releaseTexture(store, asset.texture);
            break;
        case 'gltf':
            for (const part of asset.parts) {
                releaseGeometry(store, part.geometry);
                releaseTexture(store, part.texture);
                releaseTexture(store, part.emissiveTexture);
            }
            break;
        case 'particles-file':
            releaseTexture(store, asset.texture);
            for (const child of asset.children) {
                if (child !== null) {
                    releaseOne(store, child);
                }
            }
            break;
        case 'palette':
        case 'lut':
            if (asset.gpu !== null) {
                store.get('screen').renderer.destroyTexture(asset.gpu);
                asset.gpu = null;
            }
            break;
        case 'audio':
            asset.buffer = null;
            break;
        case 'song-file':
            asset.samples.clear();
            break;
        case 'loaded-pixels':
            asset.pixels = null;
            break;
        // Plain data, and nothing of the card's or the sound's: out of the cache is all there is.
        case 'tilemap-asset':
        case 'shader':
        case 'motion-file':
        case 'pack':
            break;
    }
    end(store, asset);
};

/**
 * Lets go of something the game loaded: off the graphics card and out of the game, with what is its
 * own (a model's pictures and shapes, an atlas's or a font's picture). Nothing is let go on its own,
 * so this is the only way out.
 *
 * Given a key, every asset kept under it goes, whatever it is: the picture called `'hero'` and the
 * sound called `'hero'`. Given the asset itself, only that one.
 *
 * @param store The game it was loaded in.
 * @param asset The asset, or the key it was loaded under.
 * @returns Whether there was anything to let go of.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const releaseAsset = (store: TRuntimeStore, asset: TAsset | string): boolean => {
    if (typeof asset !== 'string') {
        if (asset.status === 'released') {
            return false;
        }
        refuseOwned(asset);
        releaseOne(store, asset);
        return true;
    }

    const found = new Set<TAsset>();
    for (const cache of Object.values(store.get('assets')) as Map<string, TAsset>[]) {
        const held = cache.get(asset);
        if (held !== undefined) {
            found.add(held);
        }
    }
    // Refused before anything goes, so a key naming one made picture and one loaded sound does
    // not leave the sound gone and the call thrown.
    for (const held of found) {
        refuseOwned(held);
    }
    for (const held of found) {
        releaseOne(store, held);
    }
    return found.size > 0;
};
