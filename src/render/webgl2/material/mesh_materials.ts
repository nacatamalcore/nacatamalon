import { buildMeshMaterialShaderGlsl } from './mesh_material_shader';
import { buildUniformLayout, writeUniformValues } from '../../shared/material_uniforms';
import { compileProgram } from '../utils/compile_program';
import { MATERIAL_UNIFORMS_BINDING } from './uniform_block';
import { MESH_LIGHTS_BINDING, MESH_MAP_UNITS, MESH_SHADOW_UNIT, MESH_TEXTURE_UNIT, MESH_UNIFORMS_BINDING } from '../bindings';
import { mapNamesOf, MAX_MATERIAL_MAPS } from '../../shared/material_maps';
import type { TDrawShader } from '../../interface/draw/t_draw_material';
import type { TUniformLayout } from '../../shared/material_uniforms';
import type { TUniformValues } from '../../../materials';

type TCompiled = {
    program: WebGLProgram | null;
    layout: TUniformLayout;
    failed: boolean;
    /**
     * The maps the shader reads, in the order of their units.
     */
    mapNames: string[];
};

/**
 * Every model effect this game has compiled on this card, and the numbers they are drawn with.
 *
 * The same shape as the sprites', and the same two asymmetries with the other card: kept by source
 * so two materials sharing an effect are one program, and failing **immediately** rather than a
 * frame later, because this card only tells when asked and it is asked at build time.
 *
 * **The shadow sampler is declared, and it is given a unit of its own right here.** A material
 * receives shadow like any other model, which is this engine's one model: a surface does not
 * quietly stop taking shadows the moment you give it an effect.
 *
 * The unit is the part worth watching. On this card an unbound comparing sampler is not an ignored
 * binding but an invalid one, and a comparing sampler sharing a unit with an ordinary one is
 * refused outright: the card throws the **whole draw** away. The model does not come out dark or
 * striped, it does not come out at all, which is how a blob shadow's disc went missing here while
 * everything around it drew perfectly, the disc being the only thing in that scene wearing an
 * effect of its own.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const createMeshMaterials = (gl: WebGL2RenderingContext) => {
    const compiled = new Map<string, TCompiled>();
    const values = new Float32Array(64);
    const warned = new Set<string>();

    let parameters: WebGLBuffer | null = null;

    const build = (material: TDrawShader): TCompiled => {
        const layout = buildUniformLayout(material.uniformSig ?? {});
        const mapNames = mapNamesOf(material.fragmentGlsl);
        if (mapNames.length > MAX_MATERIAL_MAPS) {
            console.warn(
                `[NacatamalOn] the material "${material.name ?? 'mesh material'}" reads ${mapNames.length} maps ` +
                `(${mapNames.join(', ')}) and a material has ${MAX_MATERIAL_MAPS}. It is drawing with the built-in shader instead.`,
            );
            return { program: null, layout, failed: true, mapNames };
        }
        const sources = buildMeshMaterialShaderGlsl(
            material.fragmentGlsl,
            material.vertexGlsl,
            material.uniformSig ?? {},
            mapNames,
        );

        try {
            const program = compileProgram(
                gl,
                sources.vertex,
                sources.fragment,
                `mesh material ${material.name ?? material.id}`,
            );
            gl.uniformBlockBinding(program, gl.getUniformBlockIndex(program, 'Uniforms'), MESH_UNIFORMS_BINDING);
            gl.uniformBlockBinding(program, gl.getUniformBlockIndex(program, 'Lights'), MESH_LIGHTS_BINDING);
            gl.uniformBlockBinding(program, gl.getUniformBlockIndex(program, 'MaterialUniforms'), MATERIAL_UNIFORMS_BINDING);
            // Which unit the picture is on is set on the program that is active, not on the one
            // named, so this has to be made current first.
            gl.useProgram(program);
            gl.uniform1i(gl.getUniformLocation(program, 'meshTexture'), MESH_TEXTURE_UNIT);
            // And the shadow map, which every model shader declares whether it reads it or not.
            // Left out, it stays on unit 0 with the picture, and a comparing sampler beside an
            // ordinary one on the same unit is the one mix this card refuses outright: it throws
            // the whole draw away, so the model does not come out dark or wrong, it does not come
            // out at all. That is how a blob shadow's disc vanished here while the scene beside it
            // was fine, because the disc is the only thing in it wearing a material of its own.
            gl.uniform1i(gl.getUniformLocation(program, 'shadowMap'), MESH_SHADOW_UNIT);
            // The extra maps, each on a unit of its own, for the same reason: every one is declared
            // whether the shader reads it or not, and any left at 0 would sit beside the picture.
            MESH_MAP_UNITS.forEach((unit, i) => {
                gl.uniform1i(gl.getUniformLocation(program, `meshMap${i}`), unit);
            });
            gl.useProgram(null);
            return { program, layout, failed: false, mapNames };
        } catch (error) {
            console.warn(
                `[NacatamalOn] the material "${material.name ?? 'mesh material'}" did not compile on WebGL2. ` +
                'It is drawing with the built-in shader instead.',
                error,
            );
            return { program: null, layout, failed: true, mapNames };
        }
    };

    return {
        /**
         * Says once that a shader reads a map its material does not carry, which then reads white.
         */
        warnIfMapMissing: (material: TDrawShader, name: string): void => {
            const said = `${material.name ?? material.id} ${name}`;
            if (warned.has(said)) {
                return;
            }
            warned.add(said);
            console.warn(`[NacatamalOn] the material "${material.name ?? 'mesh material'}" reads the map '${name}' and has none by that name, so it reads as white. Add it to the material's maps.`);
        },
        /**
         * Says once that an effect was written for the other card only.
         */
        warnIfWgpuOnly: (material: TDrawShader): void => {
            const source = material.fragment ?? material.vertex;
            const portable = material.fragmentGlsl ?? material.vertexGlsl;
            if (source === null || portable !== null || warned.has(source)) {
                return;
            }
            warned.add(source);
            console.warn(
                `[NacatamalOn] the material "${material.name ?? 'mesh material'}" is written in WGSL only, ` +
                'which this card cannot compile. It is drawing with the built-in shader instead. ' +
                'Write the effect again after a // @glsl line to have it on both.',
            );
        },
        get: (material: TDrawShader): TCompiled => {
            const key = `${JSON.stringify(material.uniformSig ?? {})} ${material.fragmentGlsl ?? ''} ${material.vertexGlsl ?? ''}`;
            let entry = compiled.get(key);
            if (entry === undefined) {
                entry = build(material);
                compiled.set(key, entry);
            }
            return entry;
        },
        bind: (
            entry: TCompiled,
            uniforms: TUniformValues,
            overrides: TUniformValues | null,
            time: number,
            width: number,
            height: number,
        ): void => {
            if (parameters === null) {
                parameters = gl.createBuffer();
                gl.bindBuffer(gl.UNIFORM_BUFFER, parameters);
                gl.bufferData(gl.UNIFORM_BUFFER, values.byteLength, gl.DYNAMIC_DRAW);
            }

            values.fill(0, 0, entry.layout.floatCount);
            writeUniformValues(values, entry.layout, uniforms, time, width, height, overrides);

            gl.bindBuffer(gl.UNIFORM_BUFFER, parameters);
            gl.bufferSubData(gl.UNIFORM_BUFFER, 0, values, 0, entry.layout.floatCount);
            gl.bindBuffer(gl.UNIFORM_BUFFER, null);
            gl.bindBufferBase(gl.UNIFORM_BUFFER, MATERIAL_UNIFORMS_BINDING, parameters);
        },
        destroy: (): void => {
            for (const entry of compiled.values()) {
                if (entry.program !== null) {
                    gl.deleteProgram(entry.program);
                }
            }
            compiled.clear();
            if (parameters !== null) {
                gl.deleteBuffer(parameters);
                parameters = null;
            }
        },
    };
};

/**
 * Everything this card keeps for its model effects.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TMeshMaterials = ReturnType<typeof createMeshMaterials>;
