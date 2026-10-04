import type { TUniformSignature, TUniformValues } from '../../../materials/types/t_uniforms';

/**
 * One of the engine's own effects, ready to be spread into `usePostProcess`.
 *
 * **Both halves are required here**, unlike a game's own effect. These are the engine's, and an
 * engine effect that ran on one card and not the other would be a hole in the promise that the two
 * backends draw the same thing, rather than the honest degradation a hand-written WGSL file gets.
 *
 * @typeParam U Its knobs by name and kind, which `usePostProcess` hands on to the effect it installs.
 *
 * @category Post-processing
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TBuiltinPostEffect<U extends TUniformValues = TUniformValues> = {
    name: string;
    fragment: string;
    fragmentGlsl: string;
    uniforms: U;
    uniformSig: TUniformSignature;
};

/**
 * What a tool needs to show one of them in a list and know what it wants.
 *
 * `binds` is which data texture the effect reads, and it is what tells an editor whether to offer a
 * palette picker, a table picker, or neither.
 *
 * @category Post-processing
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TPostBuiltinInfo = {
    /**
     * How a project file names it.
     *
     * **These strings are API.** They are written into `project.json`, so renaming one breaks
     * every project that used it.
     */
    key: string;
    label: string;
    description: string;
    binds: 'palette' | 'lut' | null;
    build: () => TBuiltinPostEffect;
};
