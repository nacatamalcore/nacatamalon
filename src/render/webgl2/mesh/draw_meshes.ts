import { fillLightUniforms, fillMeshUniforms } from '../../shared';
import { cullOf } from '../../shared/cull_of';
import { isTransparentMesh } from '../../shared/is_transparent_mesh';
import { textureWrapOf, wrapKey } from '../../shared/texture_wrap';
import { toGlBuffer } from '../resources';
import { toGlTexture } from '../texture';
import { isAway } from '../../../loaders/texture/is_away';
import { MESH_EMISSIVE_UNIT, MESH_JOINTS_UNIT, MESH_LIGHTS_BINDING, MESH_MAP_UNITS, MESH_SHADOW_UNIT, MESH_UNIFORMS_BINDING } from '../bindings';
import type { TCameraSpace } from '../../shared/compute_mvp_3d';
import type { TDrawLight, TDrawMesh, TDrawView3d } from '../../interface';
import type { TShadowUniforms } from '../../shared/fill_light_uniforms';
import type { TMeshPipeline } from './types/t_mesh_pipeline';

/**
 * The vertex array for a shape, made the first time it is drawn.
 *
 * It remembers which buffer each of the attributes comes from and which list of triangles to
 * read, so every later draw of that shape is one call instead of five.
 *
 * Shared with the shadow pass, which draws the same shapes from somewhere else: a second set of
 * these keyed the same way would be a second copy of every shape's bindings, and they would drift
 * the first time the corner layout changed.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const vertexArrayFor = (gl: WebGL2RenderingContext, meshes: TMeshPipeline, mesh: TDrawMesh): WebGLVertexArrayObject | null => {
    const geometry = mesh.geometry;
    if (geometry === null || geometry.vertexBuffer === null || geometry.colorBuffer === null || geometry.indexBuffer === null) {
        return null;
    }

    // Two sets, keyed the same way: the same shape could be drawn either way, and one set keyed
    // only by its corners would hand back whichever was built first.
    const bends = geometry.skinBuffer !== null;
    const held = bends ? meshes.skinnedVertexArrays : meshes.vertexArrays;
    const existing = held.get(geometry.vertexBuffer);
    if (existing !== undefined) {
        return existing;
    }

    const vao = gl.createVertexArray();
    gl.bindVertexArray(vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, toGlBuffer(geometry.vertexBuffer));
    // Where the corner is, which way its surface faces, and what it shows: 32 bytes in all.
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 32, 0);
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 32, 12);
    gl.enableVertexAttribArray(2);
    gl.vertexAttribPointer(2, 2, gl.FLOAT, false, 32, 24);

    // The colour painted on each corner, from a run of its own: four bytes, read as 0 to 1.
    gl.bindBuffer(gl.ARRAY_BUFFER, toGlBuffer(geometry.colorBuffer));
    gl.enableVertexAttribArray(5);
    gl.vertexAttribPointer(5, 4, gl.UNSIGNED_BYTE, true, 4, 0);

    // Each corner's tangent and second picture coordinate, from a run of their own: 24 bytes. Only a
    // material's program reads them; the built-in one declares nothing at 6 and 7, and an attribute
    // nobody reads costs nothing.
    if (geometry.detailBuffer !== null) {
        gl.bindBuffer(gl.ARRAY_BUFFER, toGlBuffer(geometry.detailBuffer));
        gl.enableVertexAttribArray(6);
        gl.vertexAttribPointer(6, 4, gl.FLOAT, false, 24, 0);
        gl.enableVertexAttribArray(7);
        gl.vertexAttribPointer(7, 2, gl.FLOAT, false, 24, 16);
    }

    if (bends) {
        // A second run beside the first: which four bones carry the corner, and how much of it
        // each one owns. Its own run so a shape that does not bend pays nothing for this.
        gl.bindBuffer(gl.ARRAY_BUFFER, toGlBuffer(geometry.skinBuffer!));
        gl.enableVertexAttribArray(3);
        gl.vertexAttribPointer(3, 4, gl.FLOAT, false, 32, 0);
        gl.enableVertexAttribArray(4);
        gl.vertexAttribPointer(4, 4, gl.FLOAT, false, 32, 16);
    }

    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, toGlBuffer(geometry.indexBuffer));
    gl.bindVertexArray(null);

    held.set(geometry.vertexBuffer, vao);
    return vao;
};

/**
 * Sends a scene's lights up. Called when the scene being drawn changes, which in a frame of one
 * scene is once.
 *
 * @internal
 */
