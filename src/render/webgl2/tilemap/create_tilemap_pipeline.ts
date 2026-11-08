import { compileProgram } from '../utils';
import { withoutLights2d } from '../../shared/lighting_2d_shader';
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
    // Twice: lit by the 2D lights, and for a pass with none, which does not read them. Each keeps
    // where its own layer numbers go, because on this card those belong to one program.
    const programFor = (lit: boolean) => {
        const program = compileProgram(gl, TILEMAP_VERTEX_SHADER, lit ? TILEMAP_FRAGMENT_SHADER : withoutLights2d(TILEMAP_FRAGMENT_SHADER), lit ? 'tilemap' : 'tilemap unlit');
        gl.uniformBlockBinding(program, gl.getUniformBlockIndex(program, 'Uniforms'), FRAME_UNIFORMS_BINDING);
        gl.useProgram(program);
        gl.uniform1i(gl.getUniformLocation(program, 'tilesTexture'), 0);
        return {
            program,
            uniforms: {
                position: gl.getUniformLocation(program, 'layerPosition'),
                scale: gl.getUniformLocation(program, 'layerScale'),
                rotation: gl.getUniformLocation(program, 'layerRotation'),
                view: gl.getUniformLocation(program, 'layerView'),
                tint: gl.getUniformLocation(program, 'layerTint'),
            },
        };
    };
    const lit = programFor(true);
    const unlit = programFor(false);
    gl.bindBufferBase(gl.UNIFORM_BUFFER, FRAME_UNIFORMS_BINDING, frameUniforms);

    // The corners live in the layer's own buffer, so the array only remembers the shape of an
    // entry: where it is inside the map, which point of the sheet it shows, and its cell's window.
    const vao = gl.createVertexArray();
    gl.bindVertexArray(vao);
    gl.enableVertexAttribArray(0);
    gl.enableVertexAttribArray(1);
    gl.enableVertexAttribArray(2);
    gl.bindVertexArray(null);

    return {
        materials: createTilemapMaterials(gl),
        program: lit.program,
        uniforms: lit.uniforms,
        unlit,
        vao,
        samplers,
        defaultSmooth,
    };
};
