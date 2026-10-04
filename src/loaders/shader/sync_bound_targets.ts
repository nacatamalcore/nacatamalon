import { applyShader } from '../../materials/apply_shader';
import { applyShaderToEffect } from '../../post/apply_shader_to_effect';
import type { TShader } from './types/t_shader';

/**
 * Pours a file into everything already built on it. Called once, the moment the bytes land.
 *
 * The dispatch lives here, with the file, rather than on either side of it: a material knows nothing
 * about screen-wide effects and an effect knows nothing about materials, and the only thing that
 * knows both are waiting is the file they are waiting on.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const syncBoundTargets = (shader: TShader): void => {
    for (const target of shader.bound) {
        if (target.type === 'post') {
            applyShaderToEffect(target, shader);
            continue;
        }
        applyShader(target, shader);
    }
};
