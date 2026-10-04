import { compileProgram } from '../utils/compile_program';
import { MESH_JOINTS_UNIT } from '../bindings';
import { SHADOW_DEPTH_BIAS, SHADOW_SLOPE_BIAS, SHADOW_MAP_SIZE } from '../../shared/light_space';
import { SHADOW_FRAGMENT_GLSL, SHADOW_SKINNED_VERTEX_GLSL, SHADOW_VERTEX_GLSL } from './shadow_shader';
import { toGlClip } from '../mesh/depth_range';
import { vertexArrayFor } from '../mesh/draw_meshes';
import type { TDrawMesh } from '../../interface';
import type { TMeshPipeline } from '../mesh/types/t_mesh_pipeline';
import type { TShadowMap } from './shadow_map';

/**
 * One compiled program and the three places numbers go into it.
 */
type TShadowProgram = {
    program: WebGLProgram;
    lightViewProj: WebGLUniformLocation | null;
    model: WebGLUniformLocation | null;
    joints: WebGLUniformLocation | null;
};

/**
 * Everything the shadow pass draws with on this card: two programs, and the light's matrix in this
 * card's own depth range.
 *
 * Built the first time a frame has a light asking to cast, next to the map itself. Two programs and
 * not one because a model that bends has to cast **the pose it is in**, and the bone blend happens
 * in the corner stage.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const createShadowPipeline = (gl: WebGL2RenderingContext) => {
    const locate = (program: WebGLProgram): TShadowProgram => ({
        program,
        lightViewProj: gl.getUniformLocation(program, 'uLightViewProj'),
        model: gl.getUniformLocation(program, 'uModel'),
        joints: gl.getUniformLocation(program, 'uJoints'),
    });

    const plain = locate(compileProgram(gl, SHADOW_VERTEX_GLSL, SHADOW_FRAGMENT_GLSL, 'shadow'));
    const bending = locate(compileProgram(gl, SHADOW_SKINNED_VERTEX_GLSL, SHADOW_FRAGMENT_GLSL, 'shadow skinned'));

    // The light's matrix in this card's range, kept between frames: one matrix for the whole frame,
    // however many models cast into it.
    const lightClip = new Float32Array(16);

    return {
        /**
         * Points everything at the map and clears it, ready for casters.
         *
         * The bias is the same pair of numbers the other card is given and means the same thing by
         * them. Core never calls this at all on this card, so the same scene stripes itself here and
         * not there, with nothing in the game to blame.
         */
        begin: (map: TShadowMap, lightViewProj: Float32Array): void => {
            lightClip.set(lightViewProj);
            toGlClip(lightClip);

            gl.bindFramebuffer(gl.FRAMEBUFFER, map.framebuffer);
            gl.viewport(0, 0, SHADOW_MAP_SIZE, SHADOW_MAP_SIZE);
            gl.enable(gl.DEPTH_TEST);
            gl.depthFunc(gl.LESS);
            gl.depthMask(true);
            // Everything that would be drawn casts what it shows, which is the same word the pass
            // that lights the scene uses.
            gl.enable(gl.CULL_FACE);
            gl.cullFace(gl.BACK);
            gl.enable(gl.POLYGON_OFFSET_FILL);
            gl.polygonOffset(SHADOW_SLOPE_BIAS, SHADOW_DEPTH_BIAS);
            // Cleared to the far plane: nothing has been seen along any line out of the light yet.
            gl.clearDepth(1);
            gl.clear(gl.DEPTH_BUFFER_BIT);
        },

        /**
         * Draws one caster into the map, and says whether it drew.
         */
        draw: (meshes: TMeshPipeline, mesh: TDrawMesh, model: Float32Array): boolean => {
            const vao = vertexArrayFor(gl, meshes, mesh);
            if (vao === null || mesh.geometry === null || mesh.geometry.indexCount === 0) {
                return false;
            }

            const bends = mesh.skeleton !== null && mesh.geometry.skinBuffer !== null;
            const shader = bends ? bending : plain;
            gl.useProgram(shader.program);
            gl.uniformMatrix4fv(shader.lightViewProj, false, lightClip);
            gl.uniformMatrix4fv(shader.model, false, model);

            if (bends) {
                gl.activeTexture(gl.TEXTURE0 + MESH_JOINTS_UNIT);
                // The bones the scene's own pass uploaded: the same picture, named again here.
                gl.bindTexture(gl.TEXTURE_2D, meshes.joints.upload(mesh.skeleton!));
                gl.bindSampler(MESH_JOINTS_UNIT, null);
                gl.uniform1i(shader.joints, MESH_JOINTS_UNIT);
            }

            gl.bindVertexArray(vao);
            const indexType = mesh.geometry.indexType === 'uint32' ? gl.UNSIGNED_INT : gl.UNSIGNED_SHORT;
            gl.drawElements(gl.TRIANGLES, mesh.geometry.indexCount, indexType, 0);
            gl.bindVertexArray(null);
            return true;
        },

        /**
         * Puts back everything the pass switched on.
         *
         * Everything else in this backend draws with these off, and a setting left behind here would
         * show up somewhere else entirely, as a sprite that vanished or a map drawn half missing.
         * The viewport is not put back here: the frame sets it per pass, which is the next thing it
         * does.
         */
        end: (): void => {
            gl.disable(gl.POLYGON_OFFSET_FILL);
            gl.polygonOffset(0, 0);
            gl.disable(gl.CULL_FACE);
            gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        },

        destroy: (): void => {
            gl.deleteProgram(plain.program);
            gl.deleteProgram(bending.program);
        },
    };
};

/**
 * The shadow pass, as this backend holds it.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TShadowPipeline = ReturnType<typeof createShadowPipeline>;
