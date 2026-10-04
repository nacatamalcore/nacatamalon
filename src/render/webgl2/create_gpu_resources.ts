import { createSpritePipeline } from './sprite/create_sprite_pipeline';
import { createTilemapPipeline } from './tilemap/create_tilemap_pipeline';
import { createMeshPipeline } from './mesh/create_mesh_pipeline';
import { FRAME_UNIFORM_FLOATS } from './frame/write_frame_uniforms';
import type { TSpritePipeline } from './sprite/types/t_sprite_pipeline';
import type { TTilemapPipeline } from './tilemap/types/t_tilemap_pipeline';
import type { TMeshPipeline } from './mesh/types/t_mesh_pipeline';

/**
 * Builds every GL object the backend draws with: the frame uniform buffer, the sprite pipeline and
 * the tilemap one.
 *
 * Called at boot and again when a lost context comes back, because everything it makes dies with
 * the context. One function for both is what keeps a restored game identical to a fresh one.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const createGpuResources = (
    gl: WebGL2RenderingContext,
    defaultSmooth: boolean,
): { frameUniformBuffer: WebGLBuffer; sprites: TSpritePipeline; tilemaps: TTilemapPipeline; meshes: TMeshPipeline } => {
    const frameUniformBuffer = gl.createBuffer();
    gl.bindBuffer(gl.UNIFORM_BUFFER, frameUniformBuffer);
    gl.bufferData(gl.UNIFORM_BUFFER, FRAME_UNIFORM_FLOATS * 4, gl.DYNAMIC_DRAW);

    const sprites = createSpritePipeline(gl, frameUniformBuffer, defaultSmooth);
    return {
        frameUniformBuffer,
        sprites,
        // The two share their samplers: how a texture is read is a setting of the game, not of one
        // pipeline, and two copies would be two things to keep in step.
        tilemaps: createTilemapPipeline(gl, frameUniformBuffer, sprites.samplers, defaultSmooth),
        meshes: createMeshPipeline(gl, sprites.samplers, defaultSmooth, sprites.whiteTexture),
    };
};
