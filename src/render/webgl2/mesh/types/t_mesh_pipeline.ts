import type { TJointTextures } from '../joint_texture';
import type { IBuffer } from '../../../interface';

/**
 * Everything the mesh program keeps between frames.
 *
 * One vertex array per shape rather than one for everything: a vertex array remembers which buffer
 * each attribute comes from, so keeping one per shape turns setting up a draw into a single call.
 * They are held weakly, so a shape nobody uses any more takes its own with it.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TMeshPipeline = {
    /**
     * The effects this game has compiled for models on this card.
     */
    materials: TMeshMaterials;
    program: WebGLProgram;
    /**
     * The same thing for a model that bends around its bones.
     */
    skinnedProgram: WebGLProgram;
    /**
     * Each skeleton's bones as a picture, filled once a frame however many models wear them.
     */
    joints: TJointTextures;
    /**
     * A second set, because a bending model reads two runs of corners and the other reads one.
     */
    skinnedVertexArrays: WeakMap<IBuffer, WebGLVertexArrayObject>;
    vertexArrays: WeakMap<IBuffer, WebGLVertexArrayObject>;
    /**
     * The block of one model's numbers, rewritten before each draw.
     */
    uniforms: WebGLBuffer;
    /**
     * The block of a scene's lights, rewritten when the scene being drawn changes.
     */
    lights: WebGLBuffer;
    uniformData: Float32Array;
    lightData: Float32Array;
    samplers: { nearest: WebGLSampler; linear: WebGLSampler };
    /**
     * How a model's picture is read, one sampler per way of reading it: the filter, and what the
     * picture does past its edge each way. All eighteen made with the pipeline, keyed as
     * `shared/texture_wrap.ts` spells it. The sprites' two stretch the edge, which is wrong for a model.
     */
    wrapSamplers: Map<string, WebGLSampler>;
    defaultSmooth: boolean;
    whiteTexture: WebGLTexture;
    /**
     * One step of depth, bound when a scene casts nothing, so a model is drawn by one program.
     */
    blankShadow: WebGLTexture | null;
};

import type { TMeshMaterials } from '../../material/mesh_materials';
