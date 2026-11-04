import { newPostEffect } from './new_post_effect';
import { applyShaderToEffect, rememberPostOverrides } from './apply_shader_to_effect';
import { findAsset } from '../loaders/asset_key';
import type { TRuntimeStore } from '../store';
import type { TPostEffect, TPostSource } from './types/t_post_effect';
import type { TPostProcessOptions } from './types/t_post_options';
import type { TShader } from '../loaders/shader/types/t_shader';

/**
 * The file the options ask for. A name nothing was loaded under is a typo, never "no effect".
 */
const resolveEffect = (store: TRuntimeStore, options: TPostProcessOptions, hook: string): TShader | null => {
    if (options.effect === undefined) {
        return null;
    }
    if (typeof options.effect !== 'string') {
        return options.effect;
    }
    const found = findAsset(store.get('assets').shaders, options.effect);
    if (found === undefined) {
        throw new Error(
            `[NacatamalOn] ${hook}: no shader loaded under key '${options.effect}'. ` +
            `Did you forget useLoadShader({ src, key: '${options.effect}' })?`,
        );
    }
    return found;
};

/**
 * Makes an effect out of what a game asked for, the way `usePostProcess` and `useFilter` both take
 * it: written in place, a file, or one of the engine's own spread in. A file already here is poured
 * in now, and one still on its way when it lands.
 *
 * @param hook What a mistake is said to come from.
 * @returns The effect, and what lets go of its file again when it leaves.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const makePostEffect = (
    store: TRuntimeStore,
    options: TPostProcessOptions,
    source: TPostSource,
    hook: string,
): { effect: TPostEffect; unbind: () => void } => {
    const shader = resolveEffect(store, options, hook);
    if (shader === null && options.fragment === undefined) {
        throw new Error(
            `[NacatamalOn] ${hook}: it needs something to run. Give it a \`fragment\`, an ` +
            '`effect` from useLoadShader, or spread one of the engine\'s own such as dither().',
        );
    }
    if (options.palette != null && options.lut != null) {
        throw new Error(
            `[NacatamalOn] ${hook}: an effect reads one data texture, so it takes a palette ` +
            'or a table and not both. Use two effects if you want both.',
        );
    }
    const effect = newPostEffect(options, shader, source);
    if (shader === null) {
        return { effect, unbind: () => undefined };
    }
    rememberPostOverrides(effect, options.uniforms ?? {});
    effect.effect = shader;
    shader.bound.push(effect);
    // A file that is already here is poured in now; one still on its way arrives later, and
    // either order ends in the same place.
    if (shader.status === 'ready') {
        applyShaderToEffect(effect, shader);
    }
    return {
        effect,
        unbind: () => {
            const bound = shader.bound.indexOf(effect);
            if (bound !== -1) {
                shader.bound.splice(bound, 1);
            }
        },
    };
};
