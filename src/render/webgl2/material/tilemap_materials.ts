import { buildTilemapMaterialShaderGlsl } from './tilemap_material_shader';
import { buildUniformLayout, MAX_MATERIAL_FLOATS, writeUniformValues } from '../../shared/material_uniforms';
import { compileProgram } from '../utils/compile_program';
import { withoutLights2d } from '../../shared/lighting_2d_shader';
import { MATERIAL_UNIFORMS_BINDING } from './uniform_block';
import { FRAME_UNIFORMS_BINDING } from '../bindings';
import { mapNamesOf, MAX_MATERIAL_MAPS } from '../../shared/material_maps';
import { createFlatMapBinder, placeFlatMaps } from './flat_maps';
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
    /**
     * Only a material's program has one: what its `layerUv()` runs across.
     */
    size?: WebGLUniformLocation | null;
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
    /**
     * The maps the shader reads, in the order of the units they are bound on.
     */
    mapNames: string[];
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
    const values = new Float32Array(MAX_MATERIAL_FLOATS);
    const warned = new Set<string>();
    const maps = createFlatMapBinder(gl);

    let parameters: WebGLBuffer | null = null;

    // `said` is shared by the two compiles of one effect, lit by the 2D lights and not, so what is
    // wrong with it is said once and not twice: they differ in a line the effect never touches.
    const build = (material: TDrawShader, lit: boolean, said: { done: boolean }): TCompiled => {
        const layout = buildUniformLayout(material.uniformSig ?? {});
        const empty: TLayerLocations = { position: null, scale: null, rotation: null, view: null, tint: null };
        const mapNames = mapNamesOf(material.fragmentGlsl);
        // Too many numbers for its slot. Said once where it was made (`checkParameterRoom`).
        if (layout.floatCount > MAX_MATERIAL_FLOATS) {
            return { program: null, locations: empty, layout, failed: true, mapNames };
        }
        if (mapNames.length > MAX_MATERIAL_MAPS) {
            if (said.done) {
                return { program: null, locations: empty, layout, failed: true, mapNames };
            }
            said.done = true;
            console.warn(
                `[NacatamalOn] the material "${material.name ?? 'tilemap material'}" reads ${mapNames.length} maps ` +
                `(${mapNames.join(', ')}) and a material has ${MAX_MATERIAL_MAPS}. It is drawing with the built-in shader instead.`,
            );
            return { program: null, locations: empty, layout, failed: true, mapNames };
        }
        const sources = buildTilemapMaterialShaderGlsl(material.fragmentGlsl as string, material.uniformSig ?? {}, mapNames);

        try {
            const program = compileProgram(
                gl,
                sources.vertex,
                lit ? sources.fragment : withoutLights2d(sources.fragment),
                `tilemap material ${material.name ?? material.id}${lit ? '' : ' unlit'}`,
            );
            gl.uniformBlockBinding(program, gl.getUniformBlockIndex(program, 'Uniforms'), FRAME_UNIFORMS_BINDING);
            gl.uniformBlockBinding(program, gl.getUniformBlockIndex(program, 'MaterialUniforms'), MATERIAL_UNIFORMS_BINDING);
            gl.useProgram(program);
            gl.uniform1i(gl.getUniformLocation(program, 'tilesTexture'), 0);
            placeFlatMaps(gl, program);
            gl.useProgram(null);

            return {
                program,
                locations: {
                    position: gl.getUniformLocation(program, 'layerPosition'),
                    scale: gl.getUniformLocation(program, 'layerScale'),
                    rotation: gl.getUniformLocation(program, 'layerRotation'),
                    view: gl.getUniformLocation(program, 'layerView'),
                    tint: gl.getUniformLocation(program, 'layerTint'),
                    size: gl.getUniformLocation(program, 'layerSize'),
                },
                layout,
                failed: false,
                mapNames,
            };
        } catch (error) {
            if (said.done) {
                return { program: null, locations: empty, layout, failed: true, mapNames };
            }
            said.done = true;
            console.warn(
                `[NacatamalOn] the material "${material.name ?? 'tilemap material'}" did not compile on WebGL2. ` +
                'It is drawing with the built-in shader instead.',
                error,
            );
            return { program: null, locations: empty, layout, failed: true, mapNames };
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
                'Built with compileShader it is written in both at once; by hand, give it fragmentGlsl too ' +
                '(in a shader file, the same again after a // @glsl line).',
            );
        },
        get: (material: TDrawShader, lit = true): TCompiled => {
            const key = `${JSON.stringify(material.uniformSig ?? {})} ${material.fragmentGlsl ?? ''}`;
            let entry = compiled.get((lit ? 'lit ' : 'unlit ') + key);
            if (entry === undefined) {
                // Both at once, lit by the 2D lights and not, so a scene that lights up later does
                // not stop to compile in the middle of a frame.
                const said = { done: false };
                const litEntry = build(material, true, said);
                const unlitEntry = build(material, false, said);
                compiled.set('lit ' + key, litEntry);
                compiled.set('unlit ' + key, unlitEntry);
                entry = lit ? litEntry : unlitEntry;
            }
            return entry;
        },
        /**
         * Writes this layer's numbers for its material and binds them, and binds the material's maps.
         */
        bind: (
            entry: TCompiled,
            material: TDrawShader,
            overrides: TUniformValues | null,
            time: number,
            width: number,
            height: number,
            smooth: boolean,
        ): void => {
            const uniforms = material.uniforms ?? {};
            maps.bind(material, entry.mapNames, smooth);
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
            maps.destroy();
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
