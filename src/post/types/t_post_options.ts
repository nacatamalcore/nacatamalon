import type { TLut } from '../../loaders/lut/types/t_lut';
import type { TPalette } from '../../loaders/palette/types/t_palette';
import type { TShader } from '../../loaders/shader/types/t_shader';
import type { TUniformSignature, TUniformValues } from '../../materials/types/t_uniforms';

/**
 * What `usePostProcess` is asked for.
 *
 * There are three ways to say what the effect is, and they are the same three a material has: write
 * it here, name a file, or spread one of the engine's own.
 *
 * @example
 * ```ts
 * declare const CRT_WGSL: string;
 * declare const CRT_GLSL: string;
 *
 * usePostProcess({ fragment: CRT_WGSL, fragmentGlsl: CRT_GLSL, uniforms: { curve: 0.3 } });
 * usePostProcess({ effect: useLoadShader({ src: '/shaders/crt.wgsl' }) });
 * usePostProcess({ ...dither({ levels: COLOR_LEVELS.genesis }) });
 * ```
 *
 * @typeParam U The knobs by name, worked out from `uniforms`: the effect `usePostProcess` returns
 *     keeps them, so `effect.uniforms.curve` is read back as a number.
 *
 * @category Post-processing
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TPostProcessOptions<U extends TUniformValues = TUniformValues> = {
    /**
     * A name, which is what a warning about this effect will call it, and what an editor lists.
     */
    name?: string;
    /**
     * The hook, in WGSL: `fn effect(color: vec4<f32>, uv: vec2<f32>) -> vec4<f32>`.
     */
    fragment?: string;
    /**
     * The same hook in GLSL, without which the effect is WebGPU only.
     */
    fragmentGlsl?: string;
    /**
     * A file from `useLoadShader`, or the name one was loaded under. Wins over `fragment`.
     */
    effect?: TShader | string;
    /**
     * The knobs, and what they start at. Laid **over** whatever a file or a built-in says.
     */
    uniforms?: U;
    /**
     * What kind each knob is, when it is already known.
     *
     * Left out, it is worked out from the values, which is what a hand-written effect wants. The
     * engine's own four pass it because they already know, and because spreading one of them in is
     * meant to be a whole effect rather than a starting point.
     */
    uniformSig?: TUniformSignature;
    /**
     * The colours to match against, from `useLoadPalette`.
     */
    palette?: TPalette | null;
    /**
     * The grading table, from `useLoadLut`. Never set alongside `palette`.
     */
    lut?: TLut | null;
    /**
     * Whether it runs at all. Default `true`.
     */
    enabled?: boolean;
};
