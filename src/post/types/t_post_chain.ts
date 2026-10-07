import type { TUniformValues } from '../../materials/types/t_uniforms';

/**
 * One effect as a project writes it down.
 *
 * An entry names its effect **one of two ways**, and that split is the whole design:
 *
 * - `builtin` is a key the engine already knows. There is no file to fetch and no path that can
 *   point at nothing, so a project that only reduces its colours needs no `shaders/` folder at all.
 * - `shader` is a path to a `.wgsl`, exactly as a material names one.
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
    shader: string;
    /**
     * A key from `POST_BUILTINS`, the engine's own effects. Wins over `shader` if somebody wrote both.
     */
    builtin?: string;
    /**
     * Values laid **over** whatever the file or the built-in starts its knobs at.
     */
    uniforms?: TUniformValues;
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
