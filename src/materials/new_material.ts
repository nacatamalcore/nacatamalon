import { getColor } from '../color';
import { createRecord } from '../gameobjects/create_record';
import { applyShader, rememberOverrides } from './apply_shader';
import { deriveSignature } from './derive_signature';
import type { TMaterial, TMeshMaterial, TSpriteMaterial } from './types/t_material';
import type { TMaterialOptions, TMeshMaterialOptions } from './types/t_material_options';
import type { TShader } from '../loaders/shader/types/t_shader';
import type { TTexture } from '../loaders';

/**
 * Whether a `vertexSnap` asks for anything: `true`, or a row count above zero.
 */
const isSnapping = (value: boolean | number | undefined): boolean =>
    value === true || (typeof value === 'number' && Number.isFinite(value) && value > 0);

/**
 * Builds the material record from what was asked for, with the lookups already done.
 *
 * The picture and the file are handed in rather than looked up here, because finding them needs the
 * running game and this has to work from a test with no game in it.
 *
 * A material given a file starts with **no source at all** and gets it when the bytes land. That is
 * not a half-built state: a material with nothing to compile draws through the built-in shader, so
 * the first frames of a scene look right rather than looking like nothing.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const newMaterial = (
    options: TMaterialOptions,
    texture: TTexture | null,
    effect: TShader | null,
): TMaterial => {
    const asked = options.uniforms ?? {};
    // Written inline, the source is what it is from the start. From a file, everything stays empty
    // until it arrives, and `applyShader` fills it in.
    const written = effect === null;
    const inline = options.fragment ?? options.vertex ?? options.fragmentGlsl ?? options.vertexGlsl;
    // Whether this material has a shader of its own at all, now or later. Without one there are no
    // knobs either, and `null` says that outright rather than leaving an empty bag that reads as
    // "an effect with no parameters".
    const shaded = effect !== null || inline !== undefined;

    const half = {
        name: options.name ?? null,
        fragment: written ? options.fragment ?? null : null,
        fragmentGlsl: written ? options.fragmentGlsl ?? null : null,
        vertex: written ? options.vertex ?? null : null,
        vertexGlsl: written ? options.vertexGlsl ?? null : null,
        uniforms: shaded ? asked : null,
        uniformSig: shaded ? deriveSignature(asked) : null,
        effect,
    };

    const material: TMaterial = options.shader === 'mesh3d'
        ? createRecord('material', {
            ...half,
            shader: 'mesh3d',
            texture,
            tint: (options as TMeshMaterialOptions).tint ?? getColor('white'),
            emissive: (options as TMeshMaterialOptions).emissive ?? getColor('black'),
            specular: (options as TMeshMaterialOptions).specular ?? getColor('black'),
            shininess: (options as TMeshMaterialOptions).shininess ?? 32,
            alpha: (options as TMeshMaterialOptions).alpha ?? 1,
            // Left as written: absent means "decided by the alpha", which is not the same as `false`.
            transparent: (options as TMeshMaterialOptions).transparent,
            smooth: (options as TMeshMaterialOptions).smooth,
            // Left out when not asked for: absent is repeat, and a default is not a decision.
            ...((options as TMeshMaterialOptions).wrap !== undefined ? { wrap: (options as TMeshMaterialOptions).wrap } : {}),
            // The same: left out unless asked, so a material that never mentioned it saves as before.
            ...(isSnapping((options as TMeshMaterialOptions).vertexSnap) ? { vertexSnap: (options as TMeshMaterialOptions).vertexSnap } : {}),
            ...((options as TMeshMaterialOptions).affine === true ? { affine: true } : {}),
        }) as TMeshMaterial
        : createRecord('material', { ...half, shader: 'sprite2d' }) as TSpriteMaterial;

    if (effect !== null) {
        rememberOverrides(material, asked);
        effect.bound.push(material);
        // Already here, so there is nothing to wait for. Every other case is handled when it lands.
        if (effect.status === 'ready') {
            applyShader(material, effect);
        }
    }

    return material;
};
