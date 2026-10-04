import { bumpVersion } from '../../store/record_version';
import type { TRuntimeStore } from '../../store';
import { loadTexture } from '../texture/load_texture';
import { resolveAssetPath } from '../resolve_asset_path';
import type { TLoadedAtlas } from './types/t_loaded_atlas';
import { atlasDocFrames, parseAtlasDoc } from '../../atlas/document';

/**
 * Fetches a `.atlas` file and the image it names, filling the record in place as both arrive.
 *
 * The grid may be written either way, and the one that is missing is worked out from the image:
 * `frameWidth` and `frameHeight` in pixels (what exporters write) or `columns` and `rows`. That
 * is why the sheet cannot say how many frames it has until its image has landed, and why this
 * is a load rather than a description. The file is read by `parseAtlasDoc` and cut by
 * `atlasDocFrames`, the same two a tool uses, so the frame an editor shows as 5 is the one a
 * sprite asking for 5 gets.
 *
 * Never rejects. A missing file, a broken image or a grid that does not divide the image ends as
 * `'error'` with a warning: one bad sheet must not take the scene down.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const loadAtlas = async (store: TRuntimeStore, atlas: TLoadedAtlas): Promise<void> => {
    try {
        const response = await fetch(atlas.src);
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }

        const doc = parseAtlasDoc(await response.json(), atlas.src);

        // Relative to the file that named it, which is what `resolveAssetPath` is for: a sheet and
        // its image live next to each other.
        atlas.texture.src = resolveAssetPath(atlas.src, doc.texture);
        await loadTexture(store, atlas.texture);

        if (atlas.texture.status !== 'ready') {
            throw new Error(`its image '${atlas.texture.src}' could not be loaded`);
        }

        const cut = atlasDocFrames(doc, atlas.texture.width, atlas.texture.height);
        atlas.rects = cut.map(({ uvOffset, uvScale }) => ({ uvOffset, uvScale }));
        atlas.frames = cut.length;
        // A grid's own shape, counted off its first row. A packed sheet has none, and is numbered
        // as one row in the order the file lists it.
        atlas.columns = doc.grid !== undefined ? cut.filter((frame) => frame.uvOffset.y === cut[0]?.uvOffset.y).length : cut.length;
        atlas.rows = atlas.columns > 0 ? Math.ceil(cut.length / atlas.columns) : 0;

        // A packed sheet's runs may name their frames; a sprite only counts, so each name becomes
        // its place in the file here, once.
        const byName = new Map(cut.flatMap((frame, index) => (frame.name !== undefined ? [[frame.name, index] as const] : [])));
        if (byName.size > 0) {
            atlas.names = Object.fromEntries(byName);
        }
        for (const [name, sequence] of Object.entries(doc.sequences ?? {})) {
            const frames: number[] = [];
            for (const frame of sequence.frames) {
                const index = typeof frame === 'number' ? frame : byName.get(frame);
                if (index === undefined) {
                    console.warn(`[NacatamalOn] useLoadAtlas: '${atlas.src}' runs '${name}' through a frame called '${frame}', which the sheet does not have. It is left out.`);
                    continue;
                }
                frames.push(index);
            }
            atlas.sequences[name] = {
                frames,
                ...(sequence.fps !== undefined ? { fps: sequence.fps } : {}),
                ...(sequence.loop !== undefined ? { loop: sequence.loop } : {}),
                ...(sequence.next !== undefined ? { next: sequence.next } : {}),
            };
        }

        atlas.status = 'ready';

        bumpVersion(atlas);
    } catch (error: unknown) {
        atlas.status = 'error';
        bumpVersion(atlas);
        console.warn(`[NacatamalOn] useLoadAtlas: '${atlas.src}' could not be loaded. Sprites using it draw nothing.`, error);
    }
};
