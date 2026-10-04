import { deriveSignature, POST_RULES } from '../materials/derive_signature';
import type { TPostEffect } from './types/t_post_effect';
import type { TShader } from '../loaders/shader/types/t_shader';
import type { TUniformValues } from '../materials/types/t_uniforms';

/**
 * What each effect was asked for at the call site, kept apart from what it is currently using.
 *
 * Apart on purpose, for the same reason a material's are: a file may land before the effect was
 * built or long after it, and the two orders have to end in the same place. Merging when the effect
 * is made would make the early case keep the call's values and the late one lose them, which is a
 * bug that only shows up on a slow connection.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
const overrides = new WeakMap<TPostEffect, TUniformValues>();

/**
 * Remembers what an effect was asked for, so a file landing later cannot wash it away.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const rememberPostOverrides = (effect: TPostEffect, values: TUniformValues): void => {
    overrides.set(effect, values);
};

/**
 * Pours a loaded file into one screen-wide effect.
 *
 * A file written for models is refused rather than used: its hook takes a surface and a place on a
 * model, and a screen has neither. It is refused **here as well as at the hook**, because a file
 * that was still loading when the effect was made could not be checked then.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const applyShaderToEffect = (effect: TPostEffect, shader: TShader): void => {
    if (shader.shader === 'mesh3d') {
        console.warn(
            `[NacatamalOn] usePostProcess: '${shader.src}' says it is for models, and a screen-wide ` +
            'effect needs a hook of the form fn effect(color, uv). The frame is shown unchanged.',
        );
        return;
    }

    effect.fragment = shader.fragment;
    effect.fragmentGlsl = shader.fragmentGlsl;

    const asked = overrides.get(effect) ?? {};
    effect.uniforms = { ...shader.uniforms, ...asked };
    // Worked out from the two together, not copied from the file: a knob the scene introduced is
    // real and has to have somewhere to live in the block the card reads.
    effect.uniformSig = { ...shader.uniformSig, ...deriveSignature(asked, POST_RULES) };
};
