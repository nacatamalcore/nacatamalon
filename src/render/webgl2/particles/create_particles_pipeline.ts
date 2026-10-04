import { compileProgram } from '../utils/compile_program';
import { FRAME_UNIFORMS_BINDING } from '../bindings';
import { PARTICLE_3D_OFFSET, PARTICLE_FLOATS } from '../../shared/particle_instance';
import { PARTICLES_3D_VERTEX_SHADER, PARTICLES_FRAGMENT_SHADER, PARTICLES_VERTEX_SHADER } from './particles_shader';
import type { TCameraSpace } from '../../shared/compute_mvp_3d';

/**
 * How many a frame can hold before the buffer has to grow.
 */
const INITIAL_CAPACITY = 512;

/**
 * Where the picture is read from.
 */
const TEXTURE_UNIT = 0;

/**
 * What every emitter in this game is drawn with on this card.
 *
 * **One buffer and one program for all of them.** Blending here is context state rather than
 * something baked into a program, so the two ways of laying a particle down are one program and a
 * call, where the other backend needs two pipelines.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const createParticlesPipeline = (gl: WebGL2RenderingContext, quad: WebGLBuffer) => {
    const program = compileProgram(gl, PARTICLES_VERTEX_SHADER, PARTICLES_FRAGMENT_SHADER, 'particles');
    gl.uniformBlockBinding(program, gl.getUniformBlockIndex(program, 'Uniforms'), FRAME_UNIFORMS_BINDING);
    // A sampler uniform belongs to the program it was compiled into, so that program has to be the
    // current one while it is written. Getting this wrong is not an error anywhere: it writes into
    // whichever program happens to be bound, and the picture comes back from the wrong unit.
    gl.useProgram(program);
    gl.uniform1i(gl.getUniformLocation(program, 'particleTexture'), TEXTURE_UNIT);
    gl.useProgram(null);

    // The one for particles in space. Its camera is three plain uniforms rather than a block, set
    // once per emitter, because it is one scene's camera and not a table of them.
    const program3d = compileProgram(gl, PARTICLES_3D_VERTEX_SHADER, PARTICLES_FRAGMENT_SHADER, 'particles 3d');
    gl.useProgram(program3d);
    gl.uniform1i(gl.getUniformLocation(program3d, 'particleTexture'), TEXTURE_UNIT);
    gl.useProgram(null);
    const viewProjectionAt = gl.getUniformLocation(program3d, 'viewProjection');
    const rightAt = gl.getUniformLocation(program3d, 'cameraRight');
    const upAt = gl.getUniformLocation(program3d, 'cameraUp');

    let capacity = INITIAL_CAPACITY;
    let instances = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, instances);
    gl.bufferData(gl.ARRAY_BUFFER, capacity * PARTICLE_FLOATS * 4, gl.DYNAMIC_DRAW);

    const vao = gl.createVertexArray();
    gl.bindVertexArray(vao);

    gl.bindBuffer(gl.ARRAY_BUFFER, quad);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

    gl.bindBuffer(gl.ARRAY_BUFFER, instances);
    const stride = PARTICLE_FLOATS * 4;
    // The five per-particle fields. The divisor is what makes each one belong to a particle rather
    // than to a corner, and **forgetting it on a single attribute** is the classic failure here:
    // every particle then reads the first entry for that one field, so a whole cloud comes out the
    // same colour or the same size and nothing says why.
    const fields: [number, number, number][] = [[1, 2, 0], [2, 1, 2], [3, 1, 3], [4, 4, 4], [5, 1, 8]];
    for (const [location, size, offset] of fields) {
        gl.enableVertexAttribArray(location);
        gl.vertexAttribPointer(location, size, gl.FLOAT, false, stride, offset * 4);
        gl.vertexAttribDivisor(location, 1);
    }

    gl.bindVertexArray(null);
    gl.bindBuffer(gl.ARRAY_BUFFER, null);

    // The same buffer read the way a particle in space lays out its run, with a divisor on every one
    // of them for the reason given above.
    const fields3d: [number, number, number][] = [
        [1, 3, PARTICLE_3D_OFFSET.x], [2, 1, PARTICLE_3D_OFFSET.size], [3, 1, PARTICLE_3D_OFFSET.rotation], [4, 4, PARTICLE_3D_OFFSET.r],
    ];
    const vao3d = gl.createVertexArray();
    gl.bindVertexArray(vao3d);
    gl.bindBuffer(gl.ARRAY_BUFFER, quad);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.bindBuffer(gl.ARRAY_BUFFER, instances);
    for (const [location, size, offset] of fields3d) {
        gl.enableVertexAttribArray(location);
        gl.vertexAttribPointer(location, size, gl.FLOAT, false, stride, offset * 4);
        gl.vertexAttribDivisor(location, 1);
    }
    gl.bindVertexArray(null);
    gl.bindBuffer(gl.ARRAY_BUFFER, null);

    let written = 0;

    /**
     * Points the per-particle attributes of the array object that is bound at one emitter's stretch
     * of the shared buffer, laid out as `layout` says.
     */
    const pointAt = (first: number, layout = fields): void => {
        gl.bindBuffer(gl.ARRAY_BUFFER, instances);
        for (const [location, size, offset] of layout) {
            gl.vertexAttribPointer(location, size, gl.FLOAT, false, stride, (first * PARTICLE_FLOATS + offset) * 4);
        }
    };

    return {
        program,
        vao,

        /**
         * Makes room for every particle this frame will draw, before any of them is drawn.
         */
        beginFrame: (count: number): void => {
            written = 0;
            if (count <= capacity) {
                return;
            }
            while (capacity < count) {
                capacity *= 2;
            }
            gl.deleteBuffer(instances);
            instances = gl.createBuffer();
            gl.bindBuffer(gl.ARRAY_BUFFER, instances);
            gl.bufferData(gl.ARRAY_BUFFER, capacity * PARTICLE_FLOATS * 4, gl.DYNAMIC_DRAW);
            // Both array objects still point at the buffer that just went.
            gl.bindVertexArray(vao);
            pointAt(0);
            gl.bindVertexArray(vao3d);
            pointAt(0, fields3d);
            gl.bindVertexArray(null);
            gl.bindBuffer(gl.ARRAY_BUFFER, null);
        },

        /**
         * Puts one emitter's particles in the buffer, points the bound array object at them, and
         * says how many. `deep` for particles in space, whose run is laid out their own way.
         */
        write: (data: Float32Array, count: number, deep = false): void => {
            const at = written;
            gl.bindBuffer(gl.ARRAY_BUFFER, instances);
            gl.bufferSubData(gl.ARRAY_BUFFER, at * PARTICLE_FLOATS * 4, data, 0, count * PARTICLE_FLOATS);
            pointAt(at, deep ? fields3d : fields);
            written += count;
        },

        program3d,
        vao3d,

        /**
         * Tells the program for particles in space which camera the scene is seen through.
         */
        setView: (space: TCameraSpace): void => {
            gl.uniformMatrix4fv(viewProjectionAt, false, space.viewProjection);
            gl.uniform3f(rightAt, space.right[0], space.right[1], space.right[2]);
            gl.uniform3f(upAt, space.up[0], space.up[1], space.up[2]);
        },

        destroy: (): void => {
            gl.deleteProgram(program);
            gl.deleteProgram(program3d);
            gl.deleteBuffer(instances);
            gl.deleteVertexArray(vao);
            gl.deleteVertexArray(vao3d);
        },
    };
};

/**
 * Everything this card keeps for its particles.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TParticlesPipeline = ReturnType<typeof createParticlesPipeline>;