export const writeMeshLights = (
    gl: WebGL2RenderingContext,
    meshes: TMeshPipeline,
    view: TDrawView3d,
    shadow: TShadowUniforms | null = null,
): void => {
    // Only the scene the shadow was drawn for is told about it. Another scene stacked over it has
    // its own lights and its own numbering, so the index would point at a different lamp.
    fillLightUniforms(meshes.lightData, view.lights, view.ambient, shadow !== null && shadow.view === view ? shadow : null, view.fog ?? null, view.camera);
    gl.bindBuffer(gl.UNIFORM_BUFFER, meshes.lights);
    gl.bufferSubData(gl.UNIFORM_BUFFER, 0, meshes.lightData);
    gl.bindBuffer(gl.UNIFORM_BUFFER, null);
};

/**
 * A material's extra maps, on their own units, in the order its shader reads them. A map the
 * material does not carry, or one still loading, reads as white and the model is drawn anyway. The
 * shadow pass binds them the same way, for a shadow cut by what a hook reads of them.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const bindMaterialMaps = (gl: WebGL2RenderingContext, meshes: TMeshPipeline, surface: TDrawMesh['material'], mapNames: readonly string[]): void => {
    MESH_MAP_UNITS.forEach((unit, i) => {
        const name = mapNames[i];
        const map = name === undefined ? undefined : surface.maps?.[name];
        if (name !== undefined && map === undefined) {
            meshes.materials.warnIfMapMissing(surface, name);
        }
        const ready = map !== undefined && map.texture.status === 'ready' && map.texture.gpu !== null;
        gl.activeTexture(gl.TEXTURE0 + unit);
        gl.bindTexture(gl.TEXTURE_2D, ready ? toGlTexture(map.texture.gpu!) : meshes.whiteTexture);
        const { u, v } = textureWrapOf(map ?? {});
        const filter = (map?.smooth ?? surface.smooth ?? meshes.defaultSmooth) ? 'linear' : 'nearest';
        gl.bindSampler(unit, meshes.wrapSamplers.get(wrapKey(filter, u, v))!);
    });
};

/**
 * Draws one model.
 *
 * Depth and the throwing away of back faces are switched on around the draw and off again after,
 * because everything else in this backend is drawn without them and a leftover setting would show
 * up somewhere else entirely.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const drawMesh = (
    gl: WebGL2RenderingContext,
    meshes: TMeshPipeline,
    mesh: TDrawMesh,
    space: TCameraSpace,
    lights: readonly TDrawLight[],
    width: number,
    height: number,
    time: number,
    shadowMap: WebGLTexture | null = null,
): boolean => {
    const vao = vertexArrayFor(gl, meshes, mesh);
    if (vao === null || mesh.geometry === null || mesh.geometry.indexCount === 0) {
        return false;
    }
    if (isAway(mesh.material.texture)) {
        return false;
    }

    // The depth range is already dealt with: this card's runs from -1 to 1 where the other's runs
    // from 0 to 1, and the fix is a multiplication from the left, so it was folded into the camera
    // once for the whole pass instead of being applied to every model's matrix in turn.
    fillMeshUniforms(meshes.uniformData, 0, mesh, space, lights);

    gl.bindBuffer(gl.UNIFORM_BUFFER, meshes.uniforms);
    gl.bufferSubData(gl.UNIFORM_BUFFER, 0, meshes.uniformData);
    gl.bindBuffer(gl.UNIFORM_BUFFER, null);

    // Bones and the corners that name them have to arrive together: a model with one and not the
    // other would read whichever corners happened to be bound and scatter.
    const bends = mesh.skeleton !== null && mesh.geometry.skinBuffer !== null;

    // A model that bends takes the effect's skinned twin: the same hooks, with the bones bending the
    // corner after the corner hook has moved it. Its bones are bound below, on the same unit either way.
    const surface = mesh.material;
    // Which side of its triangles is thrown away. The usual one is the pair built at the start.
    const cull = cullOf(mesh);
    const set = cull === 'back' ? meshes : meshes.sided(cull);
    let effect: ReturnType<TMeshPipeline['materials']['get']> | null = null;
    if (surface.fragment !== null || surface.vertex !== null) {
        meshes.materials.warnIfWgpuOnly(surface);
        // A shape with no detail run cannot feed a material's program, which reads one.
        if ((surface.fragmentGlsl !== null || surface.vertexGlsl !== null) && mesh.geometry.detailBuffer !== null) {
            const compiled = meshes.materials.get(surface, bends, cull);
            if (!compiled.failed && compiled.program !== null) {
                effect = compiled;
            }
        }
    }

    gl.useProgram(effect !== null ? effect.program! : bends ? set.skinnedProgram : set.program);
    gl.bindBufferBase(gl.UNIFORM_BUFFER, MESH_UNIFORMS_BINDING, meshes.uniforms);
    gl.bindBufferBase(gl.UNIFORM_BUFFER, MESH_LIGHTS_BINDING, meshes.lights);

    if (effect !== null) {
        meshes.materials.bind(effect, surface.uniforms ?? {}, null, time, width, height);
        bindMaterialMaps(gl, meshes, surface, effect.mapNames);
    }

    if (bends) {
        gl.activeTexture(gl.TEXTURE0 + MESH_JOINTS_UNIT);
        gl.bindTexture(gl.TEXTURE_2D, meshes.joints.upload(mesh.skeleton!));
        // Read by position, never sampled, so no sampler must be left over one of the 2D's.
        gl.bindSampler(MESH_JOINTS_UNIT, null);
    }

    // The map, or one step of depth when there is none. Always one of the two: a comparing sampler
    // with nothing bound is undefined on this card rather than blank.
    gl.activeTexture(gl.TEXTURE0 + MESH_SHADOW_UNIT);
    gl.bindTexture(gl.TEXTURE_2D, shadowMap ?? meshes.blankShadow);
    // Its own comparison lives on the texture, so no sampler object must be left over it.
    gl.bindSampler(MESH_SHADOW_UNIT, null);

    const ready = mesh.material.texture !== null && mesh.material.texture.status === 'ready' && mesh.material.texture.gpu !== null;
    const texture = ready ? toGlTexture(mesh.material.texture!.gpu!) : null;
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, texture ?? meshes.whiteTexture);
    // Read the way it asked: its filter, and what it does past its edge each way.
    const { u, v } = textureWrapOf(mesh.material);
    const sampler = meshes.wrapSamplers.get(wrapKey((mesh.material.smooth ?? meshes.defaultSmooth) ? 'linear' : 'nearest', u, v))!;
    gl.bindSampler(0, sampler);

    // The picture its glow comes through, read the same way. White when there is none or it has
    // not arrived; in that second case the glow was already written as black with the uniforms, so
    // the white never spreads it over the whole model.
    const glow = mesh.material.emissiveTexture;
    const glowReady = glow !== null && glow !== undefined && glow.status === 'ready' && glow.gpu !== null;
    gl.activeTexture(gl.TEXTURE0 + MESH_EMISSIVE_UNIT);
    gl.bindTexture(gl.TEXTURE_2D, glowReady ? toGlTexture(glow.gpu!) : meshes.whiteTexture);
    gl.bindSampler(MESH_EMISSIVE_UNIT, sampler);
    gl.activeTexture(gl.TEXTURE0);

    gl.enable(gl.DEPTH_TEST);
    gl.depthFunc(gl.LESS);
    // A see-through model is still hidden by what is in front of it, but writes nothing: it is drawn
    // after everything solid, and its distance would throw away whatever comes later behind it.
    gl.depthMask(!isTransparentMesh(mesh));
    // The side the material throws away, or neither.
    if (cull === 'none') {
        gl.disable(gl.CULL_FACE);
    } else {
        gl.enable(gl.CULL_FACE);
        gl.cullFace(cull === 'front' ? gl.FRONT : gl.BACK);
    }
    // Straight alpha, the same blend the WebGPU pipeline is built with and the same one sprites,
    // maps and particles switch on here.
    //
    // A model is the only thing in this backend that was drawing without it, which made every model
    // opaque on this card and blended on the other: `alpha` on a material did nothing, a shader
    // that returned anything but 1 was ignored, and a blob shadow's disc came out as a hard black
    // ellipse instead of a soft one. None of that looks like a missing state, which is why it
    // survived: it looks like the alpha being wrong.
    gl.enable(gl.BLEND);
    gl.blendFuncSeparate(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA, gl.ONE, gl.ONE_MINUS_SRC_ALPHA);

    gl.bindVertexArray(vao);
    // Wide triangle points are part of WebGL2 itself: it was WebGL1 that needed an extension asked
    // for, and this backend would not be running at all without the one that has them.
    const indexType = mesh.geometry.indexType === 'uint32' ? gl.UNSIGNED_INT : gl.UNSIGNED_SHORT;
    gl.drawElements(gl.TRIANGLES, mesh.geometry.indexCount, indexType, 0);
    gl.bindVertexArray(null);

    gl.disable(gl.CULL_FACE);
    gl.disable(gl.DEPTH_TEST);
    gl.disable(gl.BLEND);
    gl.depthMask(false);
    return true;
};
