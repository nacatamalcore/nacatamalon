import type { TMaterial } from '../../../materials/types/t_material';
import type { TPostEffect } from '../../../post/types/t_post_effect';

/**
 * Something a shader file can be poured into once it lands.
 *
 * The two kinds have almost nothing else in common, and they do not need to: a file knows only that
 * whoever is waiting on it has somewhere to put a fragment hook, a vertex hook and a set of knobs.
 *
 * @category Assets & loading
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TShaderTarget = TMaterial | TPostEffect;
