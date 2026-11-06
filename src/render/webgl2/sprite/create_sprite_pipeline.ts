import { compileProgram } from '../utils/compile_program';
import { createWhiteTexture } from '../texture';
import { SPRITE_BATCH_DISTANCE_FIELD_FRAGMENT_SHADER, SPRITE_BATCH_FRAGMENT_SHADER, SPRITE_BATCH_VERTEX_SHADER } from './batch_shader';
import { SPRITE_TEXTURE_SLOTS } from '../../shared/sprite_batch';
import { SPRITE_VERTEX_SHADER, SPRITE_FRAGMENT_SHADER, SPRITE_DISTANCE_FIELD_FRAGMENT_SHADER } from './sprite_shader';
import { createSpriteMaterials } from '../material/sprite_materials';
import { buildSpriteDistanceFieldMaterialShaderGlsl } from '../material/sprite_material_shader';
import { INITIAL_SPRITE_CAPACITY, SPRITE_FLOATS, SPRITE_STRIDE } from './write_sprite_instances';
import type { TSpritePipeline } from './types/t_sprite_pipeline';
import { FRAME_UNIFORMS_BINDING } from '../bindings';

/**
 * The per-sprite attributes: location, floats and byte offset inside one 88-byte entry. The same
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
    { location: 10, size: 2, offset: 72 },  // pictures across, down
    { location: 11, size: 2, offset: 80 },  // where the pattern starts
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
    // The plain one and the one for distance fields share the corners and everything they read, and
    // differ only in the ending, so both are set up alike, and so are their batch versions.
    const programFor = (fragment: string, label: string, batch = false): WebGLProgram => {
        const built = compileProgram(gl, batch ? SPRITE_BATCH_VERTEX_SHADER : SPRITE_VERTEX_SHADER, fragment, label);
        // The uniform block reads binding 0, and binding 0 holds the frame uniforms.
        gl.uniformBlockBinding(built, gl.getUniformBlockIndex(built, 'Uniforms'), FRAME_UNIFORMS_BINDING);
        // The picture is on unit 0. A batch reads its other seven on units 1 to 7.
        gl.useProgram(built);
        for (let i = 0; i < (batch ? SPRITE_TEXTURE_SLOTS : 1); i++) {
            gl.uniform1i(gl.getUniformLocation(built, i === 0 ? 'spriteTexture' : `spriteTexture${i}`), i);
        }
        return built;
    };
    const distanceFieldProgram = programFor(SPRITE_DISTANCE_FIELD_FRAGMENT_SHADER, 'sprite distance field');
    // Compile every built-in variant at boot (and on restore), never from a draw. A compiler or
    // driver error is reported here once, before the game starts drawing.
    const batchDistanceFieldProgram = programFor(SPRITE_BATCH_DISTANCE_FIELD_FRAGMENT_SHADER, 'sprite batch distance field', true);
    const batchProgram = programFor(SPRITE_BATCH_FRAGMENT_SHADER, 'sprite batch', true);
    const program = programFor(SPRITE_FRAGMENT_SHADER, 'sprite');
    gl.bindBufferBase(gl.UNIFORM_BUFFER, FRAME_UNIFORMS_BINDING, frameUniforms);

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
        batchProgram,
        batchDistanceFieldProgram,
        materials: createSpriteMaterials(gl),
        distanceFieldMaterials: createSpriteMaterials(gl, buildSpriteDistanceFieldMaterialShaderGlsl),
        program,
        distanceFieldProgram,
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
