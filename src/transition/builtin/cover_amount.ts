/**
 * How covered the screen is right now, from the two numbers the engine hands every transition.
 *
 * **This is the whole translation, and it lives in one place on purpose.** Both halves of a
 * transition count `progress` up from 0 to 1, and `phase` says which half it is: covering, or
 * uncovering. So covering is `progress` and uncovering is what is left of it.
 *
 * The alternative, running the second half backwards from 1, is the same arithmetic and the wrong
 * picture: a wipe would come back the way it left, which reads as the screen being wiped in mirror
 * image rather than as a curtain being pulled aside.
 *
 * An effect that wants the edge to keep travelling one way (the wipe does) reads the two numbers
 * itself instead of calling this.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const COVER_AMOUNT_WGSL = /* wgsl */ `
fn coverAmount() -> f32 {
    return select(mu.progress, 1.0 - mu.progress, mu.phase > 0.5);
}
`;

/**
 * The same, in GLSL, by the same name.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const COVER_AMOUNT_GLSL = /* glsl */ `
float coverAmount() {
    return mu.phase > 0.5 ? 1.0 - mu.progress : mu.progress;
}
`;
