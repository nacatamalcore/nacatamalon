import { buildSpriteMaterialShaderGlsl } from './sprite_material_shader';
import { buildUniformLayout, writeUniformValues } from '../../shared/material_uniforms';
import { compileProgram } from '../utils/compile_program';
import { MATERIAL_UNIFORMS_BINDING } from './uniform_block';
import { FRAME_UNIFORMS_BINDING } from '../bindings';
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
    buildShader: (fragment: string, sig: TUniformSignature) => { vertex: string; fragment: string } = buildSpriteMaterialShaderGlsl,
) => {
    const compiled = new Map<string, TCompiled>();
    const values = new Float32Array(64);
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

    const build = (material: TDrawShader): TCompiled => {
        const layout = buildUniformLayout(material.uniformSig ?? {});
        const sources = buildShader(material.fragmentGlsl as string, material.uniformSig ?? {});

        try {
            const program = compileProgram(
                gl,
                sources.vertex,
                sources.fragment,
                `sprite material ${material.name ?? material.id}`,
            );
            gl.uniformBlockBinding(program, gl.getUniformBlockIndex(program, 'Uniforms'), FRAME_UNIFORMS_BINDING);
            gl.uniformBlockBinding(program, gl.getUniformBlockIndex(program, 'MaterialUniforms'), MATERIAL_UNIFORMS_BINDING);
            // Which unit the sheet is on is set on the program that is **active**, not on the one
            // named, so this has to be made current first. Left out, the card reports an invalid
            // operation and the sampler keeps the zero it happened to start with, which is the same
            // answer arrived at by luck.
            gl.useProgram(program);
            gl.uniform1i(gl.getUniformLocation(program, 'spriteTexture'), 0);
            gl.useProgram(null);
            return { program, layout, failed: false };
        } catch (error) {
            console.warn(
                `[NacatamalOn] the material "${material.name ?? 'sprite material'}" did not compile on WebGL2. ` +
                'It is drawing with the built-in shader instead.',
                error,
            );
            return { program: null, layout, failed: true };
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
                'Write the effect again after a // @glsl line to have it on both.',
            );
        },
        /**
         * The compiled effect for this material, compiling it the first time it is seen.
         *
         * A material with no GLSL half never reaches here: the caller checks that first, and the
         * renderer has already said once that the effect is WebGPU only.
         */
        get: (material: TDrawShader): TCompiled => {
            const key = `${JSON.stringify(material.uniformSig ?? {})} ${material.fragmentGlsl ?? ''}`;
            let entry = compiled.get(key);
            if (entry === undefined) {
                entry = build(material);
                compiled.set(key, entry);
            }
            return entry;
        },
        /**
         * Writes this batch's numbers and binds them: the material's, with the one sprite's own laid
         * over them when it brought any.
         */
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
 * Everything this card keeps for its sprite effects.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TSpriteMaterials = ReturnType<typeof createSpriteMaterials>;
