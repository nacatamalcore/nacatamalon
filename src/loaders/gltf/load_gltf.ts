import { bumpVersion } from '../../store/record_version';
import { buildParts } from './build_parts';
import { jointLookup, readSkin } from './read_skin';
import { readAnimations } from './read_animations';
import { decodeDataUri, isDataUri, readGltfContainer } from './read_container';
import { findMeshNodes, meshNodeNames } from './find_mesh_nodes';
import { newTexture } from '../texture/new_texture';
import { loadTexture } from '../texture/load_texture';
import { readBufferView } from './read_accessors';
import { readMaterial } from './read_material';
import { resolveAssetPath } from '../resolve_asset_path';
import { uploadGeometry } from '../../geometry/upload_geometry';
import { uploadTexture } from '../texture/upload_texture';
import { whenLoaded } from '../track_load';
import type { TGltfDoc } from './types/t_gltf_doc';
import type { TSkeleton } from '../../animation';
import type { TGltfModel, TGltfPart } from './types/t_gltf_model';
import type { TRuntimeStore } from '../../store';
import type { TShading } from './shading';
import type { TTexture } from '../texture/types/t_texture';

/**
 * What the loader was asked for beyond the file itself.
 */
export type TLoadGltfOptions = {
    node: string | undefined;
    shading: TShading;
    textures: boolean;
};

/**
 * Fetches whatever a file names, and fails the way the rest of the engine's loaders fail.
 */
const fetchBytes = async (url: string): Promise<ArrayBuffer> => {
    const response = await fetch(url);
    if (!response.ok) {
        throw new Error(`HTTP ${response.status} for '${url}'`);
    }
    return response.arrayBuffer();
};

/**
 * The blocks of numbers the file's corners live in.
 *
 * Three ways they arrive, and the file decides which: named as a neighbouring file, spelled out
 * inside the description itself, or held in the one binary the whole model came in.
 */
const readBuffers = async (doc: TGltfDoc, src: string, embedded: ArrayBuffer | null): Promise<ArrayBuffer[]> =>
    Promise.all((doc.buffers ?? []).map(async (buffer) => {
        if (buffer.uri === undefined) {
            if (embedded === null) {
                throw new Error("the file expects numbers stored inside itself and carries none");
            }
            return embedded;
        }
        if (isDataUri(buffer.uri)) {
            return decodeDataUri(buffer.uri);
        }
        return fetchBytes(resolveAssetPath(src, buffer.uri));
    }));

/**
 * The picture a piece wears, shared through the game's own store of them.
 *
 * A model and a sprite showing the same file end up on one upload, and so do two pieces of one
 * model sharing a sheet, which is the ordinary case: an exported prop usually paints every part of
 * itself from one image.
 */
const surfaceTexture = async (
    store: TRuntimeStore,
    model: TGltfModel,
    doc: TGltfDoc,
    buffers: ArrayBuffer[],
    surface: ReturnType<typeof readMaterial>,
): Promise<TTexture | null> => {
    const { textures } = store.get('assets');

    if (surface.imageBufferView !== undefined) {
        // Kept inside the model. Its name is the model's plus where in the file it sits, because it
        // has no name of its own and two models must not collide over it.
        const key = `${model.key}#image:${surface.imageBufferView}`;
        const cached = textures.get(key);
        if (cached !== undefined) {
            return cached;
        }

        const texture = newTexture(key, key);
        textures.set(key, texture);
        try {
            await uploadTexture(store, texture, new Blob([readBufferView(doc, buffers, surface.imageBufferView)], { type: surface.imageType }));
        } catch (error) {
            texture.status = 'error';
            bumpVersion(texture);
            console.warn(`[NacatamalOn] useLoadGltf: a picture inside '${model.src}' could not be read. That piece draws as its tint.`, error);
        }
        return texture;
    }

    if (surface.imageUri === null) {
        return null;
    }

    const src = isDataUri(surface.imageUri) ? surface.imageUri : resolveAssetPath(model.src, surface.imageUri);
    const cached = textures.get(src);
    if (cached !== undefined) {
        // In the store is not the same as arrived: another piece may have asked for it a moment ago
        // and still be waiting. Waiting here is what keeps the model from calling itself ready
        // while one of its pictures is still on the way.
        await whenLoaded(cached);
        return cached;
    }

    const texture = newTexture(src, src);
    textures.set(src, texture);
    await loadTexture(store, texture);
    return texture;
};

/**
 * Fetches a model file and fills the record in place: its pieces, their shapes and their surfaces.
 *
 * Never rejects. Anything that goes wrong ends as `'error'` with a warning, because one bad model
 * must not take a scene down with it.
 *
 * `store` is the game that asked, captured when the hook ran: by the time the file arrives the
 * scene body is long over and there is no active game to look up.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const loadGltf = async (store: TRuntimeStore, model: TGltfModel, options: TLoadGltfOptions): Promise<void> => {
    try {
        const { doc, embedded } = readGltfContainer(await fetchBytes(model.src));
        const buffers = await readBuffers(doc, model.src, embedded);

        const nodes = findMeshNodes(doc, options.node);
        if (nodes.length === 0) {
            const has = meshNodeNames(doc);
            throw new Error(options.node === undefined
                ? 'it holds nothing that can be drawn'
                : `it holds nothing called '${options.node}'. What it does hold: ${has.length > 0 ? has.join(', ') : 'nothing with a name'}`);
        }

        // The rigs first: the corners of a deformed piece name their bones by number, and putting
        // the bones in parent-first order may renumber them.
        const skeletons: TSkeleton[] = [];
        const renumbers: Int32Array[] = [];
        (doc.skins ?? []).forEach((_, index) => {
            const read = readSkin(doc, buffers, index, `${model.key}#skeleton:${index}`);
            skeletons.push(read.skeleton);
            renumbers.push(read.renumber);
        });

        const built = buildParts(doc, buffers, nodes, options.shading, renumbers);
        const clips = readAnimations(doc, buffers, jointLookup(doc, renumbers));

        // The game may have ended while the file was in the air, and the renderer with it.
        if (store.get('loop').destroyed) {
            return;
        }

        const parts: TGltfPart[] = [];
        for (let i = 0; i < built.length; i++) {
            const piece = built[i];
            const surface = readMaterial(doc, piece.materialIndex);
            const texture = options.textures ? await surfaceTexture(store, model, doc, buffers, surface) : null;
            if (store.get('loop').destroyed) {
                return;
            }

            parts.push({
                name: piece.name,
                material: surface.name,
                // Told where it came from, so a scene naming this shape can say which file and
                // which part of it rather than just the key it happened to be cached under.
                geometry: uploadGeometry(
                    store,
                    `${model.key}#${i}`,
                    { vertices: piece.vertices, indices: piece.indices, skin: piece.skin, colors: piece.colors },
                    { kind: 'gltf', src: model.src, ...(piece.name.length > 0 ? { node: piece.name } : {}) },
                ),
                texture,
                tint: surface.tint,
                emissive: surface.emissive,
                transparent: surface.transparent,
                wrap: surface.wrap,
                skeleton: piece.skeleton === undefined ? null : skeletons[piece.skeleton] ?? null,
            });
        }

        model.parts = parts;
        model.skeletons = skeletons;
        for (const clip of clips) {
            model.clips[clip.name] = clip;
        }
        model.status = 'ready';
        bumpVersion(model);
    } catch (error: unknown) {
        model.status = 'error';
        bumpVersion(model);
        console.warn(`[NacatamalOn] useLoadGltf: '${model.src}' could not be loaded. Nothing is drawn for it.`, error);
    }
};
