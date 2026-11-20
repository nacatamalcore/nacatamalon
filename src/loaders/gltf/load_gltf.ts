import { bumpVersion } from '../../store/record_version';
import { buildParts } from './build_parts';
import { jointLookup, readSkin } from './read_skin';
import { readAnimations } from './read_animations';
import { decodeDataUri, isDataUri, isGltfFile, readGltfContainer } from './read_container';
import { readObj } from '../obj/read_obj';
import { plainSurface, readMtl } from '../obj/read_mtl';
import type { TBuiltPart } from './build_parts';
import type { TGltfSurface } from './read_material';
import { findMeshNodes, meshNodeNames } from './find_mesh_nodes';
import { newTexture } from '../texture/new_texture';
import { loadTexture } from '../texture/load_texture';
import { readBufferView } from './read_accessors';
import { readMaterial } from './read_material';
import type { TGltfImage } from './read_material';
import { resolveAssetPath } from '../resolve_asset_path';
import { uploadGeometry } from '../../geometry/upload_geometry';
import { uploadTexture } from '../texture/upload_texture';
import { trackLoad, whenLoaded } from '../track_load';
import type { TGltfDoc } from './types/t_gltf_doc';
import type { TSkeletalClip, TSkeleton } from '../../animation';
import type { TGltfModel, TGltfPart } from './types/t_gltf_model';
import type { TRuntimeStore } from '../../store';
import type { TShading } from './shading';
import type { TTexture } from '../texture/types/t_texture';
import { findAssetFile } from '../asset_key';
import { crc32 } from '../../pixels/crc32';
import { hold, stopCounting } from '../asset_holds';

/** No light of its own. */
const NO_GLOW = { r: 0, g: 0, b: 0, a: 1 };

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
 * A name for a picture kept inside a model file, from what it holds rather than where it sits: its
 * length and two checksums of different kinds, which two different pictures do not share. Two files
 * carrying the same picture (props exported with one colour sheet) find each other by it.
 *
 * The same bytes, not the same picture: two files that saved the same pixels compressed differently
 * are two pictures here. Telling those apart would mean unpacking every picture to compare it.
 */
const contentKeyOf = (bytes: Uint8Array): string => {
    // FNV-1a, a checksum of another kind than the CRC beside it.
    let fnv = 0x811c9dc5;
    for (let i = 0; i < bytes.length; i++) {
        fnv ^= bytes[i]!;
        fnv = Math.imul(fnv, 0x01000193);
    }
    return `gltf-image:${bytes.length}:${crc32(bytes, 0, bytes.length).toString(16)}:${(fnv >>> 0).toString(16)}`;
};

/**
 * A picture a piece wears, its colour or its glow, shared through the game's own store of them.
 *
 * A model and a sprite showing the same file end up on one upload, and so do two pieces of one
 * model sharing a sheet, which is the ordinary case: an exported prop usually paints every part of
 * itself from one image.
 *
 * `seen` is the pictures inside this file already found while it is read, by where they sit, so a
 * sheet every piece wears is copied out and checked once rather than once a piece.
 */
const surfaceTexture = async (
    store: TRuntimeStore,
    model: TGltfModel,
    doc: TGltfDoc,
    buffers: ArrayBuffer[],
    image: TGltfImage | null,
    seen: Map<number, Promise<TTexture>>,
): Promise<TTexture | null> => {
    if (image === null) {
        return null;
    }

    if (image.bufferView !== undefined) {
        let found = seen.get(image.bufferView);
        if (found === undefined) {
            found = keptPicture(store, model, doc, buffers, image as TGltfImage & { bufferView: number });
            seen.set(image.bufferView, found);
        }
        return found;
    }

    return filePicture(store, model, image);
};

/**
 * Notes, as soon as it is found, that `model` holds `texture`: before its pieces are out, so letting
 * go of another model that shares it leaves it for this one.
 */
const holding = (model: TGltfModel, texture: TTexture): TTexture => {
    hold(texture, model);
    return texture;
};

/**
 * A picture kept inside the model file, the first time this file is read asking for it.
 */
