import { createRecord } from '../gameobjects/create_record';
import { deriveSignature, POST_RULES } from '../materials/derive_signature';
import type { TPostEffect, TPostSource } from './types/t_post_effect';
import type { TPostProcessOptions } from './types/t_post_options';
import type { TShader } from '../loaders/shader/types/t_shader';

/**
 * Makes an effect record out of what was asked for.
 *
 * A file, when there is one, wins over a hook written at the call site, and until its bytes land the
 * effect has no hook at all. That is a working state and not a half-built one: an effect with
 * nothing to compile is skipped, so the first frames look like the scene without it.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const newPostEffect = (
    options: TPostProcessOptions,
    shader: TShader | null,
    source: TPostSource,
): TPostEffect => {
    const asked = options.uniforms ?? {};
    // Given rather than worked out when the caller already knows, which is how one of the engine's
    // own arrives: it was written with its kinds and should not have them guessed back off values.
    const sig = options.uniformSig ?? deriveSignature(asked, POST_RULES);

    return createRecord('post', {
        name: options.name ?? null,
        // A file, when there is one, is poured in later by `applyShaderToEffect`.
        fragment: shader !== null ? null : options.fragment ?? null,
        fragmentGlsl: shader !== null ? null : options.fragmentGlsl ?? null,
        uniforms: shader !== null ? {} : asked,
        uniformSig: shader !== null ? {} : sig,
        palette: options.palette ?? null,
        lut: options.lut ?? null,
        source,
        enabled: options.enabled ?? true,
        effect: shader,
    });
};
