import { compileProgram } from '../utils/compile_program';
import { createMeshMaterials } from '../material/mesh_materials';
import { LIGHT_UNIFORM_FLOATS, MESH_UNIFORM_FLOATS } from '../../shared';
import { MESH_FRAGMENT_GLSL, MESH_VERTEX_GLSL } from './mesh_shader';
import { SKINNED_VERTEX_GLSL } from './skinned_shader';
import { createJointTextures } from './joint_texture';
import { TEXTURE_WRAPS, wrapKey } from '../../shared/texture_wrap';
import type { TMeshPipeline } from './types/t_mesh_pipeline';
import { MESH_JOINTS_UNIT, MESH_LIGHTS_BINDING, MESH_SHADOW_UNIT, MESH_TEXTURE_UNIT, MESH_UNIFORMS_BINDING } from '../bindings';

/**
 * Creates the program that draws models, its vertex array and the two blocks it reads.
 *
 * Both blocks are `std140`, which lays out a matrix and a group of four numbers exactly the way the
 * other card does. That is what lets one packer on the engine's side fill the numbers for both, and
 * what a test can check without a card at all.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
/**
 * One step of depth, bound whenever a scene casts no shadow.
 *
 * Four bytes, and what they buy is that a model is drawn by one program either way. A comparing
 * sampler with nothing bound is not a blank answer on this card: it is undefined, which in practice
 * means a scene that looks right on the machine it was written on.
 *
 * It is set up exactly like the real map, comparison and all, so what comes back is an honest "yes,
 * lit" rather than something the shader has to know to ignore.
 */
const createBlankShadow = (gl: WebGL2RenderingContext): WebGLTexture | null => {
    const texture = gl.createTexture();
    if (texture === null) {
        return null;
    }
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.DEPTH_COMPONENT32F, 1, 1, 0, gl.DEPTH_COMPONENT, gl.FLOAT, new Float32Array([1]));
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_COMPARE_MODE, gl.COMPARE_REF_TO_TEXTURE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_COMPARE_FUNC, gl.LEQUAL);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.bindTexture(gl.TEXTURE_2D, null);
    return texture;
};

export const createMeshPipeline = (gl: WebGL2RenderingContext, samplers: { nearest: WebGLSampler; linear: WebGLSampler }, defaultSmooth: boolean, whiteTexture: WebGLTexture): TMeshPipeline => {
    const program = compileProgram(gl, MESH_VERTEX_GLSL, MESH_FRAGMENT_GLSL, 'mesh');
    // Its own program rather than a branch inside the other: what a corner carries differs, and a
    // card is told that once, when the program is built.
    const skinnedProgram = compileProgram(gl, SKINNED_VERTEX_GLSL, MESH_FRAGMENT_GLSL, 'skinned mesh');

    for (const p of [program, skinnedProgram]) {
        gl.uniformBlockBinding(p, gl.getUniformBlockIndex(p, 'Uniforms'), MESH_UNIFORMS_BINDING);
        gl.uniformBlockBinding(p, gl.getUniformBlockIndex(p, 'Lights'), MESH_LIGHTS_BINDING);
    }

    const uniforms = gl.createBuffer();
    gl.bindBuffer(gl.UNIFORM_BUFFER, uniforms);
    gl.bufferData(gl.UNIFORM_BUFFER, MESH_UNIFORM_FLOATS * 4, gl.DYNAMIC_DRAW);

    const lights = gl.createBuffer();
    gl.bindBuffer(gl.UNIFORM_BUFFER, lights);
    gl.bufferData(gl.UNIFORM_BUFFER, LIGHT_UNIFORM_FLOATS * 4, gl.DYNAMIC_DRAW);
    gl.bindBuffer(gl.UNIFORM_BUFFER, null);

    gl.useProgram(program);
    // The picture goes in unit 0, which is where the 2D puts its own: nothing else is bound while a
    // model draws, so they cannot tread on each other.
    gl.uniform1i(gl.getUniformLocation(program, 'meshTexture'), MESH_TEXTURE_UNIT);
    gl.uniform1i(gl.getUniformLocation(program, 'shadowMap'), MESH_SHADOW_UNIT);

    gl.useProgram(skinnedProgram);
    gl.uniform1i(gl.getUniformLocation(skinnedProgram, 'meshTexture'), MESH_TEXTURE_UNIT);
    gl.uniform1i(gl.getUniformLocation(skinnedProgram, 'uJoints'), MESH_JOINTS_UNIT);
    gl.uniform1i(gl.getUniformLocation(skinnedProgram, 'shadowMap'), MESH_SHADOW_UNIT);
    gl.useProgram(null);

    // Every way a model's picture can be read, made now rather than in the middle of a frame.
    const wrapSamplers = new Map<string, WebGLSampler>();
    const address = { repeat: gl.REPEAT, clamp: gl.CLAMP_TO_EDGE, mirror: gl.MIRRORED_REPEAT };
    for (const filter of ['nearest', 'linear'] as const) {
        const mode = filter === 'linear' ? gl.LINEAR : gl.NEAREST;
        for (const u of TEXTURE_WRAPS) {
            for (const v of TEXTURE_WRAPS) {
                const sampler = gl.createSampler();
                gl.samplerParameteri(sampler, gl.TEXTURE_MIN_FILTER, mode);
                gl.samplerParameteri(sampler, gl.TEXTURE_MAG_FILTER, mode);
                gl.samplerParameteri(sampler, gl.TEXTURE_WRAP_S, address[u]);
                gl.samplerParameteri(sampler, gl.TEXTURE_WRAP_T, address[v]);
                wrapSamplers.set(wrapKey(filter, u, v), sampler);
            }
        }
    }

    return {
        materials: createMeshMaterials(gl),
        program,
        skinnedProgram,
        joints: createJointTextures(gl),
        skinnedVertexArrays: new WeakMap(),
        vertexArrays: new WeakMap(),
        uniforms,
        lights,
        uniformData: new Float32Array(MESH_UNIFORM_FLOATS),
        lightData: new Float32Array(LIGHT_UNIFORM_FLOATS),
        samplers,
        wrapSamplers,
        defaultSmooth,
        whiteTexture,
        blankShadow: createBlankShadow(gl),
    };
};
