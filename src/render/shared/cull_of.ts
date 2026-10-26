import type { TCullMode } from '../../materials/types/t_material';
import type { TDrawMesh } from '../interface';

/**
 * Which side of a model's triangles is thrown away, as both cards are to be told it.
 *
 * Asked of the material every frame, since a game may change it, and anything that is not one of the
 * three words draws as the usual side: a value set from plain JavaScript reaches the card otherwise,
 * and one card refuses a word it does not know while the other quietly draws the back. One rule for
 * both, so they cannot disagree.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const cullOf = (mesh: TDrawMesh): TCullMode =>
    mesh.material.cull === 'front' || mesh.material.cull === 'none' ? mesh.material.cull : 'back';
