import { getActiveGame } from '../../store';
import { newMaterial } from '../../materials';
import type {
    TMaterial, TMaterialOptions, TMeshMaterial, TMeshMaterialOptions, TSpriteMaterial, TSpriteMaterialOptions,
} from '../../materials';
import type { TShader } from '../../loaders/shader';
import type { TTexture } from '../../loaders';

/**
 * The picture the options ask for: one given outright, or one looked up by the name it was loaded
 * under. A name that is not there throws, the same way `createMesh` does, because a name is always
 * deliberate and a plain surface would hide the typo.
 */
const resolveTexture = (options: TMaterialOptions): TTexture | null => {
    if (options.shader !== 'mesh3d') {
        return null;
    }
    const mesh = options as TMeshMaterialOptions;
    if (mesh.texture !== undefined) {
        return mesh.texture;
    }
    if (mesh.key === undefined) {
        return null;
    }

    const found = getActiveGame()?.get('assets').textures.get(mesh.key);
    if (found === undefined) {
        throw new Error(
            `[NacatamalOn] createMaterial: no texture loaded under key '${mesh.key}'. ` +
            `Did you forget useLoadTexture({ src, key: '${mesh.key}' })?`,
        );
    }
    return found;
};

/**
 * The file the options ask for. Unlike a picture, a name that is not there is never treated as
 * "no effect": an effect nobody can find is a typo, and a material that quietly drew plain would
 * hide it for as long as it took somebody to notice the scene looked wrong.
 */
const resolveEffect = (options: TMaterialOptions): TShader | null => {
    if (options.effect === undefined) {
        return null;
    }
    if (typeof options.effect !== 'string') {
        return options.effect;
    }

    const found = getActiveGame()?.get('assets').shaders.get(options.effect);
    if (found === undefined) {
        throw new Error(
            `[NacatamalOn] createMaterial: no shader loaded under key '${options.effect}'. ` +
            `Did you forget useLoadShader({ src, key: '${options.effect}' })?`,
        );
    }
    return found;
};

/**
 * The two ways to call `createMaterial`: which kind of material comes back follows from `shader`,
 * so a model's material can only be handed to a model and a sprite's only to a sprite.
 *
 * @category Materials
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TCreateMaterial = {
    (options: TMeshMaterialOptions): TMeshMaterial;
    (options?: TSpriteMaterialOptions): TSpriteMaterial;
};

/**
 * Makes a material: a shader of your own, and for models the surface it is drawn over.
 *
 * **It is a plain value, not a resource.** Nothing caches it and nothing looks it up by name, so two
 * things share one by being handed the same one. That is also what makes a shared effect cheap: one
 * material is one compiled shader, however many things are drawn with it, and each of those can
 * still run it with its own numbers by passing `uniforms` of its own.
 *
 * What it carries depends on what it is for, and the two are deliberately different. A material for
 * models owns the surface, because a hundred crates want to share one. A material for sprites owns
 * only the effect, because a sprite's picture and colour are its own and travel with it: putting the
 * colour on something shared would mean one material per sprite to vary it.
 *
 * @param options The effect, and for a model its surface.
 * @returns The material.
 *
 * @example
 * ```ts
 * const Level = () => {
 *     const texture = useLoadTexture({ src: '/assets/hero.png' });
 *
 *     const crt = createMaterial({
 *         fragment: `fn effect(color: vec4<f32>, uv: vec2<f32>) -> vec4<f32> {
 *             let band = 0.5 + 0.5 * sin(uv.y * mu.lines + mu.time * 6.0);
 *             return vec4<f32>(color.rgb * band, color.a);
 *         }`,
 *         uniforms: { lines: 200 },
 *     });
 *
 *     createSprite({ texture, material: crt });
 *
 *     return createScene();
 * };
 * ```
 *
 * @category Game objects
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const createMaterial = ((options: TMaterialOptions = {}): TMaterial =>
    newMaterial(options, resolveTexture(options), resolveEffect(options))) as TCreateMaterial;
