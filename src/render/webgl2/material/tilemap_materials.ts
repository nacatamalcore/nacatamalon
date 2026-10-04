import { buildTilemapMaterialShaderGlsl } from './tilemap_material_shader';
import { buildUniformLayout, writeUniformValues } from '../../shared/material_uniforms';
import { compileProgram } from '../utils/compile_program';
import { MATERIAL_UNIFORMS_BINDING } from './uniform_block';
import { FRAME_UNIFORMS_BINDING } from '../bindings';
import type { TDrawShader } from '../../interface/draw/t_draw_material';
import type { TUniformLayout } from '../../shared/material_uniforms';
import type { TUniformValues } from '../../../materials';

/**
 * Where each of a layer's own numbers lives in one compiled program.
 */
export type TLayerLocations = {
    position: WebGLUniformLocation | null;
    scale: WebGLUniformLocation | null;
    rotation: WebGLUniformLocation | null;
    view: WebGLUniformLocation | null;
    tint: WebGLUniformLocation | null;
};

type TCompiled = {
    program: WebGLProgram | null;
    /**
     * Where this program keeps a layer's own numbers.
     *
     * Its own set, and that is the whole reason a map's material needs more machinery here than a
     * sprite's: this card keeps a layer's numbers as loose uniforms rather than a block, and a
     * uniform belongs to the one program it was compiled into. Writing the built-in program's
     * locations into a material's program is not an error anywhere, it is a map drawn at the origin.
     */
    locations: TLayerLocations;
    layout: TUniformLayout;
    failed: boolean;
};

/**
 * Every map-layer effect this game has compiled on this card.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const createTilemapMaterials = (gl: WebGL2RenderingContext) => {
    const compiled = new Map<string, TCompiled>();
    const values = new Float32Array(64);
    const warned = new Set<string>();

    let parameters: WebGLBuffer | null = null;

    const build = (material: TDrawShader): TCompiled => {
        const layout = buildUniformLayout(material.uniformSig ?? {});
        const empty: TLayerLocations = { position: null, scale: null, rotation: null, view: null, tint: null };
        const sources = buildTilemapMaterialShaderGlsl(material.fragmentGlsl as string, material.uniformSig ?? {});

        try {
            const program = compileProgram(
                gl,
                sources.vertex,
                sources.fragment,
                `tilemap material ${material.name ?? material.id}`,
            );
            gl.uniformBlockBinding(program, gl.getUniformBlockIndex(program, 'Uniforms'), FRAME_UNIFORMS_BINDING);
            gl.uniformBlockBinding(program, gl.getUniformBlockIndex(program, 'MaterialUniforms'), MATERIAL_UNIFORMS_BINDING);
            gl.useProgram(program);
            gl.uniform1i(gl.getUniformLocation(program, 'tilesTexture'), 0);
            gl.useProgram(null);

            return {
                program,
                locations: {
                    position: gl.getUniformLocation(program, 'layerPosition'),
                    scale: gl.getUniformLocation(program, 'layerScale'),
                    rotation: gl.getUniformLocation(program, 'layerRotation'),
                    view: gl.getUniformLocation(program, 'layerView'),
                    tint: gl.getUniformLocation(program, 'layerTint'),
                },
                layout,
                failed: false,
            };
        } catch (error) {
            console.warn(
                `[NacatamalOn] the material "${material.name ?? 'tilemap material'}" did not compile on WebGL2. ` +
                'It is drawing with the built-in shader instead.',
                error,
            );
            return { program: null, locations: empty, layout, failed: true };
        }
    };

    return {
        /**
         * Says once that an effect was written for the other card only.
         */
        warnIfWgpuOnly: (material: TDrawShader): void => {
            const source = material.fragment;
            if (source === null || material.fragmentGlsl !== null || warned.has(source)) {
                return;
            }
            warned.add(source);
            console.warn(
                `[NacatamalOn] the material "${material.name ?? 'tilemap material'}" is written in WGSL only, ` +
                'which this card cannot compile. It is drawing with the built-in shader instead. ' +
                'Write the effect again after a // @glsl line to have it on both.',
            );
        },
        get: (material: TDrawShader): TCompiled => {
            const key = `${JSON.stringify(material.uniformSig ?? {})} ${material.fragmentGlsl ?? ''}`;
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
 * Everything this card keeps for its map-layer effects.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TTilemapMaterials = ReturnType<typeof createTilemapMaterials>;
