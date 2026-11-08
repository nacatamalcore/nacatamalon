/**
 * Everything the WebGL2 tilemap pipeline makes once and reuses. Rebuilt whole when a lost context
 * comes back, like the sprite one.
 *
 * @internal
 */
export type TTilemapPipeline = {
    /**
     * The effects this game has compiled for map layers on this card.
     */
    materials: TTilemapMaterials;
    /**
     * How a layer is drawn in a pass with 2D lights in it.
     */
    program: WebGLProgram;
    /**
     * Remembers which buffer feeds the corners. The buffer itself changes per layer.
     */
    vao: WebGLVertexArrayObject;
    /**
     * Where a layer's own numbers go, looked up once instead of on every draw.
     */
    uniforms: {
        position: WebGLUniformLocation | null;
        scale: WebGLUniformLocation | null;
        rotation: WebGLUniformLocation | null;
        view: WebGLUniformLocation | null;
        tint: WebGLUniformLocation | null;
    };
    /**
     * The same program and places for a pass with no 2D lights, which does not read them.
     */
    unlit: { program: WebGLProgram; uniforms: TTilemapPipeline['uniforms'] };
    samplers: { nearest: WebGLSampler; linear: WebGLSampler };
    defaultSmooth: boolean;
};

import type { TTilemapMaterials } from '../../material/tilemap_materials';
