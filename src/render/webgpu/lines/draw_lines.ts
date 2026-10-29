import { LINE_VERTEX_FLOATS } from '../../shared/line_vertex';
import type { TDrawLines } from '../../interface';
import type { TLinesPipeline } from './create_lines_pipeline';

/**
 * Draws one set of lines, seen through view `view`'s block: one call, however many lines it holds.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const drawLines = (gpuPass: GPURenderPassEncoder, lines: TLinesPipeline, item: TDrawLines, view: number): void => {
    if (item.count === 0 || view < 0) {
        return;
    }

    const at = lines.write(item.vertices, item.count);

    gpuPass.setPipeline(lines.pipeline);
    gpuPass.setBindGroup(0, lines.viewGroup(view));
    // Its own stretch of the one shared buffer, so every set lives in one buffer without two of them
    // writing over each other before the frame is submitted.
    gpuPass.setVertexBuffer(0, lines.buffer, at * LINE_VERTEX_FLOATS * 4, item.count * LINE_VERTEX_FLOATS * 4);
    gpuPass.draw(item.count);
};
