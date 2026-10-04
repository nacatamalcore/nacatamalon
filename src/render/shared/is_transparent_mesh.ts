import type { TDrawMesh } from '../interface';

/**
 * Whether a model is seen through: drawn after the solid ones, furthest first, and without writing
 * depth.
 *
 * Asked every frame rather than decided once, because `alpha` is a number a game changes: a fade
 * turns a solid model into a see-through one halfway, and back.
 *
 * **Why a see-through model must not write depth.** The depth buffer keeps one distance per pixel.
 * For solid things that is enough, since the nearest wins whatever the order. A see-through one
 * needs what is behind it already drawn, to blend over it; and if it also wrote its distance, what
 * came after it and behind it would be thrown away, and the glass would hide what it holds.
 *
 * One rule for the frame's order and for both backends, so they can never disagree about which
 * models are glass.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const isTransparentMesh = (mesh: TDrawMesh): boolean =>
    mesh.material.transparent ?? mesh.material.alpha * mesh.material.tint.a < 1;
