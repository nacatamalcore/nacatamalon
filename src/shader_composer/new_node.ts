import type { TUniformType } from '../materials/types/t_uniforms';
import type { TComposerNode } from './types/t_composer_node';

/**
 * Puts a value together from its parts. What every composer function is built on; nothing outside
 * this folder calls it, because the composer functions are what fill the fields consistently.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const newNode = (
    kind: string,
    type: TUniformType,
    deps: TComposerNode[],
    extra: Partial<TComposerNode> = {},
): TComposerNode => ({ kind, type, deps, ...extra });
