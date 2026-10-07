import type { TPostEffect } from '../../post/types/t_post_effect';

/**
 * One draw of the chain: a pass of an effect, or the effect's own hook.
 *
 * `scale` is `null` for the hook, which always writes a picture the size of the canvas (or the
 * screen itself). A pass writes one at `scale` times the game's size.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TPostStep = {
    fragment: string | null;
    fragmentGlsl: string | null;
    scale: number | null;
};

/**
 * The draws one effect takes, in order. Nearly always just its hook.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const postStepsOf = (effect: TPostEffect): TPostStep[] => {
    const own: TPostStep = { fragment: effect.fragment, fragmentGlsl: effect.fragmentGlsl, scale: null };
    if (effect.passes === undefined || effect.passes.length === 0) {
        return [own];
    }
    const steps: TPostStep[] = effect.passes.map((pass) => ({
        fragment: pass.fragment,
        fragmentGlsl: pass.fragmentGlsl,
        // Never zero and never larger than the game: a pass bigger than the game would only be a
        // slower way of drawing the same thing.
        scale: Math.min(1, Math.max(0.0625, pass.scale ?? 1)),
    }));
    steps.push(own);
    return steps;
};

/**
 * How many draws a chain makes, counting the copy an effect with a history needs when it is the one
 * that writes the screen. The backend makes room for its parameters from this before recording.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const countPostSteps = (chain: readonly TPostEffect[]): number => {
    let count = 0;
    for (const effect of chain) {
        count += 1 + (effect.passes?.length ?? 0) + (effect.history === true ? 1 : 0);
    }
    return count;
};

/**
 * The size of a pass's picture, in real pixels, for a game of `gameWidth` × `gameHeight`.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const passSize = (scale: number, gameWidth: number, gameHeight: number): [number, number] => [
    Math.max(1, Math.round(gameWidth * scale)),
    Math.max(1, Math.round(gameHeight * scale)),
];