const keptPicture = async (
    store: TRuntimeStore,
    model: TGltfModel,
    doc: TGltfDoc,
    buffers: ArrayBuffer[],
    image: TGltfImage & { bufferView: number },
): Promise<TTexture> => {
    const { textures } = store.get('assets');
    // Found again by what it holds, so the same picture in two files, or twice in one, goes up to
    // the card once. Named after the model and where in the file it sits, which is what a message
    // about it can usefully say.
    const bytes = readBufferView(doc, buffers, image.bufferView);
    const content = contentKeyOf(new Uint8Array(bytes));
    const cached = textures.get(content);
    if (cached !== undefined) {
        holding(model, cached);
        // In the store is not the same as arrived: another model may still be sending it up.
        await whenLoaded(cached);
        return cached;
    }

    const key = `${model.key}#image:${image.bufferView}`;
    const texture = holding(model, newTexture(key, key));
    textures.set(key, texture);
    textures.set(content, texture);
    const sending = (async () => {
        try {
            await uploadTexture(store, texture, new Blob([bytes], { type: image.type }));
        } catch (error) {
            if (texture.status === 'released') {
                return;
            }
            texture.status = 'error';
            bumpVersion(texture);
            console.warn(`[NacatamalOn] useLoadModel: a picture inside '${model.src}' could not be read. That piece draws as its tint.`, error);
        }
    })();
    // Tracked, so the wait above has something to wait on when the next model asks for it.
    trackLoad(texture, sending);
    await sending;
    return texture;
};

/**
 * A picture the model file points at, shared with anything else that showed the same file.
 */
const filePicture = async (store: TRuntimeStore, model: TGltfModel, image: TGltfImage): Promise<TTexture | null> => {
    const { textures } = store.get('assets');
    if (image.uri === null) {
        return null;
    }

    const src = isDataUri(image.uri) ? image.uri : resolveAssetPath(model.src, image.uri);
    const cached = findAssetFile(textures, src);
    if (cached !== undefined) {
        holding(model, cached);
        // In the store is not the same as arrived: another piece may have asked for it a moment ago
        // and still be waiting. Waiting here is what keeps the model from calling itself ready
        // while one of its pictures is still on the way.
        await whenLoaded(cached);
        return cached;
    }

    const texture = holding(model, newTexture(src, src));
    textures.set(src, texture);
    // Tracked, so the wait above has something to wait on when the next piece asks for it.
    const loading = loadTexture(store, texture);
    trackLoad(texture, loading);
    await loading;
    return texture;
};

/**
 * What a model file was read into, whichever format it was: its pieces, the surface each wears, and
 * the rigs and movements it came with.
 */
type TReadModel = {
    doc: TGltfDoc;
    buffers: ArrayBuffer[];
    built: TBuiltPart[];
    surfaceOf: (piece: number) => TGltfSurface;
    skeletons: TSkeleton[];
    clips: TSkeletalClip[];
};

/**
 * Nothing can be drawn: the file is empty of pieces, or of the one asked for.
 */
const nothingDrawn = (node: string | undefined, has: string[]): Error => new Error(node === undefined
    ? 'it holds nothing that can be drawn'
    : `it holds nothing called '${node}'. What it does hold: ${has.length > 0 ? has.join(', ') : 'nothing with a name'}`);

/**
 * A glTF, either kind.
 */
