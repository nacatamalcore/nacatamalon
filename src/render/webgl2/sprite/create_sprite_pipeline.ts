import { compileProgram } from '../utils/compile_program';
import { createWhiteTexture } from '../texture';
import { SPRITE_FRAGMENT_SHADER, SPRITE_VERTEX_SHADER } from './sprite_shader';
import { createSpriteMaterials } from '../material/sprite_materials';
import { INITIAL_SPRITE_CAPACITY, SPRITE_FLOATS, SPRITE_STRIDE } from './write_sprite_instances';
import type { TSpritePipeline } from './types/t_sprite_pipeline';
import { FRAME_UNIFORMS_BINDING } from '../bindings';

/**
 * The per-sprite attributes: location, floats and byte offset inside one 72-byte entry. The same
 * table as the WebGPU pipeline's second buffer. `drawSprites` walks it again to move every
 * attribute to the start of each run.
 *
 * @internal
 */
export const SPRITE_ATTRIBUTES: ReadonlyArray<{ location: number; size: number; offset: number }> = [
    { location: 1, size: 2, offset: 0 },    // x, y
    { location: 2, size: 2, offset: 8 },    // width, height
    { location: 3, size: 1, offset: 16 },   // rotation
    { location: 4, size: 2, offset: 20 },   // scaleX, scaleY
    { location: 5, size: 4, offset: 28 },   // r, g, b, a
    { location: 6, size: 2, offset: 44 },   // uvOffset x, y
    { location: 7, size: 2, offset: 52 },   // uvScale x, y
    { location: 8, size: 2, offset: 60 },   // anchor x, y
    { location: 9, size: 1, offset: 68 },   // view
];

/**
 * One sampler object: how a texture is read, whatever texture it is.
 */
const createSampler = (gl: WebGL2RenderingContext, filter: number): WebGLSampler => {
    const sampler = gl.createSampler();
    gl.samplerParameteri(sampler, gl.TEXTURE_MIN_FILTER, filter);
    gl.samplerParameteri(sampler, gl.TEXTURE_MAG_FILTER, filter);
    // WebGPU's default address mode, so an edge reads the same in both backends.
    gl.samplerParameteri(sampler, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.samplerParameteri(sampler, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    return sampler;
};

/**
 * Creates the WebGL2 sprite pipeline: program, vertex array, the quad, the instance buffer and the
 * two samplers.
 *
 * The same function runs at boot and after a lost context is restored, so there is one way to build
 * it and not two that could disagree.
 *
 * @internal
 * @param gl The context.
 * @param frameUniforms The shared uniform buffer holding the game's resolution and this frame's views.
 * @param defaultSmooth What a sprite that does not choose gets, from the game's `smooth` option.
 * @returns The created sprite pipeline.
 */
export const createSpritePipeline = (
    gl: WebGL2RenderingContext,
    frameUniforms: WebGLBuffer,
    defaultSmooth: boolean,
): TSpritePipeline => {
    const program = compileProgram(gl, SPRITE_VERTEX_SHADER, SPRITE_FRAGMENT_SHADER, 'sprite');

    // The uniform block reads binding 0, and binding 0 holds the frame uniforms.
    gl.uniformBlockBinding(program, gl.getUniformBlockIndex(program, 'Uniforms'), FRAME_UNIFORMS_BINDING);
    gl.bindBufferBase(gl.UNIFORM_BUFFER, FRAME_UNIFORMS_BINDING, frameUniforms);
    // The texture is always on unit 0.
    gl.useProgram(program);
    gl.uniform1i(gl.getUniformLocation(program, 'spriteTexture'), 0);

    const vao = gl.createVertexArray();
    gl.bindVertexArray(vao);

    // Location 0: the corners of the quad, shared by every sprite.
    const quad = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, quad);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
        -0.5, -0.5,
        0.5, -0.5,
        -0.5, 0.5,
        0.5, 0.5,
    ]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 8, 0);

    // Locations 1 to 9: one entry per sprite, advancing once per instance instead of per corner.
    const capacity = INITIAL_SPRITE_CAPACITY;
    const instances = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, instances);
    gl.bufferData(gl.ARRAY_BUFFER, capacity * SPRITE_STRIDE, gl.DYNAMIC_DRAW);
    for (const { location, size, offset } of SPRITE_ATTRIBUTES) {
        gl.enableVertexAttribArray(location);
        gl.vertexAttribPointer(location, size, gl.FLOAT, false, SPRITE_STRIDE, offset);
        gl.vertexAttribDivisor(location, 1);
    }

    gl.bindVertexArray(null);

    return {
        materials: createSpriteMaterials(gl),
        program,
        vao,
        quad,
        instances,
        instanceData: new Float32Array(capacity * SPRITE_FLOATS),
        capacity,
        samplers: {
            nearest: createSampler(gl, gl.NEAREST),
            linear: createSampler(gl, gl.LINEAR),
        },
        defaultSmooth,
        whiteTexture: createWhiteTexture(gl),
        runs: [],
        runCount: 0,
    };
};
