import { toScreen } from './to_screen';
import type { TColor } from '../../color';
import type { TGltfDoc, TGltfMaterial, TGltfTextureInfo } from './types/t_gltf_doc';
import type { TMaterialUvTransformRecord, TTextureWrap } from '../../materials';

/**
 * The surface of one piece, in the only terms this engine's models understand.
 *
 * @internal
 */
export type TGltfSurface = {
    /**
     * What the surface was called in the file, or `''`.
     */
    name: string;
    tint: TColor;
    emissive: TColor;
    /**
     * Its picture, or `null` for a plain coloured surface.
     */
    image: TGltfImage | null;
    /**
     * The picture its glow comes through, or `null` when the glow is the same all over. Read the
     * way the colour picture is, same edges and same corners, because one sampler serves both.
     */
    emissiveImage: TGltfImage | null;
    /**
     * Whether the file says the glow comes through a picture, found or not. A picture this engine
     * cannot fetch (one only an extension points at, or a broken index) still means the glow was
     * masked, and must not be applied all over.
     */
    emissiveMasked: boolean;
    /**
     * Where the light from all around is kept out of its creases, or `null` when the file says
     * nothing, or lays it out by a picture coordinate past the second, which no piece carries here.
     * What it does past its edge is its own sampler's, written only when it is not the colour
     * picture's: left out, it follows the colour's, and so whatever a game or a scene says instead.
     */
    occlusion: { image: TGltfImage; strength: number; uv: 'uv' | 'uv2'; wrap?: { u: TTextureWrap; v: TTextureWrap } } | null;
    /**
     * Whether the file says the surface is seen through (`alphaMode: 'BLEND'`). Only this mode:
     * `'MASK'` cuts holes at a threshold rather than blending, and is `alphaCutoff`.
     */
    transparent: boolean;
    /**
     * Whether the file says both sides are seen (`doubleSided`): a leaf, a sheet, a flag. How a
     * modelling program writes a surface whose back is not thrown away.
     */
    doubleSided: boolean;
    /**
     * The alpha below which the picture is cut out (`alphaMode: 'MASK'`, `0.5` unless the file says),
     * or `null` for a surface the file does not cut.
     */
    alphaCutoff: number | null;
    /**
     * What its picture does past its edge, from the file's sampler. Repeating when it says nothing.
     */
    wrap: { u: TTextureWrap; v: TTextureWrap };
    /**
     * How its pictures are laid moved, from its colour picture's `KHR_texture_transform`, or `null`
     * when the file does not move them.
     */
    uvTransform: TMaterialUvTransformRecord | null;
};

/**
 * Where one picture of a surface is, as the file spells it.
 *
 * @internal
 */
export type TGltfImage = {
    /**
     * Its address beside the file, or a data URI. `null` when it is kept inside.
     */
    uri: string | null;
    /**
     * Which slice of the file holds it, when it is kept inside rather than beside.
     */
    bufferView: number | undefined;
    type: string;
};

/**
 * The format's numbers for what a picture does past its edge, which are the ones WebGL uses. An
 * absent or unknown one is repeating, the format's own default.
 */
const WRAP_MODES: Record<number, TTextureWrap> = { 33071: 'clamp', 33648: 'mirror', 10497: 'repeat' };
const wrapOf = (mode: number | undefined): TTextureWrap => (mode !== undefined && WRAP_MODES[mode]) || 'repeat';
const REPEAT = { u: 'repeat', v: 'repeat' } as const;

const WHITE: TColor = { r: 1, g: 1, b: 1, a: 1 };
const BLACK: TColor = { r: 0, g: 0, b: 0, a: 1 };

/**
 * The picture a material points at by texture number, or `null` when there is none to fetch.
 */
const imageOf = (doc: TGltfDoc, textureIndex: number | undefined): TGltfImage | null => {
    const texture = textureIndex !== undefined ? doc.textures?.[textureIndex] : undefined;
    const image = texture !== undefined ? doc.images?.[texture.source ?? -1] : undefined;
    if (image === undefined || (image.uri === undefined && image.bufferView === undefined)) {
        return null;
    }
    return { uri: image.uri ?? null, bufferView: image.bufferView, type: image.mimeType ?? 'image/png' };
};


