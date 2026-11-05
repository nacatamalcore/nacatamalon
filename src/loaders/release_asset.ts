import { bumpVersion } from '../store/record_version';
import { isMadeTexture } from './texture/made_texture';
import { freeGeometryBuffers } from '../geometry/free_geometry';
import { isOwnedGeometry } from '../geometry/create_geometry';
import type { TBox } from '../box';
import type { TRuntimeStore } from '../store';
import type { TTexture } from './texture/types/t_texture';
import type { TGeometry } from '../geometry/types/t_geometry';
import type { TAsset } from './types/t_asset';
import { findAsset } from './asset_key';
import { GAME, drop, dropAll, heldBy, heldByOthers, holdersOf, holdOnlyWhileDrawn, stopCounting, whenFree } from './asset_holds';
import { freeTexture } from './texture/free_texture';
import type { TLoadedAtlas } from './atlas/types/t_loaded_atlas';
import type { TParticlesFile } from './particles/types/t_particles_file';

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
 * Lets a texture go, off the card. Made ones too: this is also how a font's own picture goes with
 * it.
 */
const releaseTexture = (store: TRuntimeStore, texture: TTexture | null): void => {
    if (texture === null || texture.status === 'released') {
        return;
    }
    freeTexture(store, texture);
    end(store, texture);
    sayStillShown(store, texture);
};

/**
 * Lets go of a picture `leaving` held, unless someone else still holds it (see `asset_holds`): two
 * model files carrying the same picture share one, and so do two effects that name the same image.
 * Letting go of one of them must not take it from the other. The last one to go takes it.
 *
 * Also how the game lets go of a picture itself, with `leaving` the picture: then it waits for
 * whatever still holds it.
 *
 * `made` for a picture `leaving` made itself, as a font draws its letters: one made in the game
 * otherwise goes only with whatever made it, never with a file that held it.
 */
const releasePicture = (store: TRuntimeStore, texture: TTexture | null, leaving: TAsset | null, made = false): void => {
    if (texture === null || (!made && isMadeTexture(texture))) {
        return;
    }
    if (heldByOthers(texture, leaving ?? undefined)) {
        // Another model goes the same way when it is let go of, and the game when it lets go of one it
        // asked for; an effect written in code is let go of by nobody, so it finishes this when it
        // stops being drawn.
        // It runs only once nobody holds it, `leaving` included, so `leaving` is not kept for it: a
        // model let go of would otherwise stay in memory for as long as the game holds the picture.
        whenFree(texture, 'release', () => { releasePicture(store, texture, null, made); });
        return;
    }
    releaseTexture(store, texture);
};

/**
 * Lets go of the sheet a particle file took its frames from, unless something else still uses it:
 * the game, which asked for it itself (`useLoadAtlas`, for its sprites), another effect (from a file
 * or written in code), or a map, loaded or still waiting for it. A sheet cut in code is not the
 * cache's and is left alone.
 *
 * Also how the game lets go of a sheet itself, with `leaving` the sheet: then it waits for whatever
 * still uses it.
 */
