import { compileProgram } from '../utils';
import { FRAME_UNIFORMS_BINDING } from '../bindings';
import { createTilemapMaterials } from '../material/tilemap_materials';
import { TILEMAP_FRAGMENT_SHADER, TILEMAP_VERTEX_SHADER } from './tilemap_shader';
import type { TTilemapPipeline } from './types/t_tilemap_pipeline';

/**
 * Creates the program that draws a map's layers.
 *
 * It reads the same frame uniforms as the sprites, from the same binding, so a map and the
 * characters on it look through one camera by construction.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const createTilemapPipeline = (
    gl: WebGL2RenderingContext,
    frameUniforms: WebGLBuffer,
    samplers: { nearest: WebGLSampler; linear: WebGLSampler },
    defaultSmooth: boolean,
): TTilemapPipeline => {
    const program = compileProgram(gl, TILEMAP_VERTEX_SHADER, TILEMAP_FRAGMENT_SHADER, 'tilemap');

    gl.uniformBlockBinding(program, gl.getUniformBlockIndex(program, 'Uniforms'), FRAME_UNIFORMS_BINDING);
    gl.bindBufferBase(gl.UNIFORM_BUFFER, FRAME_UNIFORMS_BINDING, frameUniforms);
    gl.useProgram(program);
    gl.uniform1i(gl.getUniformLocation(program, 'tilesTexture'), 0);

    // The corners live in the layer's own buffer, so the array only remembers the shape of an
    // entry: where it is inside the map, and which piece of the sheet it shows.
    const vao = gl.createVertexArray();
    gl.bindVertexArray(vao);
    gl.enableVertexAttribArray(0);
    gl.enableVertexAttribArray(1);
    gl.bindVertexArray(null);

    return {
        materials: createTilemapMaterials(gl),
        program,
        vao,
        uniforms: {
            position: gl.getUniformLocation(program, 'layerPosition'),
            scale: gl.getUniformLocation(program, 'layerScale'),
            rotation: gl.getUniformLocation(program, 'layerRotation'),
            view: gl.getUniformLocation(program, 'layerView'),
            tint: gl.getUniformLocation(program, 'layerTint'),
        },
        samplers,
        defaultSmooth,
    };
};
