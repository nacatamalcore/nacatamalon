import { compileProgram } from '../utils/compile_program';
import { cullOf } from '../../shared/cull_of';
import { MESH_JOINTS_UNIT } from '../bindings';
import { SHADOW_DEPTH_BIAS, SHADOW_SLOPE_BIAS, SHADOW_MAP_SIZE } from '../../shared/light_space';
import {
    SHADOW_CUT_FRAGMENT_GLSL, SHADOW_CUT_SKINNED_VERTEX_GLSL, SHADOW_CUT_VERTEX_GLSL, SHADOW_FRAGMENT_GLSL,
    SHADOW_SKINNED_VERTEX_GLSL, SHADOW_VERTEX_GLSL,
} from './shadow_shader';
import { textureWrapOf, wrapKey } from '../../shared/texture_wrap';
import { toGlTexture } from '../texture';
import { toGlClip } from '../mesh/depth_range';
import { bindMaterialMaps, vertexArrayFor } from '../mesh/draw_meshes';
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
    /** Only in a program that cuts a caster out of its picture. */
    texture: WebGLUniformLocation | null;
    cut: WebGLUniformLocation | null;
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
        texture: gl.getUniformLocation(program, 'uTexture'),
        cut: gl.getUniformLocation(program, 'uCut'),
    });

    const plain = locate(compileProgram(gl, SHADOW_VERTEX_GLSL, SHADOW_FRAGMENT_GLSL, 'shadow'));
    const bending = locate(compileProgram(gl, SHADOW_SKINNED_VERTEX_GLSL, SHADOW_FRAGMENT_GLSL, 'shadow skinned'));

    // A caster cut out of its picture (`alphaCutoff`) reads that picture too: two more programs,
    // made the first time one casts.
    let cutting: { plain: TShadowProgram; bending: TShadowProgram } | null = null;
    const cutPrograms = (): { plain: TShadowProgram; bending: TShadowProgram } => {
        cutting ??= {
            plain: locate(compileProgram(gl, SHADOW_CUT_VERTEX_GLSL, SHADOW_CUT_FRAGMENT_GLSL, 'shadow cut')),
            bending: locate(compileProgram(gl, SHADOW_CUT_SKINNED_VERTEX_GLSL, SHADOW_CUT_FRAGMENT_GLSL, 'shadow cut skinned')),
        };
        return cutting;
    };

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
         *
         * `time`, `width` and `height` are what a material's corner hook is told, as in the pass that
         * lights the scene.
         */
        draw: (meshes: TMeshPipeline, mesh: TDrawMesh, model: Float32Array, time = 0, width = 0, height = 0): boolean => {
            const vao = vertexArrayFor(gl, meshes, mesh);
            if (vao === null || mesh.geometry === null || mesh.geometry.indexCount === 0) {
                return false;
            }

            // The side its material throws away, here as in the pass that lights the scene: a leaf
            // drawn on both sides casts from both.
            const cull = cullOf(mesh);
            if (cull === 'none') {
                gl.disable(gl.CULL_FACE);
            } else {
                gl.enable(gl.CULL_FACE);
                gl.cullFace(cull === 'front' ? gl.FRONT : gl.BACK);
            }

            const bends = mesh.skeleton !== null && mesh.geometry.skinBuffer !== null;
            const surface = mesh.material;
            // Cut out of its picture, by the same alpha and cutoff the model is drawn with.
            const cuts = (surface.alphaCutoff ?? 0) > 0;
            // A hook that moves the corners moves them here too, or the map holds the shape the file
            // made and that flat ghost shadows the model wherever the hook takes it behind. Cut out,
            // a colour hook casts through its own shader too: what it leaves out is left out here.
            const effect = (surface.vertexGlsl !== null || (cuts && surface.fragmentGlsl !== null)) && mesh.geometry.detailBuffer !== null
                ? meshes.materials.get(surface, bends, cull)
                : null;
            const hooked = effect !== null && !effect.failed ? meshes.materials.shadow(surface, bends, cuts) : null;
            // Cut by its picture alone: a material with no hooks, or one whose shadow the card refused.
            const cutters = cuts && hooked === null ? cutPrograms() : null;
            const shader = hooked ?? (cutters !== null ? (bends ? cutters.bending : cutters.plain) : bends ? bending : plain);
            gl.useProgram(shader.program);
            gl.uniformMatrix4fv(shader.lightViewProj, false, lightClip);
            gl.uniformMatrix4fv(shader.model, false, model);
            if (hooked !== null) {
                meshes.materials.bind(effect!, surface.uniforms ?? {}, null, time, width, height);
                if (cuts) {
                    bindMaterialMaps(gl, meshes, surface, hooked.mapNames);
                }
            }
            if (cuts) {
                const picture = surface.texture;
                const ready = picture !== null && picture.status === 'ready' && picture.gpu !== null;
                gl.activeTexture(gl.TEXTURE0);
                gl.bindTexture(gl.TEXTURE_2D, ready ? toGlTexture(picture.gpu!) : meshes.whiteTexture);
                // Read the way the model reads it, so the edge it casts is the edge it shows.
                const { u, v } = textureWrapOf(surface);
                gl.bindSampler(0, meshes.wrapSamplers.get(wrapKey((surface.smooth ?? meshes.defaultSmooth) ? 'linear' : 'nearest', u, v))!);
                // The material's own program was told its picture's unit when it was built.
                if (hooked === null) {
                    gl.uniform1i((shader as TShadowProgram).texture, 0);
                }
                gl.uniform2f(shader.cut, surface.alphaCutoff!, surface.alpha * surface.tint.a);
            }

            if (bends) {
                gl.activeTexture(gl.TEXTURE0 + MESH_JOINTS_UNIT);
                // The bones the scene's own pass uploaded: the same picture, named again here.
                gl.bindTexture(gl.TEXTURE_2D, meshes.joints.upload(mesh.skeleton!));
                gl.bindSampler(MESH_JOINTS_UNIT, null);
                if (hooked === null) {
                    gl.uniform1i((shader as TShadowProgram).joints, MESH_JOINTS_UNIT);
                }
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
            // A cut-out caster left its picture's sampler on the first unit.
            gl.bindSampler(0, null);
            gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        },

        destroy: (): void => {
            gl.deleteProgram(plain.program);
            gl.deleteProgram(bending.program);
            if (cutting !== null) {
                gl.deleteProgram(cutting.plain.program);
                gl.deleteProgram(cutting.bending.program);
            }
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