const readGltfModel = async (bytes: ArrayBuffer, model: TGltfModel, options: TLoadGltfOptions): Promise<TReadModel> => {
    const { doc, embedded } = readGltfContainer(bytes);
    const buffers = await readBuffers(doc, model.src, embedded);

    const nodes = findMeshNodes(doc, options.node);
    if (nodes.length === 0) {
        throw nothingDrawn(options.node, meshNodeNames(doc));
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
    return { doc, buffers, built, surfaceOf: (piece) => readMaterial(doc, built[piece].materialIndex), skeletons, clips };
};

/**
 * A Wavefront file (`.obj`), with the material files it names. A material file that cannot be read
 * is said and its pieces drawn white: the shape is still worth having.
 */
const readObjModel = async (bytes: ArrayBuffer, model: TGltfModel, options: TLoadGltfOptions): Promise<TReadModel> => {
    const file = readObj(new TextDecoder().decode(bytes), options.shading, options.node);
    if (file.parts.length === 0) {
        throw nothingDrawn(options.node, file.names.filter((name) => name !== ''));
    }

    const surfaces = new Map<string, TGltfSurface>();
    for (const library of new Set(file.libraries)) {
        // A path the exporter wrote from its own computer is looked for beside the model, as the
        // pictures it names are beside their material file.
        const written = library.replace(/\\/g, '/');
        const local = /^[a-z]:\//i.test(written) || written.startsWith('/') ? written.slice(written.lastIndexOf('/') + 1) : written;
        const address = resolveAssetPath(model.src, local);
        try {
            const text = new TextDecoder().decode(await fetchBytes(address));
            for (const [name, surface] of readMtl(text, (picture) => resolveAssetPath(address, picture))) {
                // The first file to describe a surface keeps it, as the order they were named says.
                if (!surfaces.has(name)) surfaces.set(name, surface);
            }
        } catch (error) {
            console.warn(`[NacatamalOn] useLoadModel: '${model.src}' names the material file '${library}', which could not be read. The pieces it describes are drawn white.`, error);
        }
    }

    const parts = file.parts;
    return {
        doc: NO_DOC,
        buffers: [],
        built: parts,
        surfaceOf: (piece) => surfaces.get(parts[piece].material) ?? plainSurface(parts[piece].material),
        skeletons: [],
        clips: [],
    };
};

/**
 * The glTF description a Wavefront file does not have: it keeps no pictures inside itself, so the
 * picture code never looks in it.
 */
const NO_DOC: TGltfDoc = {};

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
        // Asked by what it holds, not by its name: a glTF of either kind, or else a Wavefront file.
        const bytes = await fetchBytes(model.src);
        const read = isGltfFile(bytes) ? await readGltfModel(bytes, model, options) : await readObjModel(bytes, model, options);
        const { doc, buffers, built, skeletons, clips } = read;

        // The game may have ended while the file was in the air, and the renderer with it. Or the
        // game let go of this file, and then nobody wants what it holds.
        const gone = (): boolean => store.get('loop').destroyed || model.status === 'released';
        if (gone()) {
            return;
        }

        // Every picture first, waiting for each. Nothing goes to the card until they are all here, so
        // a file let go of on the way leaves no shapes behind that nobody will ever free.
        const pictures = [];
        const seen = new Map<number, Promise<TTexture>>();
        for (let i = 0; i < built.length; i++) {
            const surface = read.surfaceOf(i);
            // Asked for one at a time, each only if the file is still wanted: what is let go of while
            // waiting for one picture does not send for the next.
            const picture = async (image: TGltfImage | null): Promise<TTexture | null> =>
                (options.textures && !gone() ? surfaceTexture(store, model, doc, buffers, image, seen) : null);
            const texture = await picture(surface.image);
            const emissiveTexture = await picture(surface.emissiveImage);
            // Often the same picture as another of the surface's (its roughness and metalness ride in
            // the other channels), and then one copy serves both.
            const occlusionTexture = await picture(surface.occlusion === null ? null : surface.occlusion.image);
            if (gone()) {
                return;
            }
            pictures.push({ surface, texture, emissiveTexture, occlusionTexture });
        }

        const parts: TGltfPart[] = [];
        for (let i = 0; i < built.length; i++) {
            const piece = built[i];
            const { surface, texture, emissiveTexture, occlusionTexture } = pictures[i];
            parts.push({
                name: piece.name,
                material: surface.name,
                // Told where it came from, so a scene naming this shape can say which file and
                // which part of it rather than just the key it happened to be cached under.
                geometry: uploadGeometry(
                    store,
                    `${model.key}#${i}`,
                    { vertices: piece.vertices, indices: piece.indices, skin: piece.skin, colors: piece.colors, detail: piece.detail },
                    // The name even when it is empty, so a scene can ask for a piece with none, and
                    // which of that name it is when it is not the first.
                    { kind: 'gltf', src: model.src, node: piece.name, ...(piece.occurrence > 0 ? { occurrence: piece.occurrence } : {}) },
                ),
                texture,
                tint: surface.tint,
                // **A glow meant to come through a picture is dropped when there is no picture to
                // put on, not applied unmasked**: not fetched, or one this engine cannot read. The
                // factor is usually white and the picture black everywhere but a label: the factor
                // alone turns a bottle with a glowing logo into a bottle made of light. No glow is
                // wrong in one small place, an unmasked one all over.
                emissive: surface.emissiveMasked && emissiveTexture === null ? NO_GLOW : surface.emissive,
                emissiveTexture,
                occlusion: occlusionTexture === null || surface.occlusion === null
                    ? null
                    : {
                        texture: occlusionTexture,
                        strength: surface.occlusion.strength,
                        uv: surface.occlusion.uv,
                        ...(surface.occlusion.wrap !== undefined ? { wrap: surface.occlusion.wrap } : {}),
                    },
                transparent: surface.transparent,
                doubleSided: surface.doubleSided,
                alphaCutoff: surface.alphaCutoff,
                wrap: surface.wrap,
                uvTransform: surface.uvTransform,
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
        // Nobody is waiting for a file that was let go of, to hear that it did not arrive either.
        if (model.status === 'released') {
            return;
        }
        model.status = 'error';
        bumpVersion(model);
        stopCounting(model);
        console.warn(`[NacatamalOn] useLoadModel: '${model.src}' could not be loaded. Nothing is drawn for it.`, error);
    }
};