const releaseSheet = (store: TRuntimeStore, sheet: unknown, leaving: TAsset | null): void => {
    if (sheet === null || (sheet as { type?: unknown }).type !== 'atlas') {
        return;
    }
    const atlas = sheet as TLoadedAtlas;
    if (atlas.status === 'released') {
        return;
    }
    if (heldByOthers(atlas, leaving ?? undefined)) {
        // Another effect goes the same way when it is let go of, and a map finishes this when it goes;
        // an effect written in code is let go of by nobody, so it finishes this when it stops being
        // drawn.
        // As with a picture, `leaving` is not kept: this runs only once nobody holds the sheet.
        whenFree(atlas, 'release', () => { releaseSheet(store, atlas, null); });
        return;
    }
    releaseOne(store, atlas);
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
 * The effects whose children are being let go of right now: what ends the walk should files ever lead
 * back to one another, since an effect only ends as released once its children have gone.
 */
const releasing = new WeakSet<TAsset>();

/**
 * Lets go of an effect once nothing wants it any more: neither the game, which asked for it itself
 * (loaded it, or drew it) and lets go of it when it chooses, nor another effect that sets it off, the
 * last of which takes it.
 */
const releaseWhenNotSetOff = (store: TRuntimeStore, child: TParticlesFile): void => {
    if (heldByOthers(child)) {
        // Another file goes the same way when it is let go of; an effect written in code is let go of
        // by nobody, so it finishes this when it stops being drawn.
        whenFree(child, 'release', () => { releaseWhenNotSetOff(store, child); });
        return;
    }
    releaseOne(store, child);
};

/**
 * Lets go of an effect another one no longer sets off, now it has been edited not to, unless
 * something else still wants it: it came in only for that one, and would have gone with it.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const releaseUnnamed = (store: TRuntimeStore, child: TParticlesFile): void => {
    releaseWhenNotSetOff(store, child);
};

/**
 * Lets go of an effect another one set off, with that one, unless something else still wants it.
 */
const releaseChild = (store: TRuntimeStore, child: TParticlesFile, leaving: TParticlesFile): void => {
    drop(child, leaving);
    releaseWhenNotSetOff(store, child);
};

/**
 * Lets one asset go, with what is its own.
 */
const releaseOne = (store: TRuntimeStore, asset: TAsset): void => {
    if (asset.status === 'released' || releasing.has(asset)) {
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
            releasePicture(store, asset.texture, asset);
            break;
        case 'font':
            // Its letters are drawn into a picture of its own.
            releasePicture(store, asset.texture, asset, true);
            break;
        case 'gltf':
            for (const part of asset.parts) {
                releaseGeometry(store, part.geometry);
                releasePicture(store, part.texture, asset);
                releasePicture(store, part.emissiveTexture, asset);
                releasePicture(store, part.occlusion?.texture ?? null, asset);
            }
            // One still on its way, or that failed on the way, has no pieces to name what it found.
            for (const texture of heldBy(asset) as TTexture[]) {
                releasePicture(store, texture, asset);
            }
            break;
        case 'particles-file':
            // Its children first: one that holds the same picture has let go of it by the time this
            // one asks whether anything else still holds it.
            releasing.add(asset);
            try {
                for (const child of asset.children) {
                    if (child !== null) {
                        releaseChild(store, child, asset);
                    }
                }
            } finally {
                releasing.delete(asset);
            }
            releasePicture(store, asset.texture, asset);
            releaseSheet(store, asset.atlas, asset);
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
        case 'tilemap-asset':
            // Its sheet stays, as a map never takes its sheet with it, but no longer on this map's
            // account: one the game let go of while this map used it goes now.
            if (asset.atlas !== null) {
                drop(asset.atlas, asset);
            }
            break;
        // Plain data, and nothing of the card's or the sound's: out of the cache is all there is.
        case 'shader':
        case 'motion-file':
        case 'pack':
            break;
        // The scene stays one the game can start: a scene is code once it is added, and loading its
        // file again finds it there.
        case 'scene':
            break;
    }
    end(store, asset);
    // Let go of what it held only once it is gone itself: what waited on those may run now, and must
    // not count this one as still holding them.
    dropAll(asset);
};

/**
 * Whether a model still loaded is made of `shape`, as one of its pieces.
 */
const madeOfIt = (store: TRuntimeStore, shape: TGeometry): boolean => {
    for (const model of store.get('assets').gltf.values()) {
        if (model.status !== 'released' && model.parts.some((part) => part.geometry === shape)) {
            return true;
        }
    }
    return false;
};

/**
 * Lets go of what the game itself let go of. What something else still uses waits for the last of
 * them: a picture a model, a sheet, a font or an effect holds, a sheet an effect or a map takes its
 * frames from, an effect others set off, a shape a model is made of. Let go of at once, they would go
 * on drawing it with its picture already off the card, or with no shape at all.
 */
const letGo = (store: TRuntimeStore, asset: TAsset): void => {
    drop(asset, GAME);
    switch (asset.type) {
        case 'particles-file':
            releaseWhenNotSetOff(store, asset);
            return;
        case 'texture':
            releasePicture(store, asset, asset);
            return;
        case 'atlas':
            releaseSheet(store, asset, asset);
            return;
        case 'geometry':
            // A shape a model is made of goes with the model, whatever else happens to it.
            if (!madeOfIt(store, asset)) {
                releaseOne(store, asset);
            }
            return;
        default:
            releaseOne(store, asset);
    }
};

/**
 * What in the game's caches holds `asset` as its own part: an effect setting it off, or taking its
 * frames or its picture from it, a map on it as its sheet, a model with it as a picture, loaded or
 * still on its way. Each holds that very record, so it is taken out with it, or it would go on with
 * the old version once loaded afresh.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const usersOf = (store: TRuntimeStore, asset: TAsset): TAsset[] => {
    const cached = new Set<TAsset>();
    for (const cache of Object.values(store.get('assets')) as Map<string, TAsset>[]) {
        for (const other of cache.values()) {
            cached.add(other);
        }
    }
    // Each noted what it holds as it asked for it, so those still on their way are found too.
    return holdersOf(asset).filter((user) => user !== asset && cached.has(user as TAsset)) as TAsset[];
};

/**
 * Takes `asset` off what it uses, as it is taken out of the game to be loaded afresh: the effects it
 * sets off, the sheet it takes its frames from, the pictures it holds. Each stays for whatever else
 * uses it, and one let go of while this one held it goes now. Nothing of its own is let go: what
 * still shows it keeps what it had until its scene is built again. An effect another one still sets
 * off is left as it is, since that one still sets it off, and is taken off what it uses once nothing
 * does.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const stopHolding = (asset: TAsset): void => {
    // An effect another one still sets off is still in the game through that one, which goes on
    // setting off this very record: it holds what it holds, and goes with the last of them.
    if (asset.type === 'particles-file' && heldByOthers(asset, GAME)) {
        whenFree(asset, 'forget', () => { stopHolding(asset); }, GAME);
        return;
    }
    if (asset.type === 'particles-file') {
        // Nothing lets go of it any more, so from now on it holds what it uses only while something
        // draws it, as an effect written in code does.
        holdOnlyWhileDrawn(asset);
        // An emitter still drawing it keeps what it shows: it is let go of when the last one goes.
        if (asset.bound.length > 0) {
            return;
        }
    }
    // One still on its way would take them again when it lands. Ended, its loader hears it and stops;
    // nothing of it is drawn yet, so nothing goes blank.
    if (asset.status === 'loading' && (asset.type === 'particles-file' || asset.type === 'tilemap-asset' || asset.type === 'gltf')) {
        asset.status = 'released';
        bumpVersion(asset);
    }
    // Out of the game, it holds nothing for anyone any more. A model still knows which pictures it
    // fetched, failed or not: letting it go later takes them, and a failed one has no pieces to
    // name them.
    if (asset.type === 'gltf') {
        stopCounting(asset);
        return;
    }
    dropAll(asset);
};

/**
 * Whether a screen effect, the project's or a transition's, holds `asset`: those outlive the scene
 * built again.
 */
const heldOnScreen = (store: TRuntimeStore, asset: TAsset): boolean => {
    const holds = (effect: { palette?: unknown; lut?: unknown; mask?: unknown }): boolean =>
        effect.palette === asset || effect.lut === asset || effect.mask === asset;
    const transition = store.get('transition').active;
    return store.get('post').effects.some(holds) || (transition !== null && holds(transition.effect));
};

/**
 * Lets go of what the editor took out of the game, once the scene has been built again and nothing
 * there shows it: what it had on the graphics card, which nothing else would ever free.
 *
 * Only what has something of its own there goes: a picture, a sheet, a font of pictures, a model and
 * its shapes. An effect or a map has nothing of its own on the card, and only ends, so what it used
 * stays for the copy loaded afresh rather than being fetched again. An effect still drawn, or still
 * set off by one, is not let go of yet; nor is anything a screen effect holds, which outlives the
 * scene. Says whether it is done with it.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const releaseLeftBehind = (store: TRuntimeStore, asset: TAsset): boolean => {
    if (asset.status === 'released') {
        return true;
    }
    switch (asset.type) {
        case 'particles-file':
            if (asset.bound.length > 0 || heldByOthers(asset, GAME)) {
                return false;
            }
            end(store, asset);
            return true;
        case 'tilemap-asset':
            end(store, asset);
            return true;
        case 'texture':
        case 'atlas':
        case 'bitmap-font':
        case 'gltf':
        case 'geometry':
            if (heldOnScreen(store, asset) || (asset.type === 'texture' && isMadeTexture(asset))) {
                return true;
            }
            // A picture or a sheet goes the way the game lets go of one: after the last thing still
            // drawn with it, an emitter kept from before or an effect written in code.
            drop(asset, GAME);
            if (asset.type === 'texture') {
                releasePicture(store, asset, asset);
            } else if (asset.type === 'atlas') {
                releaseSheet(store, asset, asset);
            } else {
                releaseOne(store, asset);
            }
            return true;
        default:
            return true;
    }
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
        letGo(store, asset);
        return true;
    }

    const found = new Set<TAsset>();
    for (const cache of Object.values(store.get('assets')) as Map<string, TAsset>[]) {
        const held = findAsset(cache, asset);
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
        letGo(store, held);
    }
    return found.size > 0;
};
