import type { TUniformValues } from '../../materials/types/t_uniforms';

/**
 * One effect as a project writes it down.
 *
 * An entry names its effect **one of two ways**, and that split is the whole design:
 *
 * - `builtin` is a key the engine already knows. There is no file to fetch and no path that can
 *   point at nothing, so a project that only reduces its colours needs no `shaders/` folder at all.
 * - `effect` is a path to a `.shader` (or `.wgsl`) file, the code of an effect of the game's own: the
 *   same word a material and `usePostProcess` use for it. A project written before says `shader`,
 *   and is read the same.
 *
 * **The arithmetic the engine knows is a key; the look you invented is a file.**
 *
 * @category Post-processing
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TPostChainEntry = {
    /**
     * Where the effect is written. Empty when `builtin` names one instead.
     */
    effect: string;
    /**
     * A key from `POST_BUILTINS`, the engine's own effects. Wins over `effect` if somebody wrote both.
     */
    builtin?: string;
    /**
     * Values laid **over** whatever the file or the built-in starts its knobs at.
     */
    uniforms?: TUniformValues;
    /**
     * A built-in's settings that are written into it when it is made, rather than knobs (its fields
     * marked `rebuild`, such as `ascii`'s `glyphs`). Left out when there are none.
     */
    options?: Record<string, string | number | boolean>;
    /**
     * A `.palette` file whose colours this effect matches against.
     */
    palette?: string;
    /**
     * A grading table: a `.cube`, or a strip image. Never both this and `palette`.
     */
    lut?: string;
    /**
     * `false` keeps the entry in the chain, in its place, without running it. Default `true`.
     */
    enabled?: boolean;
    /**
     * What the editor calls it in its list. Defaults to the file's own name.
     */
    name?: string;
};

/**
 * The whole chain, in order.
 *
 * An array rather than a bag of named things, for the reason the input map shares: **order is the
 * meaning here.** Each effect reads what the one before it produced, so grading before limiting and
 * limiting before grading are two different pictures, not two spellings of one.
 *
 * @category Post-processing
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TPostChain = TPostChainEntry[];
