import type { TDrawItem, TDrawLines } from '../../interface';
import type { TCameraSpace } from '../../shared/compute_mvp_3d';
import type { TLinesPipeline } from './create_lines_pipeline';

/**
 * How many corners of lines this frame will draw, counted before any of them is.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const countLineCorners = (drawables: readonly TDrawItem[]): number => {
    let total = 0;
    for (const item of drawables) {
        if (item.type === 'lines') {
            total += item.count;
        }
    }
    return total;
};

/**
 * Draws one set of lines, seen through `space`: one call, however many lines it holds.
 *
 * Depth is **tested and written**, as a model's is, and switched on here because on this card it is
 * context state. It is handed back the way the models leave it, off and not writing, so the sprites
 * drawn after it are not tested against anything.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const drawLines = (
    gl: WebGL2RenderingContext,
    lines: TLinesPipeline,
    item: TDrawLines,
    space: TCameraSpace | null,
): void => {
    if (item.count === 0 || space === null) {
        return;
    }

    gl.useProgram(lines.program);
    lines.setView(space);
    gl.bindVertexArray(lines.vao);
    lines.write(item.vertices, item.count);

    // On here and not assumed, for the reason the particles give: a scene of lines alone would
    // otherwise draw them with blending still off.
    gl.enable(gl.BLEND);
    gl.blendFuncSeparate(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA, gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    gl.enable(gl.DEPTH_TEST);
    gl.depthFunc(gl.LESS);
    gl.depthMask(true);

    gl.drawArrays(gl.LINES, 0, item.count);

    gl.disable(gl.DEPTH_TEST);
    gl.depthMask(false);
    gl.bindVertexArray(null);
    gl.useProgram(null);
};
