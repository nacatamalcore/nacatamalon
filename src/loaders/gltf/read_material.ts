import { toScreen } from './to_screen';
import type { TColor } from '../../color';
import type { TGltfDoc } from './types/t_gltf_doc';
import type { TTextureWrap } from '../../materials';

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
     * Where the picture is, as the file spells it. `null` for a plain coloured surface.
     */
    imageUri: string | null;
    /**
     * Which slice of the file holds the picture, when it is kept inside rather than beside.
     */
    imageBufferView: number | undefined;
    imageType: string;
    /**
     * Whether the file says the surface is seen through (`alphaMode: 'BLEND'`). Only this mode:
     * `'MASK'` cuts holes at a threshold rather than blending, which this engine does not do yet.
     */
    transparent: boolean;
    /**
     * What its picture does past its edge, from the file's sampler. Repeating when it says nothing.
     */
    wrap: { u: TTextureWrap; v: TTextureWrap };
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
 * Reads what a piece looks like: its colour, its picture, and any light it gives off by itself.
 *
 * **Most of what a modern file says about a surface is deliberately walked past.** How metallic
 * something is, how rough, its bumps, where it is shadowed in its own creases: those describe light
 * behaving in a way the consoles this engine aims at never computed, and reading them would mean
 * promising a look it does not produce. Colour, picture and glow are what survive, and they are
 * what the era actually had.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const readMaterial = (doc: TGltfDoc, index: number | undefined): TGltfSurface => {
    const material = index !== undefined ? doc.materials?.[index] : undefined;
    if (material === undefined) {
        return { name: '', tint: WHITE, emissive: BLACK, imageUri: null, imageBufferView: undefined, imageType: 'image/png', transparent: false, wrap: REPEAT };
    }

    const [r, g, b, a] = material.pbrMetallicRoughness?.baseColorFactor ?? [1, 1, 1, 1];
    // A separate strength is how a file says "brighter than white", for a lava crack or a screen.
    const strength = material.extensions?.KHR_materials_emissive_strength?.emissiveStrength ?? 1;

    // **A glow with a picture masking it is dropped, not applied unmasked.** The format means the
    // factor to multiply that picture, which is usually white over a label and black everywhere
    // else; taking the factor alone turns a bottle with a glowing logo into a bottle made of light.
    // No glow at all is wrong in one small place. An unmasked one is wrong over the whole model.
    const [er, eg, eb] = material.emissiveTexture !== undefined ? [0, 0, 0] : material.emissiveFactor ?? [0, 0, 0];

    const textureIndex = material.pbrMetallicRoughness?.baseColorTexture?.index;
    const texture = textureIndex !== undefined ? doc.textures?.[textureIndex] : undefined;
    const image = texture !== undefined ? doc.images?.[texture.source ?? -1] : undefined;
    const sampler = texture?.sampler !== undefined ? doc.samplers?.[texture.sampler] : undefined;

    return {
        name: material.name ?? '',
        tint: { r: toScreen(r), g: toScreen(g), b: toScreen(b), a },
        emissive: { r: toScreen(er * strength), g: toScreen(eg * strength), b: toScreen(eb * strength), a: 1 },
        imageUri: image?.uri ?? null,
        imageBufferView: image?.bufferView,
        imageType: image?.mimeType ?? 'image/png',
        transparent: material.alphaMode === 'BLEND',
        wrap: { u: wrapOf(sampler?.wrapS), v: wrapOf(sampler?.wrapT) },
    };
};
