import { snapGridOf } from './fill_mesh_uniforms';
import type { TCameraSpace } from './compute_mvp_3d';

/**
 * A view's style as a plugin's kind is told it, kept and written over each pass.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TDrawableStyleSlot = { perPixel: boolean; affine: boolean; snap: { columns: number; rows: number } };

/**
 * An empty one, all off.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const newDrawableStyle = (): TDrawableStyleSlot => ({ perPixel: false, affine: false, snap: { columns: 0, rows: 0 } });

/**
 * Writes into `out` what the style of `space` asks a model whose material does not say: what a
 * model reads of it (fill_mesh_uniforms.ts) with no material in between, its grid worked out the
 * same way, so a kind drawn by it shivers on the same grid as the models beside it.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const fillDrawableStyle = (out: TDrawableStyleSlot, space: TCameraSpace): void => {
    const style = space.style;
    out.perPixel = style?.perPixel ?? false;
    out.affine = style?.affine ?? false;
    const [columns, rows] = snapGridOf(style?.vertexSnap, space);
    out.snap.columns = rows > 0 ? columns : 0;
    out.snap.rows = rows;
};