/**
 * The files already told their occlusion is laid out by a coordinate past the second, so a file of
 * fifty pieces sharing one surface says it once.
 */
const toldPastSecond = new WeakSet<TGltfDoc>();

/**
 * Where a surface keeps the light from all around out of its creases, read from the file, or `null`.
 */
const occlusionOf = (
    doc: TGltfDoc,
    asked: { index: number; strength?: number; texCoord?: number } | undefined,
    colour: { u: TTextureWrap; v: TTextureWrap },
): TGltfSurface['occlusion'] => {
    const image = imageOf(doc, asked?.index);
    if (asked === undefined || image === null) {
        return null;
    }
    const set = asked.texCoord ?? 0;
    if (set > 1) {
        // Only the first two are read off a piece, so a third has nothing to lay it out by.
        if (toldPastSecond.has(doc)) {
            return null;
        }
        toldPastSecond.add(doc);
        console.warn(`[NacatamalOn] useLoadModel: a surface lays its occlusion out by picture coordinate ${set}, and only the first two (TEXCOORD_0 and TEXCOORD_1) are read. It is drawn without it.`);
        return null;
    }
    // Kept from 0 to 1, as the format says; anything that is not a number is all of it.
    const strength = typeof asked.strength === 'number' && Number.isFinite(asked.strength) ? Math.min(Math.max(asked.strength, 0), 1) : 1;
    // Its own sampler, which need not be the colour picture's: a file may clamp one and repeat the
    // other. Kept only when it differs, so a model whose two agree, nearly every one, takes a game's
    // or a scene's wrap on both.
    const texture = doc.textures?.[asked.index];
    const sampler = texture?.sampler !== undefined ? doc.samplers?.[texture.sampler] : undefined;
    const wrap = { u: wrapOf(sampler?.wrapS), v: wrapOf(sampler?.wrapT) };
    const own = wrap.u !== colour.u || wrap.v !== colour.v;
    return { image, strength, uv: set === 1 ? 'uv2' : 'uv', ...(own ? { wrap } : {}) };
};

/**
 * Reads what a piece looks like: its colour, its picture, any light it gives off by itself, and
 * where its creases keep the light from all around out.
 *
 * **Most of what a modern file says about a surface is deliberately walked past.** How metallic
 * something is, how rough, its bumps: those describe light behaving in a way the consoles this
 * engine aims at never computed, and reading them would mean promising a look it does not produce.
 * Colour, picture and glow are what survive, and they are what the era actually had. The occlusion
 * is kept too, because it is not a way light behaves but a shading the artist made and saw: the
 * era painted the same darkness into its pictures and its corners by hand.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const readMaterial = (doc: TGltfDoc, index: number | undefined): TGltfSurface => {
    const material = index !== undefined ? doc.materials?.[index] : undefined;
    if (material === undefined) {
        return { name: '', tint: WHITE, emissive: BLACK, image: null, emissiveImage: null, emissiveMasked: false, occlusion: null, transparent: false, doubleSided: false, alphaCutoff: null, wrap: REPEAT, uvTransform: null };
    }

    const [r, g, b, a] = material.pbrMetallicRoughness?.baseColorFactor ?? [1, 1, 1, 1];
    // A separate strength is how a file says "brighter than white", for a lava crack or a screen.
    const strength = material.extensions?.KHR_materials_emissive_strength?.emissiveStrength ?? 1;

    // A glow with a picture is the factor times that picture: usually white over a label or a
    // screen and black everywhere else. Absent, the factor is black even with a picture, as the
    // format says.
    const [er, eg, eb] = material.emissiveFactor ?? [0, 0, 0];

    const textureIndex = material.pbrMetallicRoughness?.baseColorTexture?.index;
    const texture = textureIndex !== undefined ? doc.textures?.[textureIndex] : undefined;
    const sampler = texture?.sampler !== undefined ? doc.samplers?.[texture.sampler] : undefined;

    return {
        name: material.name ?? '',
        tint: { r: toScreen(r), g: toScreen(g), b: toScreen(b), a },
        emissive: { r: toScreen(er * strength), g: toScreen(eg * strength), b: toScreen(eb * strength), a: 1 },
        image: imageOf(doc, textureIndex),
        emissiveImage: imageOf(doc, material.emissiveTexture?.index),
        emissiveMasked: material.emissiveTexture !== undefined,
        occlusion: occlusionOf(doc, material.occlusionTexture, { u: wrapOf(sampler?.wrapS), v: wrapOf(sampler?.wrapT) }),
        transparent: material.alphaMode === 'BLEND',
        doubleSided: material.doubleSided === true,
        // Kept in range: a file that says more than 1 cuts everything, which is what it asked for.
        alphaCutoff: material.alphaMode === 'MASK' ? Math.min(Math.max(material.alphaCutoff ?? 0.5, 0), 1) : null,
        wrap: { u: wrapOf(sampler?.wrapS), v: wrapOf(sampler?.wrapT) },
        uvTransform: uvTransformOfMaterial(doc, material),
    };
};

/**
 * A file's `KHR_texture_transform` as a material's `uvTransform`, or `null` for none or one that
 * moves nothing. Its numbers are glTF's, in its order, so nothing is converted.
 */
