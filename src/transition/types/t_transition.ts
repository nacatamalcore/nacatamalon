import type { TUniformSignature, TUniformValues } from '../../materials/types/t_uniforms';

/**
 * A way of getting from one scene to another: a full-screen effect plus how long it lasts.
 *
 * **The same shape a post effect has, plus a duration**, and that is deliberate. Writing your own
 * transition should cost exactly what writing your own effect costs, because it is the same hook
 * over the same finished picture. What the engine adds is not the shader, it is the lifecycle: the
 * scene coming in exists without being seen or updated, and the swap waits for the screen to be
 * covered **and** for its assets to land.
 *
 * The hook is handed `progress`, which runs 0 to 1 twice, and `phase`, which says which of the two
 * runs it is in: 0 while the screen is being covered, 1 while it is being uncovered. Both halves
 * count **up**, never down, because an uncover that counted back down would play a wipe in mirror
 * image.
 *
 * @example
 * ```ts
 * const scene = useScene();
 * scene.change('Level2', { transition: fade(0.3) });
 * scene.change('Level2', { transition: wipe(0.4, 'right') });
 * ```
 *
 * @category Scenes
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TTransition = {
    /**
     * What a warning about it will call it, and what an editor lists. Never an identity.
     */
    name?: string;
    /**
     * How long the whole thing takes, in seconds, **covering and uncovering together**.
     *
     * So `fade(0.3)` covers for 0.15 and uncovers for 0.15, and a stopwatch agrees with the number
     * that was written. Each half still runs `progress` from 0 to 1 over its own 0.15.
     *
     * Zero is allowed and means the screen is covered for exactly as long as the incoming scene
     * takes to load, which is a loading screen with no animation and a perfectly good thing to ask
     * for.
     */
    duration: number;
    /**
     * `fn effect(color: vec4<f32>, uv: vec2<f32>) -> vec4<f32>`, and anything it calls.
     */
    fragment: string;
    /**
     * The same hook in GLSL.
     *
     * Without it there is no transition on WebGL2 **and no lifecycle either**: the change is made as
     * the hard cut it was before, with a warning. A cover nobody can draw is worse than no cover,
     * because the scene coming in would sit held back and invisible for the whole duration and then
     * appear all at once.
     */
    fragmentGlsl?: string;
    /**
     * The knobs, and what they start at.
     */
    uniforms?: TUniformValues;
    /**
     * What kind each one is. Worked out from the values when left out.
     */
    uniformSig?: TUniformSignature;
};

/**
 * What `useScene().launch` accepts beyond the scene.
 *
 * @category Scenes
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TSceneLaunchOptions<P extends object = Record<string, unknown>> = {
    /**
     * What the scene's function is called with. Left out, it gets `{}` and its defaults.
     */
    props?: P;
    /**
     * Covers the screen while the scene starts, and uncovers it with the scene on top: a menu that
     * opens with an iris. The scenes already running go on underneath, as they do with `change`:
     * pause them first if the game should freeze. Without one, the scene is simply there.
     */
    transition?: TTransition;
};

/**
 * What `useScene().change` accepts beyond the scene: its props, and a transition. Without a
 * transition it is the hard cut.
 *
 * @category Scenes
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TSceneChangeOptions<P extends object = Record<string, unknown>> = TSceneLaunchOptions<P>;

/**
 * What `useScene().stop` accepts beyond the scene.
 *
 * @category Scenes
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TSceneStopOptions = {
    /**
     * Covers the screen, stops the scene behind the cover and uncovers what is left: a menu that
     * closes with an iris. Without one, it is gone at once.
     */
    transition?: TTransition;
};
