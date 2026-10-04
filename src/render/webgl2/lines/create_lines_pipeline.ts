import { compileProgram } from '../utils/compile_program';
import { LINE_VERTEX_FLOATS } from '../../shared/line_vertex';
import { LINES_FRAGMENT_SHADER, LINES_VERTEX_SHADER } from './lines_shader';
import type { TCameraSpace } from '../../shared/compute_mvp_3d';

/**
 * How many corners a frame can hold before the buffer has to grow.
 */
const INITIAL_CAPACITY = 1024;

/**
 * What every set of lines in this game is drawn with on this card: one program and one buffer for
 * all of them, the way the particles are.
 *
 * Built the first time a frame has lines in it, and dropped when the context is lost, so the next
 * frame that needs it builds it again.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const createLinesPipeline = (gl: WebGL2RenderingContext) => {
    const program = compileProgram(gl, LINES_VERTEX_SHADER, LINES_FRAGMENT_SHADER, 'lines');
    const viewProjectionAt = gl.getUniformLocation(program, 'viewProjection');

    let capacity = INITIAL_CAPACITY;
    let corners = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, corners);
    gl.bufferData(gl.ARRAY_BUFFER, capacity * LINE_VERTEX_FLOATS * 4, gl.DYNAMIC_DRAW);

    const stride = LINE_VERTEX_FLOATS * 4;
    const vao = gl.createVertexArray();

    /**
     * Points the bound array object at the corners starting at `first`.
     */
    const pointAt = (first: number): void => {
        gl.bindBuffer(gl.ARRAY_BUFFER, corners);
        gl.vertexAttribPointer(0, 3, gl.FLOAT, false, stride, first * stride);
        gl.vertexAttribPointer(1, 4, gl.FLOAT, false, stride, first * stride + 3 * 4);
    };

    gl.bindVertexArray(vao);
    gl.enableVertexAttribArray(0);
    gl.enableVertexAttribArray(1);
    pointAt(0);
    gl.bindVertexArray(null);
    gl.bindBuffer(gl.ARRAY_BUFFER, null);

    let written = 0;

    return {
        program,
        vao,

        /**
         * Makes room for every corner this frame will draw, before any of them is drawn.
         */
        beginFrame: (count: number): void => {
            written = 0;
            if (count <= capacity) {
                return;
            }
            while (capacity < count) {
                capacity *= 2;
            }
            gl.deleteBuffer(corners);
            corners = gl.createBuffer();
            gl.bindBuffer(gl.ARRAY_BUFFER, corners);
            gl.bufferData(gl.ARRAY_BUFFER, capacity * LINE_VERTEX_FLOATS * 4, gl.DYNAMIC_DRAW);
            // The array object still points at the buffer that just went.
            gl.bindVertexArray(vao);
            pointAt(0);
            gl.bindVertexArray(null);
            gl.bindBuffer(gl.ARRAY_BUFFER, null);
        },

        /**
         * Puts one set's corners in the buffer and points the bound array object at them.
         */
        write: (data: Float32Array, count: number): void => {
            const at = written;
            gl.bindBuffer(gl.ARRAY_BUFFER, corners);
            gl.bufferSubData(gl.ARRAY_BUFFER, at * stride, data, 0, count * LINE_VERTEX_FLOATS);
            pointAt(at);
            written += count;
        },

        /**
         * Tells the program which camera the scene is seen through.
         */
        setView: (space: TCameraSpace): void => {
            gl.uniformMatrix4fv(viewProjectionAt, false, space.viewProjection);
        },

        destroy: (): void => {
            gl.deleteProgram(program);
            gl.deleteBuffer(corners);
            gl.deleteVertexArray(vao);
        },
    };
};

/**
 * Everything this card keeps for its lines.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TLinesPipeline = ReturnType<typeof createLinesPipeline>;
