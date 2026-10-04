import { getActiveBox, getActiveGame } from '../../store';
import { newPostEffect } from '../../post/new_post_effect';
import { rememberPostOverrides } from '../../post/apply_shader_to_effect';
import { applyShaderToEffect } from '../../post/apply_shader_to_effect';
import type { TPostEffect } from '../../post/types/t_post_effect';
import type { TPostProcessOptions } from '../../post/types/t_post_options';
import type { TShader } from '../../loaders/shader/types/t_shader';
import type { TUniformValues } from '../../materials/types/t_uniforms';

/**
 * The file the options ask for. A name nothing was loaded under is a typo, never "no effect".
 */
const resolveEffect = (options: TPostProcessOptions): TShader | null => {
    if (options.effect === undefined) {
        return null;
    }
    if (typeof options.effect !== 'string') {
        return options.effect;
    }

    const found = getActiveGame()?.get('assets').shaders.get(options.effect);
    if (found === undefined) {
        throw new Error(
            `[NacatamalOn] usePostProcess: no shader loaded under key '${options.effect}'. ` +
            `Did you forget useLoadShader({ src, key: '${options.effect}' })?`,
        );
    }
    return found;
};

/**
 * Adds a full-screen effect: a shader that reads the finished frame and gives back what to show.
 *
 * A material changes one thing; this changes **the picture**. That is what a palette reduction or a
 * dither has to be, because "what colours may this frame use" is a question about the screen and not
 * about any sprite on it.
 *
 * **The chain belongs to the game; the entry belongs to the scene.** Opening a pause menu over a
 * level does not change how the screen looks, so effects do not stack up as scenes do. But the scene
 * that installed one takes it away when it closes.
 *
 * **Order is the order you ask, and order is the picture**: each effect reads what the one before it
 * produced. Grade first and limit last, or you will be grading colours the machine cannot show.
 *
 * Everything but whether it is switched on is read every frame, so writing a number into the
 * `uniforms` of what this gives back animates the effect with nothing reinstalled.
 *
 * @param options What the effect is, and what to set its knobs to.
 * @returns The effect, to read and to change.
 * @typeParam U Its knobs by name. Spreading in `dither()` or writing `uniforms: { curve: 0.3 }` fills it in,
 *     so `effect.uniforms.levels` comes back as a number rather than a number or a list.
 *
 * @example
 * ```ts
 * const Level = () => {
 *     const nes = useLoadPalette({ src: '/palettes/nes.palette' });
 *
 *     usePostProcess({ ...paletteMatch(), palette: nes });
 *
 *     return createScene();
 * };
 * ```
 *
 * @category Post-processing
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const usePostProcess = <U extends TUniformValues = TUniformValues>(options: TPostProcessOptions<U>): TPostEffect<U> => {
    const store = getActiveGame();
    const box = getActiveBox();
    if (store === null || box === null) {
        throw new Error('[NacatamalOn] usePostProcess: call it inside a scene body.');
    }

    const shader = resolveEffect(options);
    if (shader === null && options.fragment === undefined) {
        throw new Error(
            '[NacatamalOn] usePostProcess: it needs something to run. Give it a `fragment`, an ' +
            '`effect` from useLoadShader, or spread one of the engine\'s own such as dither().',
        );
    }
    if (options.palette != null && options.lut != null) {
        throw new Error(
            '[NacatamalOn] usePostProcess: an effect reads one data texture, so it takes a palette ' +
            'or a table and not both. Use two effects if you want both.',
        );
    }

    const effect = newPostEffect(options, shader, 'scene');

    if (shader !== null) {
        rememberPostOverrides(effect, options.uniforms ?? {});
        effect.effect = shader;
        shader.bound.push(effect);
        // A file that is already here is poured in now; one still on its way arrives later, and
        // either order ends in the same place.
        if (shader.status === 'ready') {
            applyShaderToEffect(effect, shader);
        }
    }

    const { effects } = store.get('post');
    effects.push(effect);

    // The scene owns its entry even though the game owns the chain.
    box.cleanups.push(() => {
        const at = effects.indexOf(effect);
        if (at !== -1) {
            effects.splice(at, 1);
        }
        if (shader !== null) {
            const bound = shader.bound.indexOf(effect);
            if (bound !== -1) {
                shader.bound.splice(bound, 1);
            }
        }
    });

    // The knobs are the ones it was given, laid over a file's or a built-in's; their type is the one
    // the caller wrote, which is all the generic says.
    return effect as TPostEffect<U>;
};
