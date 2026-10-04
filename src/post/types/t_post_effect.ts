import type { TLut } from '../../loaders/lut/types/t_lut';
import type { TPalette } from '../../loaders/palette/types/t_palette';
import type { TShader } from '../../loaders/shader/types/t_shader';
import type { TUniformSignature, TUniformValues } from '../../materials/types/t_uniforms';

/**
 * Who put an effect in the chain, which decides who may take it out again.
 *
 * The project's are the look of the game and go first. A scene's are its own and leave with it.
 *
 * `'transition'` is the odd one and is here so that a warning can say where the effect came from.
 * Nobody put it in the chain: a scene change is never installed, it is added in front of the chain
 * for as long as it runs and drops out on its own, so there is nothing to take out and nobody to
 * take it out.
 *
 * @category Post-processing
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TPostSource = 'project' | 'scene' | 'transition';

/**
 * An effect the game has installed: a shader that reads the finished frame and gives back what
 * should be shown instead.
 *
 * **This record is what crosses into the backend**, by reference and never copied into something
 * new. The compiled shader is cached against this object's identity, so building a fresh one each
 * frame would mean compiling each frame and never once finding the cache.
 *
 * Everything except `enabled` is read every frame, so changing a number in `uniforms` animates the
 * effect with nothing reinstalled: the same rule a material's knobs follow.
 *
 * It holds the palette or the table **as the asset**, not as an uploaded picture, because a file
 * lands after the effect was installed. Keeping the picture here would mean keeping the `null` it
 * was at the moment the effect was made.
 *
 * @typeParam U The knobs by name, so a game reads `effect.uniforms.levels` as the number it is.
 *     An engine effect such as `dither()` fills it in; one made from a file keeps the general shape,
 *     because its knobs are only known once the file arrives.
 *
 * @category Post-processing
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TPostEffect<U extends TUniformValues = TUniformValues> = {
    readonly type: 'post';
    id: string;
    /**
     * What a warning about it will call it, and what the editor lists. Never an identity.
     */
    name: string | null;
    /**
     * `fn effect(color: vec4<f32>, uv: vec2<f32>) -> vec4<f32>`, and anything it calls.
     */
    fragment: string | null;
    /**
     * The same hook in GLSL, without which the effect is WebGPU only and degrades to nothing.
     */
    fragmentGlsl: string | null;
    /**
     * The knobs. Read every frame, so writing into this is how a game drives an effect.
     */
    uniforms: U;
    /**
     * What kind each one is. Fixed when the effect is made: the block's layout depends on it.
     */
    uniformSig: TUniformSignature;
    /**
     * The colours this effect matches against, for one that reduces to a palette.
     *
     * A palette and a table are read at opposite ends of a chain and no shader is both, so an
     * effect carries at most one of the two.
     */
    palette: TPalette | null;
    /**
     * The grading table this effect looks colours up in.
     */
    lut: TLut | null;
    source: TPostSource;
    /**
     * Whether it runs. A switched-off effect stays in the chain **where it is**, so turning it back
     * on does not move it out from between the two it sat between.
     */
    enabled: boolean;
    /**
     * The file it came from, so it can be filled in when that lands.
     */
    effect: TShader | null;
};