const transformOf = (info: TGltfTextureInfo | undefined): TMaterialUvTransformRecord | null => {
    const given = info?.extensions?.KHR_texture_transform;
    if (given === undefined) {
        return null;
    }
    const finite = (value: unknown, fallback: number): number => (typeof value === 'number' && Number.isFinite(value) ? value : fallback);
    const sx = finite(given.scale?.[0], 1);
    const sy = finite(given.scale?.[1], 1);
    const record = {
        // A scale of 0 squashes the picture to a line, which the file cannot have meant: laid as it is.
        scale: { x: sx === 0 ? 1 : sx, y: sy === 0 ? 1 : sy },
        rotation: finite(given.rotation, 0),
        offset: { x: finite(given.offset?.[0], 0), y: finite(given.offset?.[1], 0) },
    };
    const still = record.scale.x === 1 && record.scale.y === 1 && record.rotation === 0 && record.offset.x === 0 && record.offset.y === 0;
    return still ? null : record;
};

const sameTransform = (a: TMaterialUvTransformRecord | null, b: TMaterialUvTransformRecord | null): boolean =>
    JSON.stringify(a) === JSON.stringify(b);

/**
 * How a surface's pictures are laid: its colour picture's transform, the one this engine lays all of
 * them by (its glow, and an occlusion laid by the first coordinate, follow it). A glow or occlusion
 * that the file moves another way is said once, and laid as the colour is.
 */
/**
 * What was said about each file's surfaces, so a surface worn by many pieces is said once, not once a
 * piece.
 */
const said = new WeakMap<TGltfDoc, Set<string>>();

const sayOnce = (doc: TGltfDoc, message: string): void => {
    const known = said.get(doc) ?? new Set<string>();
    said.set(doc, known);
    if (!known.has(message)) {
        known.add(message);
        console.warn(message);
    }
};

const uvTransformOfMaterial = (doc: TGltfDoc, material: TGltfMaterial): TMaterialUvTransformRecord | null => {
    const colour = transformOf(material.pbrMetallicRoughness?.baseColorTexture);
    // A colour picture laid by another picture coordinate is read here by the first, moved or not.
    const set = material.pbrMetallicRoughness?.baseColorTexture?.extensions?.KHR_texture_transform?.texCoord ?? 0;
    if (set !== 0) {
        sayOnce(doc, `[NacatamalOn] useLoadModel: the surface "${material.name ?? ''}" lays its colour picture by picture coordinate ${set} (KHR_texture_transform), and a colour picture here is laid by the first. It is laid by the first, moved as the file says.`);
    }
    const others = [
        ['glow', material.emissiveTexture],
        ['occlusion', (material.occlusionTexture?.texCoord ?? 0) === 0 ? material.occlusionTexture : undefined],
    ] as const;
    for (const [what, info] of others) {
        if (info !== undefined && !sameTransform(transformOf(info), colour)) {
            sayOnce(doc, `[NacatamalOn] useLoadModel: the surface "${material.name ?? ''}" lays its ${what} picture moved another way than its colour picture (KHR_texture_transform), and a surface here lays them all one way: its ${what} is laid as its colour is.`);
        }
    }
    return colour;
};
