import type { TUniformSignature, TUniformValues } from '../../../materials/types/t_uniforms';
import type { TPostPass } from '../../types/t_post_effect';

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
    /**
     * Its steps before `fragment`, each in both languages, for the same reason the hook is.
     */
    passes?: readonly (TPostPass & { fragmentGlsl: string })[];
    /**
     * Whether it reads what it showed last frame.
     */
    history?: boolean;
};

/**
 * One setting of an effect or a look, declared so a form can be made of it: what it is called, what
 * kind of value it takes and between what, and what it starts at.
 *
 * @category Post-processing
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TEffectField = {
    /**
     * Its name: the knob's (a key of the effect's `uniforms`), or, for one marked `rebuild`, the option
     * the effect is made with.
     */
    key: string;
    /**
     * What a form calls it. The key, in words, when left out.
     */
    label?: string;
    /**
     * A line about what it does, for a form to show on hover.
     */
    description?: string;
    /**
     * How the value is written: `'color'` is `[r, g, b]` from `0` to `1`, `'vec2'` is `[x, y]`. A
     * `'select'` saves the `value` of what was chosen.
     */
    type: 'number' | 'boolean' | 'string' | 'select' | 'color' | 'vec2';
    /**
     * What it is when nobody has set it: exactly what the effect starts at.
     */
    default: number | string | boolean | number[];
    min?: number;
    max?: number;
    step?: number;
    /**
     * `'select'` only: what may be chosen.
     */
    options?: readonly { label: string; value: string | number }[];
    /**
     * `'string'` only: values worth offering, which may still be typed over.
     */
    suggestions?: readonly string[];
    /**
     * Written into the effect when it is made, not a knob: changing it makes the effect again, so it
     * cannot be tweened. A project file keeps it in the entry's `options`, not its `uniforms`.
     */
    rebuild?: true;
};

/**
 * What a tool needs to show one of them in a list and know what it wants.
 *
 * `binds` is which data texture the effect reads, and it is what tells an editor whether to offer a
 * palette picker, a table picker, or neither. `fields` is everything that can be set on it, for a
 * form to be made from, the way a script's `fields` are.
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
    fields: readonly TEffectField[];
    /**
     * Old knob name → the name it has now, so a project written before a rename keeps its value.
     */
    renamed?: Readonly<Record<string, string>>;
    /**
     * Makes it, with the options its `rebuild` fields name (a project entry's `options`).
     */
    build: (options?: Readonly<Record<string, unknown>>) => TBuiltinPostEffect;
};
