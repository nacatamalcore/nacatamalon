import { buildSpriteMaterialShaderGlsl } from './sprite_material_shader';
import { buildUniformLayout, MAX_MATERIAL_FLOATS, writeUniformValues } from '../../shared/material_uniforms';
import { compileProgram } from '../utils/compile_program';
import { withoutLights2d } from '../../shared/lighting_2d_shader';
import { MATERIAL_UNIFORMS_BINDING } from './uniform_block';
import { FRAME_UNIFORMS_BINDING } from '../bindings';
import { mapNamesOf, MAX_MATERIAL_MAPS } from '../../shared/material_maps';
import { createFlatMapBinder, placeFlatMaps } from './flat_maps';
import type { TDrawShader } from '../../interface/draw/t_draw_material';
import type { TUniformLayout } from '../../shared/material_uniforms';
import type { TUniformSignature, TUniformValues } from '../../../materials';

/**
 * One compiled effect, or the record that it would not compile.
 */
type TCompiled = {
    program: WebGLProgram | null;
    layout: TUniformLayout;
    /**
     * Once true, this material is drawn with the built-in shader and nothing is tried again.
     */
    failed: boolean;
    /**
     * The maps the shader reads, in the order of the units they are bound on.
     */
    mapNames: string[];
};

/**
 * Every sprite effect this game has compiled on this card, and the numbers they are drawn with.
 *
 * Kept by source rather than by the material carrying it, exactly as its twin does, so two materials
 * running the same effect are one program.
 *
 * Unlike the other card, a failure here is **immediate**: this one only tells when asked, and it is
 * asked at build time. So the fallback is decided before anything is drawn rather than a frame or
 * two later, and the rest of the drawing cannot tell the difference.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const createSpriteMaterials = (
    gl: WebGL2RenderingContext,
    buildShader: (fragment: string, sig: TUniformSignature, mapNames: readonly string[]) => { vertex: string; fragment: string } = buildSpriteMaterialShaderGlsl,
) => {
    const maps = createFlatMapBinder(gl);
    const compiled = new Map<string, TCompiled>();
    const values = new Float32Array(MAX_MATERIAL_FLOATS);
    /**
     * Which sources have already been reported as WebGPU only.
     *
     * Kept by source and not by material, so two materials sharing an effect are one report, and
     * reported once ever rather than once a frame: a warning that repeats sixty times a second is a
     * warning nobody reads.
     */
    const warned = new Set<string>();

    /**
     * One block of numbers, rewritten before each batch that needs it.
     *
     * One and not one per material, because this card binds a buffer by name at draw time rather
     * than pointing into a shared one: there is nothing to be gained by keeping several, and a
     * buffer per material would be a buffer leaked per material.
     */
    let parameters: WebGLBuffer | null = null;

    // `said` is shared by the two compiles of one effect, lit by the 2D lights and not, so what is
    // wrong with it is said once and not twice: they differ in a line the effect never touches.
    const build = (material: TDrawShader, lit: boolean, said: { done: boolean }): TCompiled => {
        const layout = buildUniformLayout(material.uniformSig ?? {});
        const mapNames = mapNamesOf(material.fragmentGlsl);
        // Too many numbers for its slot. Said once where it was made (`checkParameterRoom`).
        if (layout.floatCount > MAX_MATERIAL_FLOATS) {
            return { program: null, layout, failed: true, mapNames };
        }
        if (mapNames.length > MAX_MATERIAL_MAPS) {
            if (said.done) {
                return { program: null, layout, failed: true, mapNames };
            }
            said.done = true;
            console.warn(
                `[NacatamalOn] the material "${material.name ?? 'sprite material'}" reads ${mapNames.length} maps ` +
                `(${mapNames.join(', ')}) and a material has ${MAX_MATERIAL_MAPS}. It is drawing with the built-in shader instead.`,
            );
            return { program: null, layout, failed: true, mapNames };
        }
        const sources = buildShader(material.fragmentGlsl as string, material.uniformSig ?? {}, mapNames);

        try {
            const program = compileProgram(
                gl,
                sources.vertex,
                lit ? sources.fragment : withoutLights2d(sources.fragment),
                `sprite material ${material.name ?? material.id}${lit ? '' : ' unlit'}`,
            );
            gl.uniformBlockBinding(program, gl.getUniformBlockIndex(program, 'Uniforms'), FRAME_UNIFORMS_BINDING);
            gl.uniformBlockBinding(program, gl.getUniformBlockIndex(program, 'MaterialUniforms'), MATERIAL_UNIFORMS_BINDING);
            // Which unit the sheet is on is set on the program that is **active**, not on the one
            // named, so this has to be made current first. Left out, the card reports an invalid
            // operation and the sampler keeps the zero it happened to start with, which is the same
            // answer arrived at by luck.
            gl.useProgram(program);
            gl.uniform1i(gl.getUniformLocation(program, 'spriteTexture'), 0);
            placeFlatMaps(gl, program);
            gl.useProgram(null);
            return { program, layout, failed: false, mapNames };
        } catch (error) {
            if (said.done) {
                return { program: null, layout, failed: true, mapNames };
            }
            said.done = true;
            console.warn(
                `[NacatamalOn] the material "${material.name ?? 'sprite material'}" did not compile on WebGL2. ` +
                'It is drawing with the built-in shader instead.',
                error,
            );
            return { program: null, layout, failed: true, mapNames };
        }
    };

    return {
        /**
         * Says once that an effect was written for the other card only.
         *
         * Not an error and not a failure: the sprites keep their sheet, their colour and their
         * place, and lose the effect. Somebody still has to be told, because an effect that silently
         * does nothing on half the machines it runs on is worse than one that does not compile.
         */
        warnIfWgpuOnly: (material: TDrawShader): void => {
            const source = material.fragment;
            if (source === null || material.fragmentGlsl !== null || warned.has(source)) {
                return;
            }
            warned.add(source);
            console.warn(
                `[NacatamalOn] the material "${material.name ?? 'sprite material'}" is written in WGSL only, ` +
                'which this card cannot compile. It is drawing with the built-in shader instead. ' +
                'Built with compileShader it is written in both at once; by hand, give it fragmentGlsl too ' +
                '(in a shader file, the same again after a // @glsl line).',
            );
        },
        /**
         * The compiled effect for this material, compiling it the first time it is seen.
         *
         * A material with no GLSL half never reaches here: the caller checks that first, and the
         * renderer has already said once that the effect is WebGPU only.
         */
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
         * Writes this batch's numbers and binds them, the material's with the one sprite's own laid
         * over them when it brought any, and binds the material's maps.
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
 * Everything this card keeps for its sprite effects.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TSpriteMaterials = ReturnType<typeof createSpriteMaterials>;
