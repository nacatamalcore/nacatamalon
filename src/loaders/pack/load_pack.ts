import { bumpVersion } from '../../store/record_version';
import { parseSceneDoc } from '../../scene/document/parse_scene_doc';
import { normalizeActionMap } from '../../input';
import { resolveAssetPath } from '../resolve_asset_path';
import type { TBoxNode, TSceneDoc } from '../../scene/document/types/t_scene_doc';
import type { TRuntimeStore } from '../../store';
import type { TLoadedPack } from './types/t_loaded_pack';

/**
 * What `pack.json` says its format is.
 */
const PACK_FORMAT = 'nacatamalon-pack';

/**
 * A path that already says where it is: from the site's root, or a whole URL.
 */
const isAbsolute = (path: string): boolean => /^([a-z][a-z0-9+.-]*:|\/)/i.test(path);

/**
 * Where a path written in one of the pack's documents really is.
 *
 * A document names its assets from the root of the **project** it lives in: `assets/sign.png` where
 * it was made, `packs/<name>/assets/sign.png` once installed in another project. The pack's own
 * folder is the root that matters here, so the installed prefix is taken off, and so is any `..` that
 * would climb above that root (a URL drops it there too, which is why `../assets/x.png` works in a
 * scene at all). What is left is found in the pack's folder.
 */
const inPack = (pack: TLoadedPack, path: string): string => {
    if (isAbsolute(path)) {
        return path;
    }
    const installed = `packs/${pack.name}/`;
    const parts: string[] = [];
    for (const part of (path.startsWith(installed) ? path.slice(installed.length) : path).split('/')) {
        if (part === '' || part === '.') continue;
        if (part === '..') parts.pop();
        else parts.push(part);
    }
    return resolveAssetPath(pack.src, parts.join('/'));
};

/**
 * Points every path a document fetches at the pack's folder: the files it lists and the maps its
 * components name. The same fields the player rewrites against a project's base, for the same reason:
 * one left out does not fail loudly, it fetches the page's own HTML and reports a confused parse error.
 */
const placeInPack = (pack: TLoadedPack, doc: TSceneDoc): TSceneDoc => {
    for (const asset of doc.assets) {
        switch (asset.type) {
            case 'texture':
            case 'audio':
            case 'shader':
            case 'atlas':
            case 'particles':
            case 'tilemap':
                asset.src = inPack(pack, asset.src);
                break;
            case 'font':
                asset.json = inPack(pack, asset.json);
                asset.atlas = inPack(pack, asset.atlas);
                break;
            case 'geometry':
                if (asset.source.kind === 'gltf') asset.source.src = inPack(pack, asset.source.src);
                break;
        }
    }
    const walk = (box: TBoxNode): void => {
        for (const component of box.components) {
            if (component.type === 'tilemap') component.map = inPack(pack, component.map);
        }
        for (const child of box.children) walk(child);
    };
    walk(doc.root);
    return doc;
};

/**
 * A string list out of whatever the manifest holds there.
 */
const names = (value: unknown): string[] =>
    Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string' && item !== '') : [];

/**
 * Fetches a pack's manifest and the documents it offers, finds their paths in its folder, and adds the
 * input actions it needs to the game.
 *
 * A box file keeps its box as the only child of a container root (the layout the editor saves), so
 * that child is what is kept: it is the thing a copy is made of.
 *
 * The actions the pack's scripts read are **added** to the game's map when the game lacks them, with
 * the bindings they came with. An action the game already has is never changed: the game's own
 * controls win.
 *
 * Never rejects. A pack that is missing or unreadable ends as `'error'` with a warning, and every copy
 * waiting on it stays empty. A document it offers that cannot be read is left out with its own warning,
 * and the rest of the pack still arrives.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const loadPack = async (store: TRuntimeStore, pack: TLoadedPack): Promise<void> => {
    try {
        const response = await fetch(`${pack.src}pack.json`);
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }
        const manifest = await response.json() as Record<string, unknown>;
        if (manifest.format !== PACK_FORMAT) {
            throw new Error(`its pack.json is not a pack (format "${String(manifest.format)}")`);
        }

        const exports = (typeof manifest.exports === 'object' && manifest.exports !== null ? manifest.exports : {}) as Record<string, unknown>;
        const files = names(manifest.files);
        const requires = (typeof manifest.requires === 'object' && manifest.requires !== null ? manifest.requires : {}) as Record<string, unknown>;
        pack.name = typeof manifest.name === 'string' ? manifest.name : '';
        pack.version = typeof manifest.packVersion === 'string' ? manifest.packVersion : '';
        pack.actions = normalizeActionMap(requires.actions);

        /**
         * One offered document, read and placed in the folder, or `null` with a warning.
         */
        const read = async (name: string, suffix: string, field: 'box' | 'scene'): Promise<TSceneDoc | null> => {
            const file = files.find((path) => path === `${name}${suffix}` || path.endsWith(`/${name}${suffix}`));
            if (file === undefined) {
                console.warn(`[NacatamalOn] useLoadPack: '${pack.src}' offers the ${field} "${name}" but does not carry ${name}${suffix}. It is left out.`);
                return null;
            }
            try {
                const answer = await fetch(`${pack.src}${file}`);
                if (!answer.ok) throw new Error(`HTTP ${answer.status}`);
                const raw = await answer.json() as Record<string, unknown>;
                const doc = parseSceneDoc(raw[field] ?? raw, `${pack.src}${file}`);
                if (field === 'box') {
                    doc.root = doc.root.children[0] ?? doc.root;
                }
                return placeInPack(pack, doc);
            } catch (error: unknown) {
                console.warn(`[NacatamalOn] useLoadPack: the ${field} "${name}" of '${pack.src}' could not be read. It is left out.`, error);
                return null;
            }
        };

        for (const name of names(exports.boxes)) {
            const doc = await read(name, '.box', 'box');
            if (doc !== null) pack.boxes[name] = doc;
        }
        for (const name of names(exports.scenes)) {
            const doc = await read(name, '.scene.json', 'scene');
            if (doc !== null) pack.scenes[name] = doc;
        }
        pack.exports = { boxes: Object.keys(pack.boxes), scenes: Object.keys(pack.scenes) };

        if (store.get('loop').destroyed) {
            return;
        }

        const { actions } = store.get('input');
        const missing = pack.actions.filter((action) => !actions.defs.some((have) => have.name === action.name));
        if (missing.length > 0) {
            actions.setMap([...actions.defs, ...missing]);
        }

        pack.status = 'ready';
        bumpVersion(pack);
    } catch (error: unknown) {
        pack.status = 'error';
        bumpVersion(pack);
        console.warn(`[NacatamalOn] useLoadPack: '${pack.src}' could not be loaded. Nothing made from it appears.`, error);
    }
};
