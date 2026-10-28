import { resolveAssetPath } from './resolve_asset_path';

/**
 * A scheme of the engine's or of the browser's: `nacatamalon:arcade`, `data:…`, `blob:…`. Those are
 * names, not paths, and resolving one against the page would make it point at a file that is not
 * there. `http:` and `https:` are left out on purpose: an address on the page's own host is the same
 * file as its path.
 */
const NAMED = /^(?!https?:)[a-z][a-z0-9+.-]*:/i;

/**
 * The one name a file is kept under when the game gives it no key: its path as the page resolves
 * it, the same rule a map, an atlas or a model follows for the files it names.
 *
 * Without it the cache went by the string as written, and a game served from a folder
 * (`/html/1234/`) that asked for `./assets/overworld.atlas` while its map asked for the same sheet
 * as `/html/1234/assets/overworld.atlas` fetched it twice and made two textures of it.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const assetKey = (src: string): string => NAMED.test(src) ? src : resolveAssetPath('', src);

/**
 * What a cache holds under a name, as written or as the path it resolves to: `'hero'` for one loaded
 * with that key, and `'./assets/hero.png'` for one loaded with no key from the same path written
 * any other way. No cache, as when no game is being built, holds nothing.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const findAsset = <T>(cache: ReadonlyMap<string, T> | undefined, name: string): T | undefined =>
    cache === undefined ? undefined : cache.get(name) ?? cache.get(assetKey(name));

/**
 * What a cache holds of the file at `path` (already resolved, as a map or a model resolves the files
 * it names), whatever key it was loaded under: the sheet a map names is very often one the game
 * loaded itself as `useLoadAtlas({ src, key: 'overworld' })`, and the map must not load it again.
 *
 * Looks through the cache only when the path itself is not a key, and only while something loads.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const findAssetFile = <T extends { src: string }>(cache: ReadonlyMap<string, T>, path: string): T | undefined => {
    const exact = cache.get(path);
    if (exact !== undefined) return exact;
    for (const asset of cache.values()) {
        if (assetKey(asset.src) === path) return asset;
    }
    return undefined;
};
